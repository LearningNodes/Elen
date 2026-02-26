import type { DecisionContext, EpistemicType, Evidence } from './types';

export function classifyEpistemicType(evidence: Evidence): EpistemicType {
  const text = `${evidence.claim} ${evidence.proof}`.toLowerCase();

  if (/(benchmark|test|measured|latency|tps|throughput)/.test(text)) {
    return 'empirical';
  }

  if (/(official|documentation|docs|spec|rfc|recommended)/.test(text)) {
    return 'authoritative';
  }

  if (/(decision record|adr|precedent|previously|prior decision)/.test(text)) {
    return 'precedent';
  }

  if (/(usually|rule of thumb|generally|typically)/.test(text)) {
    return 'heuristic';
  }

  return 'analytical';
}

export function canSubmitForValidation(decision: DecisionContext): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (decision.constraints.length === 0) {
    errors.push('Decision must include at least one constraint.');
  }

  if (decision.evidence.length === 0) {
    errors.push('Decision must include at least one evidence item.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
