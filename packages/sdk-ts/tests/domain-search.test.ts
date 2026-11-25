import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import type { DecisionContext, DecisionRecord } from '@learningnodes/elen-core';
import { InMemoryStorage, SQLiteStorage } from '../src/storage';
import type { StorageAdapter } from '../src/storage/interface';

function minimalPair(
  id: string,
  domain: string,
  question: string,
  answer: string,
  publishedAt: string
): { ctx: DecisionContext; rec: DecisionRecord } {
  const decisionId = `dec-${id}`;
  const ctx: DecisionContext = {
    decision_id: decisionId,
    agent_id: 'agent-a',
    question,
    domain,
    status: 'validated',
    constraints: [
      {
        constraint_id: `con-${id}`,
        decision_id: decisionId,
        type: 'requirement',
        description: 'constraint',
        locked: false
      }
    ],
    evidence: [
      {
        evidence_id: `evd-${id}`,
        decision_id: decisionId,
        type: 'rule',
        claim: 'evidence',
        proof: 'proof',
        confidence: 0.9
      }
    ],
    checks: [],
    created_at: publishedAt
  };
  const rec: DecisionRecord = {
    record_id: `rec-${id}`,
    decision_id: decisionId,
    agent_id: 'agent-a',
    question,
    answer,
    constraints_snapshot: ctx.constraints,
    evidence_snapshot: ctx.evidence,
    checks_snapshot: [],
    confidence: 0.9,
    validation_type: 'self',
    domain,
    tags: [],
    published_at: publishedAt,
    expires_at: null
  };
  return { ctx, rec };
}

async function seed(
  storage: StorageAdapter,
  items: Array<{ ctx: DecisionContext; rec: DecisionRecord }>
): Promise<void> {
  for (const { ctx, rec } of items) {
    await storage.saveDecision(ctx);
    await storage.saveRecord(rec);
  }
}

function runDomainSearchSuite(
  label: string,
  create: () => { storage: StorageAdapter; cleanup?: () => void }
): void {
  describe(`searchRecords domain ranking (${label})`, () => {
    let storage: StorageAdapter;
    let cleanup: (() => void) | undefined;

    afterEach(() => {
      cleanup?.();
      cleanup = undefined;
    });

    it('text query with non-matching domain still returns the matching decision', async () => {
      ({ storage, cleanup } = create());
      await seed(storage, [
        minimalPair(
          '1',
          'marketing',
          'When is the newsletter?',
          'Send newsletter on Tuesday',
          '2026-01-01T00:00:00.000Z'
        )
      ]);
      const hits = await storage.searchRecords({ query: 'newsletter tuesday', domain: 'content' });
      expect(hits).toHaveLength(1);
      expect(hits[0].domain).toBe('marketing');
    });

    it('ranks the requested domain first when scores tie', async () => {
      ({ storage, cleanup } = create());
      const text = 'newsletter Tuesday schedule';
      await seed(storage, [
        minimalPair('a', 'marketing', text, text, '2026-01-02T00:00:00.000Z'),
        minimalPair('b', 'content', text, text, '2026-01-01T00:00:00.000Z')
      ]);
      const hits = await storage.searchRecords({ query: 'newsletter tuesday', domain: 'content' });
      expect(hits).toHaveLength(2);
      expect(hits[0].domain).toBe('content');
    });

    it('domain without query returns only that domain', async () => {
      ({ storage, cleanup } = create());
      await seed(storage, [
        minimalPair('m', 'marketing', 'Q marketing', 'A marketing', '2026-01-01T00:00:00.000Z'),
        minimalPair('c', 'content', 'Q content', 'A content', '2026-01-01T00:00:00.000Z')
      ]);
      const hits = await storage.searchRecords({ domain: 'content' });
      expect(hits).toHaveLength(1);
      expect(hits[0].domain).toBe('content');
    });

    it('does not return below-threshold matches even in the requested domain', async () => {
      ({ storage, cleanup } = create());
      await seed(storage, [
        minimalPair(
          'low',
          'content',
          'Unrelated infrastructure topic',
          'PostgreSQL connection pooling',
          '2026-01-01T00:00:00.000Z'
        )
      ]);
      const hits = await storage.searchRecords({
        query: 'quantum encryption blockchain',
        domain: 'content'
      });
      expect(hits).toHaveLength(0);
    });
  });
}

runDomainSearchSuite('InMemoryStorage', () => ({ storage: new InMemoryStorage() }));

runDomainSearchSuite('SQLiteStorage', () => {
  const dbPath = join(tmpdir(), `elen-domain-search-${Date.now()}-${Math.random()}.db`);
  const storage = new SQLiteStorage(dbPath);
  return {
    storage,
    cleanup: () => {
      storage.close();
      rmSync(dbPath, { force: true });
    }
  };
});