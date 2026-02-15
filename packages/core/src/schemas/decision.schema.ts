import { z } from 'zod';

export const constraintTypeSchema = z.enum(['requirement', 'assumption', 'boundary']);
export const evidenceTypeSchema = z.enum([
  'benchmark',
  'test_result',
  'documentation',
  'precedent',
  'observation'
]);
export const checkResultSchema = z.enum(['pass', 'fail', 'inconclusive']);
export const epistemicTypeSchema = z.enum([
  'empirical',
  'analytical',
  'authoritative',
  'heuristic',
  'precedent'
]);
export const decisionStatusSchema = z.enum([
  'draft',
  'asking',
  'validating',
  'validated',
  'rejected'
]);

export const constraintSchema = z.object({
  constraint_id: z.string().min(1),
  decision_id: z.string().min(1),
  type: constraintTypeSchema,
  description: z.string().min(1),
  source: z.string().min(1).optional(),
  locked: z.boolean()
});

export const evidenceSchema = z.object({
  evidence_id: z.string().min(1),
  decision_id: z.string().min(1),
  type: evidenceTypeSchema,
  claim: z.string().min(1),
  proof: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source_url: z.string().url().optional(),
  linked_precedent: z.string().min(1).optional()
});

export const checkSchema = z.object({
  check_id: z.string().min(1),
  decision_id: z.string().min(1),
  claim: z.string().min(1),
  result: checkResultSchema,
  evidence_ids: z.array(z.string().min(1)),
  epistemic_type: epistemicTypeSchema,
  confidence: z.number().min(0).max(1),
  validator: z.string().min(1).optional()
});

export const decisionContextSchema = z.object({
  decision_id: z.string().min(1),
  agent_id: z.string().min(1),
  question: z.string().min(1),
  domain: z.string().min(1),
  status: decisionStatusSchema,
  constraints: z.array(constraintSchema),
  evidence: z.array(evidenceSchema),
  checks: z.array(checkSchema),
  parent_prompt: z.string().min(1).optional(),
  linked_decisions: z.array(z.string().min(1)).optional(),
  created_at: z.string().datetime()
});
