#!/usr/bin/env node
'use strict';

/**
 * @learningnodes/elen-local-api
 *
 * Lightweight read-only HTTP server that exposes your local Elen decisions.db
 * for the cloud-hosted Elen Dashboard at visualize.elen.app (or wherever it's deployed).
 *
 * Your data never leaves your machine. The browser fetches directly from localhost.
 *
 * Usage:
 *   npx @learningnodes/elen-local-api
 *   # or
 *   node index.js
 *
 * Env vars:
 *   ELEN_DB        — path to decisions.db (default: ~/.elen/decisions.db)
 *   ELEN_API_PORT  — port to listen on   (default: 3333)
 *   ELEN_ORIGINS   — extra comma-separated allowed CORS origins
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { homedir } = require('os');

const PORT = parseInt(process.env.ELEN_API_PORT || '3333', 10);
const DB_PATH = process.env.ELEN_DB || path.join(homedir(), '.elen', 'decisions.db');

// Allow the cloud dashboard + any local origin
const ALLOWED_ORIGINS = [
    'https://visualize.elen.app',
    'https://elen.learningnodes.com',
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];
if (process.env.ELEN_ORIGINS) {
    process.env.ELEN_ORIGINS.split(',').forEach(o => ALLOWED_ORIGINS.push(o.trim()));
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS, optionsSuccessStatus: 200 }));
app.use(express.json());

/* ── DB helpers ──────────────────────────────────────── */

function openDb() {
    if (!fs.existsSync(DB_PATH)) return null;
    try {
        return new Database(DB_PATH, { readonly: true });
    } catch {
        return null;
    }
}

function parseRecord(row) {
    if (!row) return null;
    if (row.record_json) {
        try { return JSON.parse(row.record_json); } catch { /* fall through */ }
    }
    return {
        record_id: row.record_id,
        question: row.question,
        answer: row.answer,
        domain: row.domain,
        confidence: row.confidence,
        published_at: row.published_at,
    };
}

function recordTokenCost(record) {
    let chars = 0;
    chars += (record.question || '').length;
    chars += (record.answer || '').length;
    if (record.constraints_snapshot) {
        for (const c of record.constraints_snapshot) chars += (c.description || '').length;
    }
    if (record.evidence_snapshot) {
        for (const e of record.evidence_snapshot) {
            chars += (e.claim || '').length;
            chars += (e.proof || '').length;
        }
    }
    chars += (record.domain || '').length;
    if (record.tags) chars += record.tags.join(' ').length;
    const outputOverhead = 200;
    return {
        input: Math.ceil(chars / 4),
        output: Math.ceil(outputOverhead / 4),
        total: Math.ceil((chars + outputOverhead) / 4),
    };
}

function ensureMigrated(db) {
    try {
        const cols = db.pragma('table_info(records)');
        const hasProject = cols.some(c => c.name === 'project_id');
        if (!hasProject) return; // read-only, can't migrate — just skip gracefully
        db.exec("CREATE INDEX IF NOT EXISTS idx_records_project ON records(project_id)");
    } catch { /* readonly — no-op */ }
}

function getProjectId(req) {
    return req.query.project || null;
}

function emptyStats() {
    return {
        total: 0, avgConfidence: 0, thisWeek: 0, domainCount: 0,
        domains: [], confidenceDistribution: { high: 0, medium: 0, low: 0, veryLow: 0 },
        agents: [], timeline: [], tokens: { input: 0, output: 0, total: 0 }, avgTokensPerDecision: 0,
    };
}

/* ── Routes ─────────────────────────────────────────── */

// Health — lets the dashboard know the local API is running
app.get('/api/health', (_req, res) => {
    const dbExists = fs.existsSync(DB_PATH);
    const db = openDb();
    let recordCount = 0;
    if (db) {
        try { recordCount = db.prepare('SELECT COUNT(*) AS n FROM records').get()?.n || 0; } catch { }
        db.close();
    }
    res.json({
        ok: true,
        version: require('./package.json').version,
        db: DB_PATH,
        dbExists,
        recordCount,
    });
});

