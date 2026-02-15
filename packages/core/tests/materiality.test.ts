import { describe, expect, it } from 'vitest';

import { canSubmitForValidation, type DecisionContext } from '../src';

const baseDecision: DecisionContext = {
  decision_id: 'd1',
  agent_id: 'a1',
  question: 'Ship decision?',
  domain: 'delivery',
  status: 'draft',
  constraints: [
    {
      constraint_id: 'c1',
      decision_id: 'd1',
      type: 'requirement',
      description: 'Must pass performance checks',
      locked: false
    }
  ],
  evidence: [
    {
      evidence_id: 'e1',
      decision_id: 'd1',
      type: 'test_result',
      claim: 'Tests are passing',
      proof: 'All integration tests pass',
      confidence: 0.8
    }
  ],
  checks: [],
  created_at: '2026-01-01T00:00:00.000Z'
};

describe('canSubmitForValidation', () => {
  it('passes when decision has at least one constraint and one evidence', () => {
    const result = canSubmitForValidation(baseDecision);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('fails when constraints are missing', () => {
    const result = canSubmitForValidation({ ...baseDecision, constraints: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Decision must include at least one constraint.'
    );
  });

  it('fails when evidence is missing', () => {
    const result = canSubmitForValidation({ ...baseDecision, evidence: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Decision must include at least one evidence item.'
    );
  });
});
