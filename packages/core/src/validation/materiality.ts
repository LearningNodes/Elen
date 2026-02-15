import type { DecisionContext } from '../types';

export function canSubmitForValidation(
  decision: DecisionContext
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (decision.constraints.length < 1) {
    errors.push('Decision must include at least one constraint.');
  }

  if (decision.evidence.length < 1) {
    errors.push('Decision must include at least one evidence item.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