// Projects
app.get('/api/projects', (_req, res) => {
    const db = openDb();
    if (!db) return res.json({ projects: [] });
    try {
        ensureMigrated(db);
        const projects = db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all();
        for (const p of projects) {
            const row = db.prepare('SELECT COUNT(*) AS count FROM records WHERE project_id = ?').get(p.project_id);
            p.record_count = row?.count || 0;
        }
        db.close();
        res.json({ projects });
    } catch (err) {
        try { db.close(); } catch { }
        res.json({ projects: [], error: err.message });
    }
});

// Records
app.get('/api/records', (req, res) => {
    const db = openDb();
    if (!db) return res.json({ records: [], empty: true });
    try {
        ensureMigrated(db);
        const project = getProjectId(req);
        let query = 'SELECT * FROM records';
        const params = {};
        if (project) { query += ' WHERE project_id = @project'; params.project = project; }
        query += ' ORDER BY published_at DESC LIMIT 200';
        const rows = db.prepare(query).all(params);
        db.close();
        res.json({ records: rows.map(parseRecord) });
    } catch (err) {
        try { db.close(); } catch { }
        res.json({ records: [], error: err.message });
    }
});

// Stats
app.get('/api/stats', (req, res) => {
    const db = openDb();
    if (!db) return res.json(emptyStats());
    try {
        ensureMigrated(db);
        const project = getProjectId(req);
        const where = project ? 'WHERE project_id = @project' : '';
        const params = project ? { project } : {};

        const total = db.prepare(`SELECT COUNT(*) AS count FROM records ${where}`).get(params);
        const avgConf = db.prepare(`SELECT AVG(confidence) AS avg FROM records ${where}`).get(params);
        const domains = db.prepare(`SELECT domain, COUNT(*) AS count FROM records ${where} GROUP BY domain ORDER BY count DESC`).all(params);
        const recent = db.prepare(`SELECT COUNT(*) AS count FROM records ${where ? where + ' AND' : 'WHERE'} published_at >= datetime('now', '-7 days')`).get(params);
        const confDist = db.prepare(`
            SELECT
                SUM(CASE WHEN confidence >= 0.9 THEN 1 ELSE 0 END) AS high,
                SUM(CASE WHEN confidence >= 0.7 AND confidence < 0.9 THEN 1 ELSE 0 END) AS medium,
                SUM(CASE WHEN confidence >= 0.5 AND confidence < 0.7 THEN 1 ELSE 0 END) AS low,
                SUM(CASE WHEN confidence < 0.5 THEN 1 ELSE 0 END) AS veryLow
            FROM records ${where}
        `).get(params);
        const agents = db.prepare(`SELECT agent_id, COUNT(*) AS count FROM records ${where} GROUP BY agent_id ORDER BY count DESC`).all(params);
        const timeline = db.prepare(`
            SELECT DATE(published_at) AS day, COUNT(*) AS count
            FROM records ${where ? where + ' AND' : 'WHERE'} published_at >= datetime('now', '-30 days')
            GROUP BY DATE(published_at) ORDER BY day ASC
        `).all(params);

        const allRows = db.prepare(`SELECT record_json FROM records ${where}`).all(params);
        let totalTokens = { input: 0, output: 0, total: 0 };
        for (const row of allRows) {
            const rec = parseRecord(row);
            if (!rec) continue;
            const t = recordTokenCost(rec);
            totalTokens.input += t.input;
            totalTokens.output += t.output;
            totalTokens.total += t.total;
        }

        db.close();
        res.json({
            total: total.count,
            avgConfidence: avgConf.avg || 0,
            thisWeek: recent.count,
            domainCount: domains.length,
            domains, confidenceDistribution: confDist, agents, timeline,
            tokens: totalTokens,
            avgTokensPerDecision: total.count > 0 ? Math.round(totalTokens.total / total.count) : 0,
        });
    } catch (err) {
        try { db.close(); } catch { }
        res.json({ ...emptyStats(), error: err.message });
    }
});

