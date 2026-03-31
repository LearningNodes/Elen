import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenGetContextTool = {
    name: 'elen_get_context',
    description: 'Get an overview of active decision threads grouped by domain. Call at session start to orient before making decisions.',
    inputSchema: {
        type: 'object',
        properties: {
            domain: { type: 'string', description: 'Filter threads to a specific domain' },
            limit: { type: 'number', description: 'Max number of threads to return' }
        }
    }
};

export const contextInputSchema = z.object({
    domain: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional()
});

export async function handleGetContext(elen: Elen, args: unknown): Promise<unknown> {
    const parsed = contextInputSchema.parse(args);
    const result = await elen.getContext({
        domain: parsed.domain,
        limit: parsed.limit
    });
    return result;
}
