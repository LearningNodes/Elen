import { z } from 'zod';
import { checkSchema, constraintSchema, evidenceSchema } from './decision.schema';

export const decisionStatusSchema = z.enum(['active', 'superseded', 'withdrawn']);

// legacy surface
export const decisionRecordSchema = z.object({
  record_id: z.string().min(1),
  decision_id: z.string().min(1),
  agent_id: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  constraints_snapshot: z.array(constraintSchema),
  evidence_snapshot: z.array(evidenceSchema),
  checks_snapshot: z.array(checkSchema),
  confidence: z.number().min(0).max(1),
  validation_type: z.enum(['self', 'peer', 'human']),
  domain: z.string().min(1),
  tags: z.array(z.string()),
  published_at: z.string().datetime(),
  expires_at: z.string().datetime().nullable().optional()
});

// current engine shape
export const minimalDecisionRecordSchema = z.object({
  decision_id: z.string().min(1),
  q_id: z.string().min(1),
  question_text: z.string().min(1).optional(),
  decision_text: z.string().min(1),
  constraint_set_id: z.string().min(1),
  refs: z.array(z.string()),
  status: decisionStatusSchema,
  supersedes_id: z.string().optional(),
  timestamp: z.string().datetime(),
  agent_id: z.string().min(1),
  domain: z.string().min(1)
});