// Threads
app.get('/api/threads', (req, res) => {
    const db = openDb();
    if (!db) return res.json({ threads: [] });
    try {
        ensureMigrated(db);
        const project = getProjectId(req);
        let query = 'SELECT * FROM records';
        const params = {};
        if (project) { query += ' WHERE project_id = @project'; params.project = project; }
        query += ' ORDER BY published_at ASC';

        const rows = db.prepare(query).all(params);
        db.close();
        const records = rows.map(parseRecord).filter(Boolean);
        const threadMap = {};

        for (const rec of records) {
            const threadId = rec.thread_id || `auto-${rec.domain || 'general'}`;
            const threadName = rec.thread_name || `${rec.domain || 'General'} Decisions`;
            if (!threadMap[threadId]) {
                threadMap[threadId] = {
                    thread_id: threadId, thread_name: threadName,
                    turns: [], domains: new Set(), total_confidence: 0,
                    linked_threads: new Set(), tokens: { input: 0, output: 0, total: 0 },
                };
            }
            const thread = threadMap[threadId];
            thread.turns.push({ type: rec.turn_type || 'ASK', record: rec, tokens: recordTokenCost(rec) });
            thread.domains.add(rec.domain);
            thread.total_confidence += rec.confidence || 0;
            if (rec.linked_records?.length) {
                for (const linkedId of rec.linked_records) {
                    const other = records.find(r => r.record_id === linkedId);
                    if (other && other.thread_id && other.thread_id !== threadId) {
                        thread.linked_threads.add(other.thread_id);
                    }
                }
            }
            const t = recordTokenCost(rec);
            thread.tokens.input += t.input;
            thread.tokens.output += t.output;
            thread.tokens.total += t.total;
        }

        const threads = Object.values(threadMap).map(t => ({
            thread_id: t.thread_id, thread_name: t.thread_name, turns: t.turns,
            domains: [...t.domains],
            avg_confidence: t.turns.length ? Math.round((t.total_confidence / t.turns.length) * 100) / 100 : 0,
            status: 'resolved',
            linked_threads: [...t.linked_threads],
            has_cross_links: t.linked_threads.size > 0,
            tokens: t.tokens,
            started_at: t.turns[0]?.record?.published_at,
            last_activity: t.turns[t.turns.length - 1]?.record?.published_at,
        }));
        threads.sort((a, b) => new Date(b.last_activity) - new Date(a.last_activity));
        res.json({ threads });
    } catch (err) {
        res.json({ threads: [], error: err.message });
    }
});

// Competency
app.get('/api/competency/:agentId', (req, res) => {
    const db = openDb();
    if (!db) return res.json({ domains: [], strengths: [], weaknesses: [] });
    try {
        const project = getProjectId(req);
        let query = 'SELECT domain, confidence FROM records WHERE agent_id = @agentId';
        const params = { agentId: req.params.agentId };
        if (project) { query += ' AND project_id = @project'; params.project = project; }
        query += ' ORDER BY published_at DESC';

        const rows = db.prepare(query).all(params);
        db.close();

        const scoresByDomain = {};
        for (const row of rows) {
            if (!scoresByDomain[row.domain]) scoresByDomain[row.domain] = [];
            scoresByDomain[row.domain].push(row.confidence);
        }
        const domains = Object.keys(scoresByDomain);
        const strengths = [], weaknesses = [], domainDetails = [];
        for (const [domain, scores] of Object.entries(scoresByDomain)) {
            const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
            domainDetails.push({ domain, avg: Math.round(avg * 100) / 100, count: scores.length });
            if (avg >= 0.8) strengths.push(domain);
            if (avg < 0.65) weaknesses.push(domain);
        }
        res.json({ agentId: req.params.agentId, domains, strengths, weaknesses, domainDetails, totalDecisions: rows.length });
    } catch (err) {
        res.json({ domains: [], strengths: [], weaknesses: [], error: err.message });
    }
});

