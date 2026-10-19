import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenExpandTool = {
  name: 'elen_expand',
  description:
    'Get the full decision behind a pointer: its basis, evidence, links and the history of decisions on the same question.',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false
  },
  inputSchema: {
    type: 'object',
    properties: {
      decisionId: { type: 'string', description: 'The decision_id to expand' }
    },
    required: ['decisionId']
  }
};

export const expandInputSchema = z.object({
  decisionId: z.string().min(1)
});

export async function handleExpand(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = expandInputSchema.parse(args);
  return elen.expand(parsed.decisionId);
}
