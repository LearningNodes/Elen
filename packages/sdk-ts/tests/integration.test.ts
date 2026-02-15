import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { Elen } from '../src';

describe('Elen integration', () => {
  it('supports batch decision logging and precedent search in memory mode', async () => {
    const elen = new Elen({ agentId: 'agent-int', storage: 'memory' });

    const first = await elen.logDecision({
      question: 'Which database for sessions?',
      domain: 'infrastructure',
      constraints: ['Must support >1000 writes'],
      evidence: ['pgbench: PostgreSQL 3200 TPS vs SQLite 280 TPS'],
      answer: 'PostgreSQL 16'
    });

    await elen.logDecision({
      question: 'Which pooler?',
      domain: 'infrastructure',
      constraints: ['Must work with PostgreSQL'],
      evidence: ['PostgreSQL selected per precedent'],
      linkedPrecedents: [first.record_id],
      answer: 'PgBouncer'
    });

    const precedents = await elen.searchPrecedents('high concurrency database selection');
    expect(precedents.length).toBeGreaterThan(0);
  });

  it('supports sqlite-backed usage', async () => {
    const dbPath = join(tmpdir(), `elen-int-${Date.now()}.db`);
    const elen = new Elen({ agentId: 'agent-sql', storage: 'sqlite', sqlitePath: dbPath });

    await elen.logDecision({
      question: 'Which cache?',
      domain: 'infrastructure',
      constraints: ['Must be open-source'],
      evidence: ['documentation recommends Redis for this workload'],
      answer: 'Redis'
    });

    const records = await elen.searchRecords({ query: 'redis' });
    expect(records).toHaveLength(1);

    rmSync(dbPath, { force: true });
  });
});