// Usage / Citations
app.get('/api/usage', (req, res) => {
    const db = openDb();
    if (!db) return res.json({ citations: [], stats: { totalCitations: 0, uniqueCited: 0, uncited: 0 } });
    try {
        const project = getProjectId(req);
        let query = 'SELECT record_json FROM records';
        const params = {};
        if (project) { query += ' WHERE project_id = @project'; params.project = project; }
        query += ' ORDER BY published_at ASC';

        const rows = db.prepare(query).all(params);
        db.close();
        const records = rows.map(r => { try { return JSON.parse(r.record_json); } catch { return null; } }).filter(Boolean);

        const citationCount = {};
        const recordMeta = {};
        for (const rec of records) {
            recordMeta[rec.record_id] = {
                question: rec.question, domain: rec.domain,
                confidence: rec.confidence, thread_name: rec.thread_name || 'Unknown',
                turn_type: rec.turn_type || 'ASK',
            };
            if (!citationCount[rec.record_id]) citationCount[rec.record_id] = { count: 0, citedBy: [] };
            if (rec.linked_records?.length) {
                for (const linkedId of rec.linked_records) {
                    if (!citationCount[linkedId]) citationCount[linkedId] = { count: 0, citedBy: [] };
                    citationCount[linkedId].count++;
                    citationCount[linkedId].citedBy.push({ record_id: rec.record_id, question: rec.question?.slice(0, 60), thread_name: rec.thread_name });
                }
            }
        }

        const citations = Object.entries(citationCount)
            .filter(([id]) => recordMeta[id])
            .map(([id, data]) => ({ record_id: id, ...recordMeta[id], times_cited: data.count, cited_by: data.citedBy }))
            .sort((a, b) => b.times_cited - a.times_cited);

        const cited = citations.filter(c => c.times_cited > 0);
        const uncited = citations.filter(c => c.times_cited === 0);
        const influencers = cited.filter(c => c.turn_type === 'DECISION' || c.turn_type === 'RECORD');
        res.json({
            citations,
            stats: {
                totalDecisions: records.length,
                totalCitations: cited.reduce((s, c) => s + c.times_cited, 0),
                uniqueCited: cited.length, uncited: uncited.length,
                citationRate: records.length > 0 ? Math.round((cited.length / records.length) * 100) : 0,
                topCited: cited.slice(0, 3), influencers: influencers.length,
            },
        });
    } catch (err) {
        res.json({ citations: [], stats: { totalCitations: 0, uniqueCited: 0, uncited: 0 }, error: err.message });
    }
});

// Precedent Rate (search log)
app.get('/api/precedent-rate', (req, res) => {
    const db = openDb();
    if (!db) return res.json({ totalSearches: 0, hitRate: 0 });
    try {
        const project = getProjectId(req);
        const where = project ? 'WHERE project_id = @project' : '';
        const params = project ? { project } : {};

        const total = db.prepare(`SELECT COUNT(*) AS count FROM search_log ${where}`).get(params);
        const withHits = db.prepare(`SELECT COUNT(*) AS count FROM search_log ${where ? where + ' AND' : 'WHERE'} hits > 0`).get(params);
        const sums = db.prepare(`SELECT COALESCE(SUM(hits), 0) AS total_hits, COALESCE(SUM(cross_project_hits), 0) AS cross_hits FROM search_log ${where}`).get(params);
        const recent = db.prepare(`SELECT query, domain, hits, cross_project_hits, searched_at FROM search_log ${where} ORDER BY searched_at DESC LIMIT 20`).all(params);
        const recentCnt = db.prepare(`SELECT COUNT(*) AS count FROM search_log ${where ? where + ' AND' : 'WHERE'} searched_at >= datetime('now', '-7 days')`).get(params);
        db.close();

        const TOKENS_PER_HIT = 200;
        res.json({
            totalSearches: total.count,
            searchesWithHits: withHits.count,
            hitRate: total.count > 0 ? Math.round((withHits.count / total.count) * 100) : 0,
            totalHits: sums.total_hits, crossProjectHits: sums.cross_hits,
            avgHitsPerSearch: total.count > 0 ? Math.round((sums.total_hits / total.count) * 10) / 10 : 0,
            thisWeek: recentCnt.count,
            tokensSaved: sums.total_hits * TOKENS_PER_HIT,
            recentSearches: recent,
        });
    } catch (err) {
        try { db.close(); } catch { }
        res.json({ totalSearches: 0, hitRate: 0, error: err.message });
    }
});

