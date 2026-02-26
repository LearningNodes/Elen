const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(require('os').homedir(), '.elen', 'decisions.db'), { readonly: true });

const rows = db.prepare('SELECT record_json FROM records ORDER BY published_at DESC LIMIT 5').all();
for (const r of rows) {
    const rec = JSON.parse(r.record_json);
    console.log(JSON.stringify({
        id: rec.record_id,
        thread_id: rec.thread_id || null,
        thread_name: rec.thread_name || null,
        turn_type: rec.turn_type || null,
        linked: rec.linked_records || [],
        domain: rec.domain
    }, null, 2));
    console.log('---');
}
db.close();
