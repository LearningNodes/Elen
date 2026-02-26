import { z } from 'zod';

export const decisionStatusSchema = z.enum(['active', 'superseded', 'withdrawn']);

export const decisionRecordSchema = z.object({
  decision_id: z.string().min(1),
  q_id: z.string().min(1),
  decision_text: z.string().min(1),
  constraint_set_id: z.string().min(1),
  refs: z.array(z.string()),
  status: decisionStatusSchema,
  supersedes_id: z.string().optional(),
  timestamp: z.string().datetime(),

  agent_id: z.string().min(1),
  domain: z.string().min(1)
});