// Efficiency / ROI
app.get('/api/efficiency', (req, res) => {
    const db = openDb();
    if (!db) return res.json({ roiRatio: 0, timeline: [] });
    try {
        const project = getProjectId(req);
        const where = project ? 'WHERE project_id = @project' : '';
        const params = project ? { project } : {};

        const TOKENS_PER_RECORD = 200;
        const TOKENS_PER_SEARCH = 50;
        const TOKENS_SAVED_PER_HIT = 500;

        const totalRecords = db.prepare(`SELECT COUNT(*) AS count FROM records ${where}`).get(params);
        const totalSearches = db.prepare(`SELECT COUNT(*) AS count FROM search_log ${where}`).get(params);

        const allRows = db.prepare(`SELECT record_json FROM records ${where}`).all(params);
        let totalCitations = 0;
        for (const row of allRows) {
            try {
                const rec = JSON.parse(row.record_json);
                if (rec.linked_records?.length) totalCitations += rec.linked_records.length;
            } catch { }
        }

        const totalCost = (totalRecords.count * TOKENS_PER_RECORD) + (totalSearches.count * TOKENS_PER_SEARCH);
        const totalSavings = totalCitations * TOKENS_SAVED_PER_HIT;
        const roiRatio = totalCost > 0 ? Math.round((totalSavings / totalCost) * 100) / 100 : 0;

        const weeklyTimeline = [];
        let cumulativeCost = 0, cumulativeSavings = 0;
        for (let w = 11; w >= 0; w--) {
            const weekStart = `datetime('now', '-${(w + 1) * 7} days')`;
            const weekEnd = `datetime('now', '-${w * 7} days')`;
            const weekFilter = where
                ? `${where} AND published_at >= ${weekStart} AND published_at < ${weekEnd}`
                : `WHERE published_at >= ${weekStart} AND published_at < ${weekEnd}`;
            const searchFilter = where
                ? `${where} AND searched_at >= ${weekStart} AND searched_at < ${weekEnd}`
                : `WHERE searched_at >= ${weekStart} AND searched_at < ${weekEnd}`;

            const wRecords = db.prepare(`SELECT COUNT(*) AS count FROM records ${weekFilter}`).get(params);
            const wSearches = db.prepare(`SELECT COUNT(*) AS count FROM search_log ${searchFilter}`).get(params);
            const wRows = db.prepare(`SELECT record_json FROM records ${weekFilter}`).all(params);
            let wCitations = 0;
            for (const row of wRows) {
                try { const rec = JSON.parse(row.record_json); if (rec.linked_records?.length) wCitations += rec.linked_records.length; } catch { }
            }

            const weekCost = (wRecords.count * TOKENS_PER_RECORD) + (wSearches.count * TOKENS_PER_SEARCH);
            const weekSavings = wCitations * TOKENS_SAVED_PER_HIT;
            cumulativeCost += weekCost;
            cumulativeSavings += weekSavings;

            weeklyTimeline.push({
                weekAgo: w, records: wRecords.count, searches: wSearches.count, citations: wCitations,
                cost: weekCost, savings: weekSavings,
                cumulativeRoi: cumulativeCost > 0 ? Math.round((cumulativeSavings / cumulativeCost) * 100) / 100 : 0,
            });
        }

        const tenPct = Math.max(1, Math.floor(allRows.length * 0.1));
        const countLinks = batch => batch.reduce((sum, row) => { try { const r = JSON.parse(row.record_json); return sum + (r.linked_records?.length || 0); } catch { return sum; } }, 0);

        db.close();
        res.json({
            totalCost, totalSavings, roiRatio, isReturning: roiRatio >= 1,
            costPerRecord: TOKENS_PER_RECORD, savingsPerCitation: TOKENS_SAVED_PER_HIT,
            totalRecords: totalRecords.count, totalSearches: totalSearches.count, totalCitations,
            marginalValue: {
                first10pct: tenPct > 0 ? countLinks(allRows.slice(0, tenPct)) / tenPct : 0,
                last10pct: tenPct > 0 ? countLinks(allRows.slice(-tenPct)) / tenPct : 0,
            },
            timeline: weeklyTimeline,
        });
    } catch (err) {
        try { db.close(); } catch { }
        res.json({ roiRatio: 0, timeline: [], error: err.message });
    }
});

