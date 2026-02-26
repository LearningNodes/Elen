import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenSuggestTool = {
    name: 'elen_suggest',
    description: 'Before making a decision or taking action, retrieve pointer-first minimal candidates of prior decisions.',
    inputSchema: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'Search term or question' },
            domain: { type: 'string', description: 'Filter by domain' },
            limit: { type: 'number', description: 'Max suggestions to return (Top-K)' }
        },
        required: ['query']
    }
};

export const suggestInputSchema = z.object({
    query: z.string().min(1),
    domain: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional().default(5)
});

export async function handleSuggest(elen: Elen, args: unknown): Promise<unknown> {
    const parsed = suggestInputSchema.parse(args);
    const results = await elen.suggest({
        query: parsed.query,
        domain: parsed.domain,
        limit: parsed.limit
    });
    return results;
}
