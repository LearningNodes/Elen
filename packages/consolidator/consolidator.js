#!/usr/bin/env node
/**
 * Elen Consolidator Daemon
 * 
 * Background process that enriches decision records with threading metadata.
 * Runs periodically (default: every 5 minutes), costs zero LLM tokens.
 * 
 * What it does:
 *   1. Reads all records from ~/.elen/decisions.db
 *   2. Identifies un-threaded records (missing thread_id or using auto-*)
 *   3. Clusters them by: temporal proximity, domain, keyword overlap, shared citations
 *   4. Assigns thread_id and thread_name to clustered records
 *   5. Detects cross-thread links from shared linkedPrecedents
 *   6. Writes enriched metadata back to record_json
 * 
 * Usage:
 *   node consolidator.js                    # Run once
 *   node consolidator.js --watch            # Run every 5 minutes
 *   node consolidator.js --interval 60000   # Run every 60 seconds
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// --- Configuration ---
const DEFAULT_DB_PATH = path.join(os.homedir(), '.elen', 'decisions.db');
const TEMPORAL_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MIN_KEYWORD_OVERLAP = 0.15; // 15% TF-IDF cosine similarity threshold

// --- TF-IDF Utilities ---

/** Extract meaningful tokens from text, removing stopwords */
function tokenize(text) {
    const stopwords = new Set([
        'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'ought',
        'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
        'into', 'through', 'during', 'before', 'after', 'above', 'below',
        'between', 'out', 'off', 'over', 'under', 'again', 'further',
        'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
        'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
        'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
        'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or',
        'if', 'while', 'that', 'this', 'these', 'those', 'it', 'its',
        'we', 'us', 'our', 'they', 'them', 'their', 'what', 'which', 'who'
    ]);

    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !stopwords.has(t));
}

/** Build a term frequency map for a document */
function termFrequency(tokens) {
    const tf = {};
    for (const token of tokens) {
        tf[token] = (tf[token] || 0) + 1;
    }
    const max = Math.max(...Object.values(tf), 1);
    for (const key of Object.keys(tf)) {
        tf[key] /= max;
    }
    return tf;
}

/** Compute cosine similarity between two TF maps */
function cosineSimilarity(tfA, tfB) {
    const allTerms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const term of allTerms) {
        const a = tfA[term] || 0;
        const b = tfB[term] || 0;
        dotProduct += a * b;
        normA += a * a;
        normB += b * b;
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
}

// --- Clustering Logic ---

/** Build text representation of a record for comparison */
function recordText(record) {
    return [record.question, record.answer, (record.tags || []).join(' ')].join(' ');
}

/**
 * Cluster records using Union-Find with temporal, domain, and keyword signals.
 */
function clusterRecords(records) {
    const n = records.length;
    if (n === 0) return [];

    // Union-Find
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(x) {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }
    function union(a, b) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    }

    // Precompute TF vectors and timestamps
    const tfs = records.map(r => termFrequency(tokenize(recordText(r))));
    const timestamps = records.map(r => new Date(r.published_at).getTime());

    // Pairwise comparison
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            // Must be in the same domain
            if (records[i].domain !== records[j].domain) continue;

            let score = 0;

            // Temporal proximity (within 30 min window)
            if (Math.abs(timestamps[i] - timestamps[j]) <= TEMPORAL_WINDOW_MS) {
                score += 0.4;
            }

            // Keyword similarity
            const sim = cosineSimilarity(tfs[i], tfs[j]);
            if (sim >= MIN_KEYWORD_OVERLAP) {
                score += 0.4 * sim;
            }

            // Shared citations
            const linksI = new Set(records[i].linked_records || []);
            const linksJ = new Set(records[j].linked_records || []);
            const sharedLinks = [...linksI].filter(l => linksJ.has(l));
            if (sharedLinks.length > 0) {
                score += 0.3;
            }

            // Union if score is high enough
            if (score >= 0.35) {
                union(i, j);
            }
        }
    }

    // Group by cluster
    const clusters = {};
    for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!clusters[root]) clusters[root] = [];
        clusters[root].push(i);
    }

    return Object.values(clusters);
}

