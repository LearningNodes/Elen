#!/usr/bin/env node
/**
 * elen-ingest — Extract decision records from IDE conversation history
 *
 * Strategy A (shipped): Mine step outputs from .system_generated/steps
 * Strategy B(stub):    Mine artifacts(task.md, implementation_plan.md, walkthrough.md)
    *
 * Usage:
 * node ingest.js                                    # scan default brain dir
    * node ingest.js--brain - dir / path / to / brain         # custom brain dir
        * node ingest.js--since 24h                        # only recent conversations
            * node ingest.js--since 7d                         # last 7 days
                * node ingest.js--dry - run                          # preview without inserting
                    * node ingest.js--project marketplace - repos        # override project_id
                        */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

/* ── CLI Args ─────────────────────────────────────── */

const args = process.argv.slice(2);

function getArg(name, defaultVal) {
    const idx = args.indexOf(`--${name}`);
    if (idx === -1) return defaultVal;
    return args[idx + 1] || defaultVal;
}

const BRAIN_DIR = getArg('brain-dir', path.join(os.homedir(), '.gemini', 'antigravity', 'brain'));
const DB_PATH = getArg('db', path.join(os.homedir(), '.elen', 'decisions.db'));
const DRY_RUN = args.includes('--dry-run');
const PROJECT_OVERRIDE = getArg('project', null);
const SINCE = getArg('since', null);

/* ── Source Interface ─────────────────────────────── */

/**
 * A Source extracts candidate decision records from conversation data.
 * Each source implements extract() which returns an array of CandidateRecord.
 *
 * Strategy A: StepOutputSource — parses MCP tool output JSON
 * Strategy B: ArtifactSource  — mines markdown artifacts (future)
 */

/**
 * @typedef {Object} CandidateRecord
 * @property {string} record_id
 * @property {string} decision_id
 * @property {string} agent_id
 * @property {string} question
 * @property {string} answer
 * @property {string} domain
 * @property {number} confidence
 * @property {string[]} tags
 * @property {Object[]} evidence_snapshot
 * @property {Object[]} constraints_snapshot
 * @property {Object[]} checks_snapshot
 * @property {string} published_at
 * @property {string|null} expires_at
 * @property {string} validation_type
 * @property {string} source_type — 'step_output' | 'artifact' | 'dialogue'
 * @property {string} conversation_id — which conversation this came from
 * @property {string|null} inferred_project — best-guess project_id
 */

/* ── Strategy A: Step Output Source ───────────────── */

class StepOutputSource {
    constructor(brainDir) {
        this.brainDir = brainDir;
        this.name = 'step_output';
    }

    /**
     * Walk all conversations and extract records from step output files
     * @param {string[]} conversationDirs - filtered conversation directories
     * @returns {CandidateRecord[]}
     */
    extract(conversationDirs) {
        const candidates = [];

        for (const convDir of conversationDirs) {
            const convId = path.basename(convDir);
            const stepsDir = path.join(convDir, '.system_generated', 'steps');

            if (!fs.existsSync(stepsDir)) continue;

            const stepDirs = fs.readdirSync(stepsDir, { withFileTypes: true })
                .filter(d => d.isDirectory());

            for (const stepDir of stepDirs) {
                const outputPath = path.join(stepsDir, stepDir.name, 'output.txt');
                if (!fs.existsSync(outputPath)) continue;

                try {
                    const raw = fs.readFileSync(outputPath, 'utf-8');
                    const json = JSON.parse(raw);

                    // Validate it has the Elen record schema
                    if (!json.record_id || !json.question || !json.answer || !json.decision_id) {
                        continue;
                    }

                    candidates.push({
                        ...json,
                        source_type: this.name,
                        conversation_id: convId,
                        inferred_project: this.inferProject(convDir, json)
                    });
                } catch {
                    // Skip non-JSON or malformed files
                }
            }
        }

        return candidates;
    }

