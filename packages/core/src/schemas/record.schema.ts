import { z } from 'zod';

import { checkSchema, constraintSchema, evidenceSchema } from './decision.schema';

export const validationTierSchema = z.enum(['self', 'peer', 'human']);

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
  validated_by: z.string().min(1).optional(),
  validation_type: validationTierSchema,
  domain: z.string().min(1),
  tags: z.array(z.string()),
  published_at: z.string().datetime(),
  expires_at: z.string().datetime().nullable().optional()
});
