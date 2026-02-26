import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenExpandTool = {
    name: 'elen_expand',
    description: 'Expand a minimal pointer decision ID into its full constraints and text when ambiguity requires it.',
    inputSchema: {
        type: 'object',
        properties: {
            decisionId: { type: 'string', description: 'The decision_id (e.g. dec:INFA-aBcDeF) to expand' }
        },
        required: ['decisionId']
    }
};

export const expandInputSchema = z.object({
    decisionId: z.string().min(1)
});

export async function handleExpand(elen: Elen, args: unknown): Promise<unknown> {
    const parsed = expandInputSchema.parse(args);
    const result = await elen.expand(parsed.decisionId);
    return result;
}