    /**
     * Infer project_id from conversation context
     * Priority: (1) tags mentioning a project, (2) artifact content, (3) conversation dir name
     */
    inferProject(convDir, record) {
        // Check if record itself has project info
        if (record.project_id && record.project_id !== 'default') {
            return record.project_id;
        }

        // Try to read implementation_plan.md for project hints
        const planPath = path.join(convDir, 'implementation_plan.md');
        if (fs.existsSync(planPath)) {
            try {
                const content = fs.readFileSync(planPath, 'utf-8').slice(0, 500).toLowerCase();
                // Look for common project names in the plan
                if (content.includes('elen')) return 'Elen';
                if (content.includes('marketplace')) return 'marketplace-repos';
                if (content.includes('workstation')) return 'workstation';
                if (content.includes('vectormcp')) return 'vectormcp';
            } catch { /* skip */ }
        }

        // Try task.md
        const taskPath = path.join(convDir, 'task.md');
        if (fs.existsSync(taskPath)) {
            try {
                const content = fs.readFileSync(taskPath, 'utf-8').slice(0, 500).toLowerCase();
                if (content.includes('elen')) return 'Elen';
                if (content.includes('marketplace')) return 'marketplace-repos';
                if (content.includes('workstation')) return 'workstation';
                if (content.includes('equiflow') || content.includes('matched')) return 'equiflow-matched';
            } catch { /* skip */ }
        }

        return null;
    }
}

/* ── Strategy B: Artifact Source (STUB) ───────────── */

class ArtifactSource {
    constructor(brainDir) {
        this.brainDir = brainDir;
        this.name = 'artifact';
    }

    /**
     * Extract decisions from markdown artifacts.
     * STUB — to be implemented in Strategy B.
     *
     * Extraction heuristics (from user's decision signals):
     *   Signal 1: Explicit approval
     *     - implementation_plan.md → accepted plans (user said "proceed")
     *     - task.md → completed [x] items = implemented decisions
     *
     *   Signal 2: Error resolution
     *     - walkthrough.md → "bug fixed", "resolved", error patterns
     *     - task.md.resolved.* → diff between versions shows error→fix
     *
     * Each extracted decision becomes a CandidateRecord with:
     *   - question: inferred from heading or checklist item
     *   - answer: inferred from the resolution or completion
     *   - evidence: pulled from walkthrough validation sections
     *   - confidence: lower (0.5-0.7) since inferred, not explicitly logged
     *   - source_type: 'artifact'
     *
     * @param {string[]} conversationDirs
     * @returns {CandidateRecord[]}
     */
    extract(conversationDirs) {
        // TODO: implement artifact mining
        console.log('  ⚠ ArtifactSource not yet implemented — skipping');
        return [];
    }
}

/* ── Database Operations ──────────────────────────── */

function openDb(dbPath) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return new Database(dbPath);
}

function getExistingRecordIds(db) {
    try {
        const rows = db.prepare('SELECT record_id FROM records').all();
        return new Set(rows.map(r => r.record_id));
    } catch {
        return new Set();
    }
}

function ensureProject(db, projectId, displayName) {
    const existing = db.prepare('SELECT 1 FROM projects WHERE project_id = ?').get(projectId);
    if (!existing) {
        db.prepare(
            'INSERT INTO projects (project_id, display_name, source_hint, created_at) VALUES (?, ?, ?, ?)'
        ).run(
            projectId,
            displayName || projectId.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
            'ingest-cli',
            new Date().toISOString()
        );
    }
}

function insertRecord(db, candidate, projectId) {
    // Insert decision FIRST (records.decision_id has FK to decisions.decision_id)
    db.prepare(`
        INSERT OR IGNORE INTO decisions (
            decision_id, agent_id, domain, project_id,
            parent_prompt, created_at, decision_json
        ) VALUES (
            @decision_id, @agent_id, @domain, @project_id,
            @parent_prompt, @created_at, @decision_json
        )
    `).run({
        decision_id: candidate.decision_id,
        agent_id: candidate.agent_id || 'unknown',
        domain: candidate.domain || 'general',
        project_id: projectId,
        parent_prompt: null,
        created_at: candidate.published_at || new Date().toISOString(),
        decision_json: JSON.stringify(candidate)
    });

    // Then insert the record
    const record = {
        record_id: candidate.record_id,
        decision_id: candidate.decision_id,
        agent_id: candidate.agent_id || 'unknown',
        domain: candidate.domain || 'general',
        project_id: projectId,
        question: candidate.question,
        answer: candidate.answer,
        confidence: candidate.confidence || 0.5,
        tags: JSON.stringify(candidate.tags || []),
        evidence_text: (candidate.evidence_snapshot || []).map(e => `${e.claim} ${e.proof || ''}`).join(' '),
        published_at: candidate.published_at || new Date().toISOString(),
        record_json: JSON.stringify({ ...candidate, project_id: projectId })
    };

    db.prepare(`
        INSERT OR IGNORE INTO records (
            record_id, decision_id, agent_id, domain, project_id,
            question, answer, confidence, tags, evidence_text,
            published_at, record_json
        ) VALUES (
            @record_id, @decision_id, @agent_id, @domain, @project_id,
            @question, @answer, @confidence, @tags, @evidence_text,
            @published_at, @record_json
        )
    `).run(record);
}

