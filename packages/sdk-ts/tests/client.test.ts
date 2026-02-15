import { describe, expect, it } from 'vitest';
import { ElenClient } from '../src/client';
import { createId } from '../src/id';
import { InMemoryStorage } from '../src/storage';

describe('ElenClient', () => {
  it('logDecision creates a valid DecisionRecord', async () => {
    const client = new ElenClient('agent-a', new InMemoryStorage());

    const record = await client.logDecision({
      question: 'Which DB?',
      domain: 'infrastructure',
      constraints: ['Must be open-source'],
      evidence: ['benchmark: PostgreSQL 3200 TPS'],
      answer: 'PostgreSQL'
    });

    expect(record.record_id.startsWith('rec-')).toBe(true);
    expect(record.validation_type).toBe('self');
    expect(record.constraints_snapshot).toHaveLength(1);
    expect(record.evidence_snapshot).toHaveLength(1);
    expect(record.checks_snapshot).toHaveLength(1);
  });

  it('logDecision throws if no constraints provided', async () => {
    const client = new ElenClient('agent-a', new InMemoryStorage());

    await expect(
      client.logDecision({
        question: 'Which DB?',
        domain: 'infrastructure',
        constraints: [],
        evidence: ['benchmark evidence'],
        answer: 'PostgreSQL'
      })
    ).rejects.toThrow('at least one constraint');
  });

  it('logDecision throws if no evidence provided', async () => {
    const client = new ElenClient('agent-a', new InMemoryStorage());

    await expect(
      client.logDecision({
        question: 'Which DB?',
        domain: 'infrastructure',
        constraints: ['Must scale'],
        evidence: [],
        answer: 'PostgreSQL'
      })
    ).rejects.toThrow('at least one evidence');
  });

  it('logDecision auto-classifies epistemic types', async () => {
    const client = new ElenClient('agent-a', new InMemoryStorage());

    const record = await client.logDecision({
      question: 'Which DB?',
      domain: 'infrastructure',
      constraints: ['Scale'],
      evidence: ['benchmark measured 3200 TPS'],
      answer: 'PostgreSQL'
    });

    expect(record.checks_snapshot[0].epistemic_type).toBe('empirical');
  });

  it('searchRecords filters by domain, minConfidence and parentPrompt', async () => {
    const client = new ElenClient('agent-a', new InMemoryStorage());

    await client.logDecision({
      question: 'Which DB?',
      domain: 'infrastructure',
      parentPrompt: 'Build auth system',
      constraints: ['Scale'],
      evidence: ['benchmark 3200 TPS'],
      answer: 'PostgreSQL'
    });

    await client.logDecision({
      question: 'Which color?',
      domain: 'design',
      parentPrompt: 'Design system refresh',
      constraints: ['Accessible'],
      evidence: ['usually blue works'],
      confidence: [0.5],
      answer: 'Blue'
    });

    const byDomain = await client.searchRecords({ domain: 'infrastructure' });
    const byConfidence = await client.searchRecords({ minConfidence: 0.8 });
    const byParent = await client.searchRecords({ parentPrompt: 'auth system' });

    expect(byDomain).toHaveLength(1);
    expect(byConfidence).toHaveLength(1);
    expect(byParent).toHaveLength(1);
    expect(byParent[0].domain).toBe('infrastructure');
  });

  it('competency profile is computed from records', async () => {
    const client = new ElenClient('agent-a', new InMemoryStorage());

    await client.logDecision({
      question: 'DB?',
      domain: 'infrastructure',
      constraints: ['Scale'],
      evidence: ['benchmark 3200 TPS'],
      confidence: [0.9],
      answer: 'PostgreSQL'
    });

    await client.logDecision({
      question: 'UI color?',
      domain: 'design',
      constraints: ['Accessible'],
      evidence: ['rule of thumb says blue'],
      confidence: [0.5],
      answer: 'Blue'
    });

    const profile = await client.getCompetencyProfile();

    expect(profile.domains).toEqual(expect.arrayContaining(['infrastructure', 'design']));
    expect(profile.strengths).toContain('infrastructure');
    expect(profile.weaknesses).toContain('design');
  });

  it('stores linked precedents in evidence', async () => {
    const client = new ElenClient('agent-a', new InMemoryStorage());

    const record = await client.logDecision({
      question: 'Which pooler?',
      domain: 'infrastructure',
      constraints: ['Must work with PostgreSQL'],
      evidence: ['PostgreSQL selected per precedent'],
      linkedPrecedents: ['rec-abc123'],
      answer: 'PgBouncer'
    });

    expect(record.evidence_snapshot[0].linked_precedent).toBe('rec-abc123');
    expect(record.evidence_snapshot[0].type).toBe('precedent');
  });

  it('ID generation produces unique IDs', () => {
    const ids = new Set(Array.from({ length: 300 }, () => createId('rec')));
    expect(ids.size).toBe(300);
  });
});
