import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenListTool = {
  name: 'elen_list',
  description:
    'List decisions, newest first, filtered by bot, domain, date or status.',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false
  },
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Filter by bot/agent id' },
      domain: { type: 'string', description: 'Filter by domain' },
      since: { type: 'string', description: 'YYYY-MM-DD' },
      status: {
        type: 'string',
        enum: ['active', 'superseded', 'all'],
        description: 'Status filter'
      },
      limit: { type: 'number', description: '1..20' }
    }
  }
};

export const listInputSchema = z.object({
  agent: z.string().optional(),
  domain: z.string().optional(),
  since: z.string().optional(),
  status: z.enum(['active', 'superseded', 'all']).optional(),
  limit: z.number().int().min(1).max(20).optional()
});

export async function handleList(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = listInputSchema.parse(args ?? {});
  return elen.listDecisions({
    agent: parsed.agent,
    domain: parsed.domain,
    since: parsed.since,
    status: parsed.status,
    limit: parsed.limit
  });
}
