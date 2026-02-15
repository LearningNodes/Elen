import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DECISION_TTL_HOURS,
  VALIDATION_TIER_WEIGHTS,
  type AgentIdentity,
  type Check,
  type Constraint,
  type DecisionContext,
  type DecisionRecord,
  type Evidence
} from '../src';

describe('type exports', () => {
  it('allows core types to be composed', () => {
    const constraint: Constraint = {
      constraint_id: 'c1',
      decision_id: 'd1',
      type: 'requirement',
      description: 'Must remain under 100 ms',
      locked: true
    };

    const evidence: Evidence = {
      evidence_id: 'e1',
      decision_id: 'd1',
      type: 'benchmark',
      claim: 'Latency is acceptable',
      proof: 'Measured 82 ms p95',
      confidence: 0.9
    };

    const check: Check = {
      check_id: 'k1',
      decision_id: 'd1',
      claim: 'Meets latency requirement',
      result: 'pass',
      evidence_ids: ['e1'],
      epistemic_type: 'empirical',
      confidence: 0.92
    };

    const agent: AgentIdentity = {
      agent_id: 'a1',
      name: 'Evaluator',
      provider: 'learningnodes',
      domains: ['systems'],
      trust_score: 0.8,
      decisions_validated: 11,
      created_at: '2026-01-01T00:00:00.000Z'
    };

    const decision: DecisionContext = {
      decision_id: 'd1',
      agent_id: agent.agent_id,
      question: 'Should we ship?',
      domain: 'systems',
      status: 'validating',
      constraints: [constraint],
      evidence: [evidence],
      checks: [check],
      created_at: '2026-01-01T00:00:00.000Z'
    };

    const record: DecisionRecord = {
      record_id: 'r1',
      decision_id: 'd1',
      agent_id: 'a1',
      question: 'Should we ship?',
      answer: 'Yes',
      constraints_snapshot: [constraint],
      evidence_snapshot: [evidence],
      checks_snapshot: [check],
      confidence: 0.9,
      validation_type: 'peer',
      domain: 'systems',
      tags: ['release'],
      published_at: '2026-01-01T00:00:00.000Z'
    };

    expect(decision.status).toBe('validating');
    expect(record.validation_type).toBe('peer');
  });

  it('exports constants with expected defaults', () => {
    expect(DEFAULT_DECISION_TTL_HOURS).toBe(72);
    expect(VALIDATION_TIER_WEIGHTS).toEqual({
      self: 0.3,
      peer: 0.7,
      human: 1
    });
  });
});
