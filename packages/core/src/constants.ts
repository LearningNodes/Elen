import type { ValidationTier } from './types';

export const DEFAULT_DECISION_TTL_HOURS = 72;

export const DEFAULT_RATE_LIMITS = {
  decisionsPerHour: 100,
  validationsPerHour: 200
} as const;

export const VALIDATION_TIER_WEIGHTS: Record<ValidationTier, number> = {
  self: 0.3,
  peer: 0.7,
  human: 1.0
};
