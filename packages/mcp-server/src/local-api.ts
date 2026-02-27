/**
 * Local API — opt-in HTTP server for the Elen Workstation.
 *
 * Activated by ELEN_LOCAL_API=true in the MCP server env.
 * Serves read-only endpoints from ~/.elen/decisions.db on port 3333.
 * Data never leaves the user's machine — the browser fetches from localhost.
 */
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://app.elen.learningnodes.com',
  'https://elen.learningnodes.com',
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

/* ── DB helpers ──────────────────────────────────── */

function openDb(dbPath: string): Database.Database | null {
  if (!existsSync(dbPath)) return null;
  try { return new Database(dbPath, { readonly: true }); }
  catch { return null; }
}

function parseRecord(row: any): any {
  if (!row) return null;
  // Try payload_json first (new schema), then record_json (old schema)
  const blob = row.payload_json || row.record_json;
  if (blob) { try { return JSON.parse(blob); } catch { /* fall through */ } }
  return {
    record_id: row.record_id, decision_id: row.decision_id,
    question_text: row.question_text, decision_text: row.decision_text,
    domain: row.domain, status: row.status, timestamp: row.timestamp,
  };
}

function recordTokenCost(record: any) {
  let chars = 0;
  chars += (record.question_text || record.question || '').length;
  chars += (record.decision_text || record.answer || '').length;
  if (record.constraints_snapshot) {
    for (const c of record.constraints_snapshot) chars += (c.description || '').length;
  }
  if (record.evidence_snapshot) {
    for (const e of record.evidence_snapshot) { chars += (e.claim || '').length; chars += (e.proof || '').length; }
  }
  chars += (record.domain || '').length;
  if (record.tags) chars += record.tags.join(' ').length;
  const outputOverhead = 200;
  return { input: Math.ceil(chars / 4), output: Math.ceil(outputOverhead / 4), total: Math.ceil((chars + outputOverhead) / 4) };
}

function getProjectId(req: express.Request): string | null {
  return (req.query.project as string) || null;
}

function emptyStats() {
  return {
    total: 0, avgConfidence: 0, thisWeek: 0, domainCount: 0,
    domains: [], confidenceDistribution: { high: 0, medium: 0, low: 0, veryLow: 0 },
    agents: [], timeline: [], tokens: { input: 0, output: 0, total: 0 }, avgTokensPerDecision: 0,
  };
}

/* ── Express app factory ─────────────────────────── */