/* ── Conversation Discovery ───────────────────────── */

function discoverConversations(brainDir, since) {
    if (!fs.existsSync(brainDir)) {
        console.error(`  ✗ Brain directory not found: ${brainDir}`);
        process.exit(1);
    }

    let convDirs = fs.readdirSync(brainDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name !== 'tempmediaStorage')
        .map(d => path.join(brainDir, d.name));

    // Filter by --since
    if (since) {
        const cutoff = parseSince(since);
        convDirs = convDirs.filter(dir => {
            try {
                const stat = fs.statSync(dir);
                return stat.mtimeMs >= cutoff;
            } catch {
                return false;
            }
        });
    }

    return convDirs;
}

function parseSince(since) {
    const match = since.match(/^(\d+)(h|d|w)$/);
    if (!match) {
        console.error(`  ✗ Invalid --since format. Use: 24h, 7d, 2w`);
        process.exit(1);
    }
    const [, num, unit] = match;
    const ms = { h: 3600000, d: 86400000, w: 604800000 }[unit];
    return Date.now() - (parseInt(num) * ms);
}

/* ── Main ─────────────────────────────────────────── */

function main() {
    console.log('\n  ✦ elen-ingest — Chat History → Decision Records\n');
    console.log(`  Brain dir:  ${BRAIN_DIR}`);
    console.log(`  Database:   ${DB_PATH}`);
    console.log(`  Dry run:    ${DRY_RUN}`);
    console.log(`  Since:      ${SINCE || 'all time'}`);
    console.log(`  Project:    ${PROJECT_OVERRIDE || 'auto-detect'}`);
    console.log('');

    // 1. Discover conversations
    const convDirs = discoverConversations(BRAIN_DIR, SINCE);
    console.log(`  → Found ${convDirs.length} conversations\n`);

    if (convDirs.length === 0) {
        console.log('  Nothing to process.\n');
        return;
    }

    // 2. Run sources (pluggable — add new sources here)
    const sources = [
        new StepOutputSource(BRAIN_DIR),
        new ArtifactSource(BRAIN_DIR),    // stub for Strategy B
    ];

    let allCandidates = [];
    for (const source of sources) {
        console.log(`  ── Source: ${source.name} ──`);
        const candidates = source.extract(convDirs);
        console.log(`     Extracted ${candidates.length} candidate records\n`);
        allCandidates.push(...candidates);
    }

    if (allCandidates.length === 0) {
        console.log('  No candidate records found.\n');
        return;
    }

    // 3. Deduplicate against DB
    const db = openDb(DB_PATH);
    const existingIds = getExistingRecordIds(db);

    const newRecords = allCandidates.filter(c => !existingIds.has(c.record_id));
    const dupes = allCandidates.length - newRecords.length;

    console.log(`  ── Deduplication ──`);
    console.log(`     Total candidates:  ${allCandidates.length}`);
    console.log(`     Already in DB:     ${dupes}`);
    console.log(`     New records:       ${newRecords.length}\n`);

    if (newRecords.length === 0) {
        console.log('  All records already in database. Nothing to insert.\n');
        db.close();
        return;
    }

    // 4. Preview new records
    console.log('  ── New Records ──');
    for (const rec of newRecords) {
        const projLabel = PROJECT_OVERRIDE || rec.inferred_project || 'unknown';
        const q = rec.question.length > 70 ? rec.question.slice(0, 70) + '…' : rec.question;
        console.log(`     ${rec.record_id} [${projLabel}] ${q}`);
    }
    console.log('');

    // 5. Insert (unless --dry-run)
    if (DRY_RUN) {
        console.log('  ⚠ Dry run — no records inserted.\n');
        db.close();
        return;
    }

    // Group by project for efficient inserts
    const byProject = {};
    for (const rec of newRecords) {
        const proj = PROJECT_OVERRIDE || rec.inferred_project || 'default';
        if (!byProject[proj]) byProject[proj] = [];
        byProject[proj].push(rec);
    }

    let inserted = 0;
    const insertTx = db.transaction(() => {
        for (const [projectId, records] of Object.entries(byProject)) {
            ensureProject(db, projectId);
            for (const rec of records) {
                insertRecord(db, rec, projectId);
                inserted++;
            }
        }
    });

    insertTx();

    console.log(`  ✦ Inserted ${inserted} new records into ${DB_PATH}`);
    console.log(`    Projects: ${Object.keys(byProject).join(', ')}\n`);

    db.close();
}

main();
