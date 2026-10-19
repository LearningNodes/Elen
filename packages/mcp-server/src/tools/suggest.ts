import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenSuggestTool = {
  name: 'elen_suggest',
  description:
    'Before you make a choice that other bots or people will rely on, find decisions already made. Returns short pointers to active decisions.',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false
  },
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search term or question' },
      domain: { type: 'string', description: 'Filter by domain' },
      limit: { type: 'number', description: 'Max suggestions to return (Top-K)' },
      includeSuperseded: {
        type: 'boolean',
        description: 'Include superseded decisions'
      }
    },
    required: ['query']
  }
};

export const suggestInputSchema = z.object({
  query: z.string().min(1),
  domain: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional().default(5),
  includeSuperseded: z.boolean().optional()
});

export async function handleSuggest(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = suggestInputSchema.parse(args);
  return elen.suggest({
    query: parsed.query,
    domain: parsed.domain,
    limit: parsed.limit,
    includeSuperseded: parsed.includeSuperseded
  });
}