function createLocalApiApp(dbPath: string): express.Express {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS, optionsSuccessStatus: 200 }));
  app.use(express.json());

  // Health
  app.get('/api/health', (_req, res) => {
    const dbExists = existsSync(dbPath);
    const db = openDb(dbPath);
    let recordCount = 0;
    if (db) { try { recordCount = (db.prepare('SELECT COUNT(*) AS n FROM records').get() as any)?.n || 0; } catch {} db.close(); }
    res.json({ ok: true, version: '0.1.6', db: dbPath, dbExists, recordCount });
  });

  // Projects
  app.get('/api/projects', (_req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json({ projects: [] });
    try {
      const projects = db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all() as any[];
      for (const p of projects) { p.record_count = (db.prepare('SELECT COUNT(*) AS count FROM records WHERE project_id = ?').get(p.project_id) as any)?.count || 0; }
      db.close();
      res.json({ projects });
    } catch (err: any) { try { db.close(); } catch {} res.json({ projects: [], error: err.message }); }
  });

  // Records
  app.get('/api/records', (req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json({ records: [], empty: true });
    try {
      const project = getProjectId(req);
      let query = 'SELECT * FROM records';
      const params: any = {};
      if (project) { query += ' WHERE project_id = @project'; params.project = project; }
      query += ' ORDER BY timestamp DESC LIMIT 200';
      const rows = db.prepare(query).all(params) as any[];
      db.close();
      res.json({ records: rows.map(parseRecord) });
    } catch (err: any) { try { db.close(); } catch {} res.json({ records: [], error: err.message }); }
  });

  // Stats
  app.get('/api/stats', (req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json(emptyStats());
    try {
      const project = getProjectId(req);
      const where = project ? 'WHERE project_id = @project' : '';
      const params: any = project ? { project } : {};

      const total = db.prepare(`SELECT COUNT(*) AS count FROM records ${where}`).get(params) as any;
      const domains = db.prepare(`SELECT domain, COUNT(*) AS count FROM records ${where} GROUP BY domain ORDER BY count DESC`).all(params);
      const recent = db.prepare(`SELECT COUNT(*) AS count FROM records ${where ? where + ' AND' : 'WHERE'} timestamp >= datetime('now', '-7 days')`).get(params) as any;
      const agents = db.prepare(`SELECT agent_id, COUNT(*) AS count FROM records ${where} GROUP BY agent_id ORDER BY count DESC`).all(params);
      const timeline = db.prepare(`SELECT DATE(timestamp) AS day, COUNT(*) AS count FROM records ${where ? where + ' AND' : 'WHERE'} timestamp >= datetime('now', '-30 days') GROUP BY DATE(timestamp) ORDER BY day ASC`).all(params);

      const allRows = db.prepare(`SELECT payload_json, record_json FROM records ${where}`).all(params) as any[];
      let totalTokens = { input: 0, output: 0, total: 0 };
      for (const row of allRows) {
        const rec = parseRecord(row);
        if (!rec) continue;
        const t = recordTokenCost(rec);
        totalTokens.input += t.input; totalTokens.output += t.output; totalTokens.total += t.total;
      }

      db.close();
      res.json({
        total: total.count, avgConfidence: 0, thisWeek: recent.count, domainCount: domains.length,
        domains, confidenceDistribution: { high: 0, medium: 0, low: 0, veryLow: 0 },
        agents, timeline, tokens: totalTokens,
        avgTokensPerDecision: total.count > 0 ? Math.round(totalTokens.total / total.count) : 0,
      });
    } catch (err: any) { try { db.close(); } catch {} res.json({ ...emptyStats(), error: err.message }); }
  });

  // Threads
  app.get('/api/threads', (req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json({ threads: [] });
    try {
      const project = getProjectId(req);
      let query = 'SELECT * FROM records';
      const params: any = {};
      if (project) { query += ' WHERE project_id = @project'; params.project = project; }
      query += ' ORDER BY timestamp ASC';

      const rows = db.prepare(query).all(params) as any[];
      db.close();
      const records = rows.map(parseRecord).filter(Boolean);
      const threadMap: Record<string, any> = {};

      for (const rec of records) {
        const threadId = rec.thread_id || `auto-${rec.domain || 'general'}`;
        const threadName = rec.thread_name || `${rec.domain || 'General'} Decisions`;
        if (!threadMap[threadId]) {
          threadMap[threadId] = { thread_id: threadId, thread_name: threadName, turns: [], domains: new Set(), total_confidence: 0, linked_threads: new Set(), tokens: { input: 0, output: 0, total: 0 } };
        }
        const thread = threadMap[threadId];
        thread.turns.push({ type: rec.turn_type || 'ASK', record: rec, tokens: recordTokenCost(rec) });
        thread.domains.add(rec.domain);
        const t = recordTokenCost(rec);
        thread.tokens.input += t.input; thread.tokens.output += t.output; thread.tokens.total += t.total;
      }

      const threads = Object.values(threadMap).map((t: any) => ({
        thread_id: t.thread_id, thread_name: t.thread_name, turns: t.turns,
        domains: [...t.domains],
        avg_confidence: t.turns.length ? Math.round((t.total_confidence / t.turns.length) * 100) / 100 : 0,
        status: 'resolved', linked_threads: [...t.linked_threads], has_cross_links: t.linked_threads.size > 0,
        tokens: t.tokens,
        started_at: t.turns[0]?.record?.timestamp, last_activity: t.turns[t.turns.length - 1]?.record?.timestamp,
      }));
      threads.sort((a, b) => new Date(b.last_activity || 0).getTime() - new Date(a.last_activity || 0).getTime());
      res.json({ threads });
    } catch (err: any) { res.json({ threads: [], error: err.message }); }
  });

  // Competency
  app.get('/api/competency/:agentId', (req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json({ domains: [], strengths: [], weaknesses: [] });
    try {
      const rows = db.prepare('SELECT domain FROM records WHERE agent_id = ?').all([req.params.agentId]) as any[];
      db.close();
      const scoresByDomain: Record<string, number> = {};
      for (const row of rows) { scoresByDomain[row.domain] = (scoresByDomain[row.domain] || 0) + 1; }
      const domains = Object.keys(scoresByDomain);
      res.json({ agentId: req.params.agentId, domains, strengths: domains, weaknesses: [], totalDecisions: rows.length });
    } catch (err: any) { try { db.close(); } catch {} res.json({ domains: [], strengths: [], weaknesses: [], error: err.message }); }
  });

  // Usage / Citations
  app.get('/api/usage', (req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json({ citations: [], stats: { totalCitations: 0, uniqueCited: 0, uncited: 0 } });
    try {
      const rows = db.prepare('SELECT payload_json, record_json FROM records ORDER BY timestamp ASC').all() as any[];
      db.close();
      const records = rows.map(parseRecord).filter(Boolean);
      const citationCount: Record<string, { count: number; citedBy: any[] }> = {};
      for (const rec of records) {
        if (!citationCount[rec.record_id || rec.decision_id]) citationCount[rec.record_id || rec.decision_id] = { count: 0, citedBy: [] };
        for (const ref of (rec.refs || rec.linked_records || [])) {
          if (!citationCount[ref]) citationCount[ref] = { count: 0, citedBy: [] };
          citationCount[ref].count++;
        }
      }
      const citations = Object.entries(citationCount).map(([id, data]) => ({ record_id: id, times_cited: data.count })).sort((a, b) => b.times_cited - a.times_cited);
      const cited = citations.filter(c => c.times_cited > 0);
      res.json({ citations, stats: { totalDecisions: records.length, totalCitations: cited.reduce((s, c) => s + c.times_cited, 0), uniqueCited: cited.length, uncited: citations.length - cited.length } });
    } catch (err: any) { res.json({ citations: [], stats: { totalCitations: 0, uniqueCited: 0, uncited: 0 }, error: err.message }); }
  });

  // Precedent Rate
  app.get('/api/precedent-rate', (_req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json({ totalSearches: 0, hitRate: 0 });
    try {
      const total = db.prepare('SELECT COUNT(*) AS count FROM search_log').get() as any;
      const withHits = db.prepare('SELECT COUNT(*) AS count FROM search_log WHERE hits > 0').get() as any;
      db.close();
      res.json({ totalSearches: total.count, searchesWithHits: withHits.count, hitRate: total.count > 0 ? Math.round((withHits.count / total.count) * 100) : 0 });
    } catch (err: any) { try { db.close(); } catch {} res.json({ totalSearches: 0, hitRate: 0, error: err.message }); }
  });

  // Efficiency
  app.get('/api/efficiency', (_req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json({ roiRatio: 0, timeline: [] });
    try {
      const totalRecords = (db.prepare('SELECT COUNT(*) AS count FROM records').get() as any).count;
      db.close();
      const TOKENS_PER_RECORD = 200;
      const totalCost = totalRecords * TOKENS_PER_RECORD;
      res.json({ totalCost, totalSavings: 0, roiRatio: 0, totalRecords, totalSearches: 0, totalCitations: 0, timeline: [] });
    } catch (err: any) { try { db.close(); } catch {} res.json({ roiRatio: 0, timeline: [], error: err.message }); }
  });

  // Skill Suggestions
  app.get('/api/skill-suggestions', (_req, res) => {
    const db = openDb(dbPath);
    if (!db) return res.json({ suggestions: [] });
    try {
      const allRows = db.prepare('SELECT payload_json, record_json FROM records').all() as any[];
      db.close();
      const records = allRows.map(parseRecord).filter(Boolean);
      const suggestions: any[] = [];
      // Domain clustering
      const domainCounts: Record<string, number> = {};
      for (const r of records) { domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1; }
      for (const [domain, count] of Object.entries(domainCounts)) {
        if (count >= 5) {
          suggestions.push({ type: 'domain-cluster', icon: '🎯', priority: count, count, domain, message: `${count} decisions in "${domain}" — consider creating a reusable skill.` });
        }
      }
      suggestions.sort((a, b) => b.priority - a.priority);
      res.json({ suggestions: suggestions.slice(0, 10) });
    } catch (err: any) { res.json({ suggestions: [], error: err.message }); }
  });

  return app;
}

/* ── Public API ───────────────────────────────────── */

export function startLocalApi(dbPath: string, port: number = 3333): void {
  const app = createLocalApiApp(dbPath);
  app.listen(port, () => {
    // Write to stderr so it doesn't interfere with MCP stdio on stdout
    process.stderr.write(`\n  ✦ Elen Local API running at http://localhost:${port}\n`);
    process.stderr.write(`  ✦ Reading from ${dbPath}\n`);
    process.stderr.write(`  ✦ Open app.elen.learningnodes.com to view your workstation\n\n`);
  });
}