// Skill Suggestions
app.get('/api/skill-suggestions', (req, res) => {
    const db = openDb();
    if (!db) return res.json({ suggestions: [] });
    try {
        const project = getProjectId(req);
        const where = project ? 'WHERE project_id = @project' : '';
        const params = project ? { project } : {};

        const allRows = db.prepare(`SELECT record_json FROM records ${where}`).all(params);
        db.close();
        const records = allRows.map(row => { try { return JSON.parse(row.record_json); } catch { return null; } }).filter(Boolean);
        const suggestions = [];

        // Signal 1: error resolution patterns
        const ERR_RE = /\b(error|bug|fix|fail|broke|crash|handle|issue|lint|resolve|debug|exception|constraint|missing|undefined|null|invalid)\b/i;
        const errorsByDomain = {};
        for (const r of records.filter(r => ERR_RE.test(r.question || '') && r.confidence >= 0.8)) {
            const d = r.domain || 'general';
            if (!errorsByDomain[d]) errorsByDomain[d] = [];
            errorsByDomain[d].push(r);
        }
        for (const [domain, recs] of Object.entries(errorsByDomain)) {
            const examples = recs.slice(0, 2).map(r => `"${(r.question || '').slice(0, 55)}"`).join(', ');
            suggestions.push({
                type: 'error-resolution', icon: '🔧', priority: recs.length * 3,
                count: recs.length, domain,
                message: recs.length >= 2
                    ? `${recs.length} error resolutions in "${domain}" — codify as a reusable skill. e.g. ${examples}`
                    : `"${(recs[0].question || '').slice(0, 60)}" — resolved at ${Math.round(recs[0].confidence * 100)}% confidence.`,
                examples: recs.slice(0, 3).map(r => ({ question: r.question, answer: (r.answer || '').slice(0, 100) })),
            });
        }

        // Signal 2: domain coupling propagation rules
        const domainPairs = {};
        for (const r of records) {
            for (const linkedId of r.linked_records || []) {
                const linked = records.find(x => x.record_id === linkedId);
                if (linked?.domain && r.domain && linked.domain !== r.domain) {
                    const pair = [r.domain, linked.domain].sort().join(' ↔ ');
                    if (!domainPairs[pair]) domainPairs[pair] = { count: 0, domains: [r.domain, linked.domain].sort() };
                    domainPairs[pair].count++;
                }
            }
        }
        for (const [, data] of Object.entries(domainPairs)) {
            if (data.count >= 10) {
                const pct = Math.round((data.count / (records.length || 1)) * 100);
                suggestions.push({
                    type: 'propagation-rule', icon: '🔀', priority: data.count, count: data.count, domains: data.domains, coupling: pct,
                    message: `"${data.domains[0]}" and "${data.domains[1]}" are coupled in ${data.count} decisions (${pct}%). Check both when changing either.`,
                });
            }
        }

        // Signal 3: workflow preferences
        const starters = {};
        for (const r of records) {
            const words = (r.question || '').toLowerCase().split(/\s+/);
            if (words.length < 4) continue;
            const key = words.slice(0, 4).join(' ');
            if (key.length < 10) continue;
            if (!starters[key]) starters[key] = { count: 0, domains: new Set(), examples: [], answers: new Set() };
            starters[key].count++;
            starters[key].domains.add(r.domain || 'general');
            if (starters[key].examples.length < 3) starters[key].examples.push((r.question || '').slice(0, 80));
            starters[key].answers.add((r.answer || '').slice(0, 40));
        }
        for (const [pattern, data] of Object.entries(starters)) {
            if (data.count >= 3 && data.domains.size >= 2) {
                const sameAnswer = data.answers.size === 1;
                suggestions.push({
                    type: 'workflow-preference', icon: '📋', priority: data.count * data.domains.size,
                    count: data.count, domainCount: data.domains.size, examples: data.examples,
                    message: sameAnswer
                        ? `"${pattern}…" appears ${data.count}x with consistent answers — codify as a default policy.`
                        : `"${pattern}…" appears ${data.count}x across ${[...data.domains].join(', ')} — workflow template candidate.`,
                });
            }
        }

        suggestions.sort((a, b) => b.priority - a.priority);
        res.json({ suggestions: suggestions.slice(0, 10) });
    } catch (err) {
        res.json({ suggestions: [], error: err.message });
    }
});

/* ── Start ─────────────────────────────────────────── */

app.listen(PORT, () => {
    const dbStatus = fs.existsSync(DB_PATH) ? '✓' : '✗ (not found yet)';
    console.log(`\n  ✦ Elen Local API running at http://localhost:${PORT}`);
    console.log(`  ✦ Reading from ${DB_PATH} ${dbStatus}`);
    console.log(`  ✦ Open visualize.elen.app to view your dashboard\n`);
});
