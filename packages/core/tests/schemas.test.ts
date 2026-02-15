import { describe, expect, it } from 'vitest';

import { decisionContextSchema, decisionRecordSchema } from '../src';

const baseDecision = {
  decision_id: 'd1',
  agent_id: 'a1',
  question: 'Should we adopt option X?',
  domain: 'architecture',
  status: 'draft' as const,
  constraints: [
    {
      constraint_id: 'c1',
      decision_id: 'd1',
      type: 'requirement' as const,
      description: 'Keep p95 latency under 100ms',
      locked: false
    }
  ],
  evidence: [
    {
      evidence_id: 'e1',
      decision_id: 'd1',
      type: 'benchmark' as const,
      claim: 'Observed acceptable latency',
      proof: 'Measured 95ms p95 in staging',
      confidence: 0.84
    }
  ],
  checks: [
    {
      check_id: 'k1',
      decision_id: 'd1',
      claim: 'Performance target met',
      result: 'pass' as const,
      evidence_ids: ['e1'],
      epistemic_type: 'empirical' as const,
      confidence: 0.84
    }
  ],
  created_at: '2026-01-01T00:00:00.000Z'
};

describe('decisionContextSchema', () => {
  it('accepts a valid decision context', () => {
    expect(() => decisionContextSchema.parse(baseDecision)).not.toThrow();
  });

  it('rejects invalid decision status and confidence', () => {
    expect(() =>
      decisionContextSchema.parse({
        ...baseDecision,
        status: 'unknown',
        evidence: [{ ...baseDecision.evidence[0], confidence: 1.2 }]
      })
    ).toThrow();
  });
});

describe('decisionRecordSchema', () => {
  it('accepts a valid decision record', () => {
    expect(() =>
      decisionRecordSchema.parse({
        record_id: 'r1',
        decision_id: 'd1',
        agent_id: 'a1',
        question: 'Should we adopt option X?',
        answer: 'Yes',
        constraints_snapshot: baseDecision.constraints,
        evidence_snapshot: baseDecision.evidence,
        checks_snapshot: baseDecision.checks,
        confidence: 0.9,
        validation_type: 'human',
        domain: 'architecture',
        tags: ['adr'],
        published_at: '2026-01-01T00:00:00.000Z',
        expires_at: null
      })
    ).not.toThrow();
  });

  it('rejects invalid validation_type', () => {
    expect(() =>
      decisionRecordSchema.parse({
        record_id: 'r1',
        decision_id: 'd1',
        agent_id: 'a1',
        question: 'Should we adopt option X?',
        answer: 'Yes',
        constraints_snapshot: baseDecision.constraints,
        evidence_snapshot: baseDecision.evidence,
        checks_snapshot: baseDecision.checks,
        confidence: 0.9,
        validation_type: 'robot',
        domain: 'architecture',
        tags: ['adr'],
        published_at: '2026-01-01T00:00:00.000Z'
      })
    ).toThrow();
  });
});
