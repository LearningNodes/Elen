import { z } from 'zod';

export const constraintSchema = z.object({
  constraint_id: z.string().min(1),
  decision_id: z.string().min(1),
  type: z.enum(['requirement', 'assumption', 'risk', 'dependency']),
  description: z.string().min(1),
  locked: z.boolean()
});

export const evidenceSchema = z.object({
  evidence_id: z.string().min(1),
  decision_id: z.string().min(1),
  type: z.enum([
    'benchmark',
    'test_result',
    'documentation',
    'observation',
    'precedent',
    'analysis'
  ]),
  claim: z.string().min(1),
  proof: z.string().min(1),
  confidence: z.number().min(0).max(1),
  linked_precedent: z.string().optional()
});

export const checkSchema = z.object({
  check_id: z.string().min(1),
  decision_id: z.string().min(1),
  claim: z.string().min(1),
  result: z.enum(['pass', 'fail', 'inconclusive']),
  evidence_ids: z.array(z.string().min(1)),
  epistemic_type: z.enum([
    'empirical',
    'authoritative',
    'precedent',
    'heuristic',
    'analytical'
  ]),
  confidence: z.number().min(0).max(1),
  linked_precedent: z.string().optional()
});

export const decisionContextSchema = z.object({
  decision_id: z.string().min(1),
  agent_id: z.string().min(1),
  question: z.string().min(1),
  domain: z.string().min(1),
  status: z.enum(['draft', 'validating', 'validated', 'rejected']),
  constraints: z.array(constraintSchema),
  evidence: z.array(evidenceSchema),
  checks: z.array(checkSchema),
  created_at: z.string().datetime(),
  parent_prompt: z.string().optional()
});

// current engine schema
export const constraintSetSchema = z.object({
  constraint_set_id: z.string().min(1),
  atoms: z.array(z.string()),
  summary: z.string().min(1)
});
