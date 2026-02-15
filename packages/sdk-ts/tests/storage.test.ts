import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { DecisionContext, DecisionRecord } from '@learningnodes/elen-core';
import { InMemoryStorage, SQLiteStorage } from '../src/storage';

function fixtures(): { context: DecisionContext; record: DecisionRecord } {
  const decisionId = 'dec-1';
  const context: DecisionContext = {
    decision_id: decisionId,
    agent_id: 'agent-a',
    question: 'Which DB?',
    domain: 'infrastructure',
    status: 'validated',
    constraints: [
      {
        constraint_id: 'con-1',
        decision_id: decisionId,
        type: 'requirement',
        description: 'Must scale',
        locked: false
      }
    ],
    evidence: [
      {
        evidence_id: 'evd-1',
        decision_id: decisionId,
        type: 'benchmark',
        claim: 'Postgres faster',
        proof: 'benchmark 3200 TPS',
        confidence: 0.9
      }
    ],
    checks: [
      {
        check_id: 'chk-1',
        decision_id: decisionId,
        claim: 'Postgres faster',
        result: 'pass',
        evidence_ids: ['evd-1'],
        epistemic_type: 'empirical',
        confidence: 0.9
      }
    ],
    created_at: new Date().toISOString(),
    parent_prompt: 'Build auth system'
  };

  const record: DecisionRecord = {
    record_id: 'rec-1',
    decision_id: decisionId,
    agent_id: 'agent-a',
    question: 'Which DB?',
    answer: 'PostgreSQL',
    constraints_snapshot: context.constraints,
    evidence_snapshot: context.evidence,
    checks_snapshot: context.checks,
    confidence: 0.9,
    validation_type: 'self',
    domain: 'infrastructure',
    tags: ['database'],
    published_at: new Date().toISOString(),
    expires_at: null
  };

  return { context, record };
}

describe('Storage adapters', () => {
  it('InMemoryStorage supports CRUD/search/profile', async () => {
    const storage = new InMemoryStorage();
    const { context, record } = fixtures();

    await storage.saveDecision(context);
    await storage.saveRecord(record);

    expect(await storage.getRecord('rec-1')).not.toBeNull();
    expect(await storage.searchRecords({ domain: 'infrastructure' })).toHaveLength(1);
    expect(await storage.searchRecords({ parentPrompt: 'auth' })).toHaveLength(1);
    expect((await storage.getCompetencyProfile('agent-a')).strengths).toContain('infrastructure');
  });

  it('SQLiteStorage supports CRUD/search/profile', async () => {
    const dbPath = join(tmpdir(), `elen-sdk-${Date.now()}.db`);
    const storage = new SQLiteStorage(dbPath);
    const { context, record } = fixtures();

    await storage.saveDecision(context);
    await storage.saveRecord(record);

    expect(await storage.getRecord('rec-1')).not.toBeNull();
    expect(await storage.searchRecords({ domain: 'infrastructure' })).toHaveLength(1);
    expect(await storage.searchRecords({ minConfidence: 0.8 })).toHaveLength(1);
    expect(await storage.searchRecords({ parentPrompt: 'auth system' })).toHaveLength(1);
    expect((await storage.getCompetencyProfile('agent-a')).domains).toContain('infrastructure');

    rmSync(dbPath, { force: true });
  });
});