/** Generate a thread name from a cluster of records */
function generateThreadName(records) {
    // Use the most common meaningful keywords
    const allTokens = records.flatMap(r => tokenize(recordText(r)));
    const freq = {};
    for (const t of allTokens) {
        freq[t] = (freq[t] || 0) + 1;
    }

    // Get top 3 keywords
    const topKeywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));

    const domain = records[0].domain;
    const domainLabel = domain.charAt(0).toUpperCase() + domain.slice(1);

    if (topKeywords.length >= 2) {
        return `${domainLabel}: ${topKeywords.join(', ')}`;
    }
    return `${domainLabel} Decisions`;
}

/** Detect cross-thread links between records */
function detectCrossThreadLinks(records) {
    const links = new Map(); // record_id → Set of linked record_ids in other threads

    // Build a map of record_id → thread_id
    const recordThread = new Map();
    for (const r of records) {
        recordThread.set(r.record_id, r.thread_id);
    }

    // Check evidence for linked_precedent references
    for (const r of records) {
        if (!r.evidence_snapshot) continue;
        for (const ev of r.evidence_snapshot) {
            if (ev.linked_precedent && recordThread.has(ev.linked_precedent)) {
                const targetThread = recordThread.get(ev.linked_precedent);
                if (targetThread !== r.thread_id) {
                    // Cross-thread link found
                    if (!links.has(r.record_id)) links.set(r.record_id, new Set());
                    links.get(r.record_id).add(ev.linked_precedent);
                }
            }
        }

        // Also check existing linked_records
        if (r.linked_records) {
            for (const linkedId of r.linked_records) {
                if (recordThread.has(linkedId)) {
                    const targetThread = recordThread.get(linkedId);
                    if (targetThread !== r.thread_id) {
                        if (!links.has(r.record_id)) links.set(r.record_id, new Set());
                        links.get(r.record_id).add(linkedId);
                    }
                }
            }
        }
    }

    return links;
}

// --- Main Consolidation ---

