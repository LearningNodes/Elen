import { z } from 'zod';

export const constraintSetSchema = z.object({
  constraint_set_id: z.string().min(1),
  atoms: z.array(z.string()),
  summary: z.string().min(1)
});
