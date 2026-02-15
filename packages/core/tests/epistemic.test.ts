import { describe, expect, it } from 'vitest';

import { classifyEpistemicType, type Evidence } from '../src';

const baseEvidence: Evidence = {
  evidence_id: 'e1',
  decision_id: 'd1',
  type: 'observation',
  claim: '',
  proof: '',
  confidence: 0.8
};

describe('classifyEpistemicType', () => {
  it('classifies empirical evidence by benchmark/test keywords', () => {
    expect(
      classifyEpistemicType({
        ...baseEvidence,
        claim: 'Benchmark run completed',
        proof: 'Latency measured at 45 ms'
      })
    ).toBe('empirical');
  });

  it('classifies authoritative evidence by docs keywords', () => {
    expect(
      classifyEpistemicType({
        ...baseEvidence,
        claim: 'Official documentation recommends this setup',
        proof: 'See docs section 2'
      })
    ).toBe('authoritative');
  });

  it('classifies precedent evidence by record keywords', () => {
    expect(
      classifyEpistemicType({
        ...baseEvidence,
        claim: 'Decision record REC-12 used this architecture',
        proof: 'Previously validated in production'
      })
    ).toBe('precedent');
  });

  it('classifies heuristic evidence by rule-of-thumb keywords', () => {
    expect(
      classifyEpistemicType({
        ...baseEvidence,
        claim: 'Usually this approach scales well',
        proof: 'Rule of thumb from prior experience'
      })
    ).toBe('heuristic');
  });

  it('defaults to analytical for ambiguous evidence', () => {
    expect(
      classifyEpistemicType({
        ...baseEvidence,
        claim: 'Given current constraints, we infer this is feasible.',
        proof: 'Reasoning by decomposition and consistency checks.'
      })
    ).toBe('analytical');
  });
});