function consolidate(dbPath) {
    if (!fs.existsSync(dbPath)) {
        console.log(`[consolidator] No database found at ${dbPath}, skipping.`);
        return { processed: 0, clustered: 0, bridged: 0 };
    }

    const db = new Database(dbPath);
    let processed = 0;
    let clustered = 0;
    let bridged = 0;

    try {
        // Read all records
        const rows = db.prepare('SELECT record_id, record_json FROM records').all();
        const records = rows.map(row => {
            try {
                return { ...JSON.parse(row.record_json), record_id: row.record_id };
            } catch {
                return null;
            }
        }).filter(Boolean);

        if (records.length === 0) {
            console.log('[consolidator] No records to process.');
            return { processed: 0, clustered: 0, bridged: 0 };
        }

        // Find un-threaded records (auto-generated thread IDs)
        const unthreaded = records.filter(r => !r.thread_id || r.thread_id.startsWith('auto-'));
        console.log(`[consolidator] Found ${records.length} total records, ${unthreaded.length} need threading.`);

        if (unthreaded.length > 0) {
            // Cluster un-threaded records
            const clusters = clusterRecords(unthreaded);

            const updateStmt = db.prepare(`
        UPDATE records SET record_json = @record_json WHERE record_id = @record_id
      `);

            const updateTransaction = db.transaction((updates) => {
                for (const update of updates) {
                    updateStmt.run(update);
                }
            });

            const updates = [];

            for (const cluster of clusters) {
                if (cluster.length < 2) continue; // Skip singletons

                const clusterRecords = cluster.map(i => unthreaded[i]);
                const threadId = `thread-${crypto.randomBytes(4).toString('hex')}`;
                const threadName = generateThreadName(clusterRecords);

                for (const idx of cluster) {
                    const record = unthreaded[idx];
                    record.thread_id = threadId;
                    record.thread_name = threadName;

                    // Auto-promote turn_type if record has linked_records
                    if (!record.turn_type || record.turn_type === 'ASK') {
                        if (record.linked_records && record.linked_records.length > 0) {
                            record.turn_type = 'DECISION';
                        }
                    }

                    updates.push({
                        record_id: record.record_id,
                        record_json: JSON.stringify(record)
                    });
                    clustered++;
                }

                console.log(`[consolidator] Created thread "${threadName}" with ${cluster.length} records.`);
            }

            if (updates.length > 0) {
                updateTransaction(updates);
            }
        }

        // Assign default threading to remaining singletons
        const singletonUpdates = [];
        for (const record of unthreaded) {
            if (record.thread_id && !record.thread_id.startsWith('auto-')) continue; // Already clustered
            const domainLabel = record.domain.charAt(0).toUpperCase() + record.domain.slice(1);
            record.thread_id = `auto-${record.domain}`;
            record.thread_name = `${domainLabel} Decisions`;

            // Derive turn_type from evidence
            if (!record.turn_type) {
                const hasPrecedent = (record.evidence_snapshot || []).some(e => e.linked_precedent);
                const hasLinked = (record.linked_records || []).length > 0;
                record.turn_type = (hasPrecedent || hasLinked) ? 'DECISION' : 'ASK';
            }

            singletonUpdates.push({
                record_id: record.record_id,
                record_json: JSON.stringify(record)
            });
        }

        if (singletonUpdates.length > 0) {
            const singletonStmt = db.prepare(`
                UPDATE records SET record_json = @record_json WHERE record_id = @record_id
            `);
            const singletonTx = db.transaction((updates) => {
                for (const update of updates) {
                    singletonStmt.run(update);
                }
            });
            singletonTx(singletonUpdates);
            console.log(`[consolidator] Assigned default threading to ${singletonUpdates.length} singleton records.`);
        }

        // Detect cross-thread bridges (across ALL records)
        const allRecordsRefreshed = db.prepare('SELECT record_id, record_json FROM records').all()
            .map(row => {
                try {
                    return { ...JSON.parse(row.record_json), record_id: row.record_id };
                } catch {
                    return null;
                }
            }).filter(Boolean);

        const crossLinks = detectCrossThreadLinks(allRecordsRefreshed);

        if (crossLinks.size > 0) {
            const bridgeUpdates = [];

            for (const [recordId, linkedIds] of crossLinks) {
                const record = allRecordsRefreshed.find(r => r.record_id === recordId);
                if (!record) continue;

                const existingLinks = new Set(record.linked_records || []);
                let changed = false;
                for (const linkedId of linkedIds) {
                    if (!existingLinks.has(linkedId)) {
                        existingLinks.add(linkedId);
                        changed = true;
                    }
                }

                if (changed) {
                    record.linked_records = [...existingLinks];
                    bridgeUpdates.push({
                        record_id: record.record_id,
                        record_json: JSON.stringify(record)
                    });
                    bridged++;
                }
            }

            if (bridgeUpdates.length > 0) {
                const updateStmt = db.prepare(`
          UPDATE records SET record_json = @record_json WHERE record_id = @record_id
        `);
                const updateTransaction = db.transaction((updates) => {
                    for (const update of updates) {
                        updateStmt.run(update);
                    }
                });
                updateTransaction(bridgeUpdates);
                console.log(`[consolidator] Detected ${bridged} new cross-thread bridges.`);
            }
        }

        processed = records.length;
    } finally {
        db.close();
    }

    return { processed, clustered, bridged };
}

// --- CLI ---

function main() {
    const args = process.argv.slice(2);
    const watchMode = args.includes('--watch');
    const intervalIdx = args.indexOf('--interval');
    const interval = intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) : 5 * 60 * 1000;
    const dbPathIdx = args.indexOf('--db');
    const dbPath = dbPathIdx >= 0 ? args[dbPathIdx + 1] : DEFAULT_DB_PATH;

    console.log(`[consolidator] Database: ${dbPath}`);

    function run() {
        const start = Date.now();
        try {
            const result = consolidate(dbPath);
            const elapsed = Date.now() - start;
            console.log(
                `[consolidator] Done in ${elapsed}ms: ${result.processed} records processed, ` +
                `${result.clustered} clustered, ${result.bridged} bridges added.`
            );
        } catch (err) {
            console.error(`[consolidator] Error: ${err.message}`);
        }
    }

    run();

    if (watchMode) {
        console.log(`[consolidator] Watch mode: running every ${interval / 1000}s`);
        setInterval(run, interval);
    }
}

main();
