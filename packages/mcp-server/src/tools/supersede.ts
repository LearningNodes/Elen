import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';
import { commitInputSchema } from './commit';

export const elenSupersedeTool = {
    name: 'elen_supersede',
    description: 'Explicitly revise and supersede an older decision with a new one.',
    inputSchema: {
        type: 'object',
        properties: {
            oldDecisionId: { type: 'string', description: 'The old decision_id to supersede' },
            question: { type: 'string', description: 'The question or problem statement' },
            domain: { type: 'string', description: 'Domain of decision' },
            decisionText: { type: 'string', description: 'The new revised answer/decision' },
            constraints: {
                type: 'array',
                items: { type: 'string' },
                description: 'Plain-text constraint rules'
            },
            refs: {
                type: 'array',
                items: { type: 'string' }
            }
        },
        required: ['oldDecisionId', 'question', 'domain', 'decisionText', 'constraints']
    }
};

export const supersedeInputSchema = commitInputSchema.extend({
    oldDecisionId: z.string().min(1)
});

export async function handleSupersede(elen: Elen, args: unknown): Promise<unknown> {
    const parsed = supersedeInputSchema.parse(args);
    const result = await elen.supersedeDecision(parsed.oldDecisionId, {
        question: parsed.question,
        domain: parsed.domain,
        decisionText: parsed.decisionText,
        constraints: parsed.constraints,
        refs: parsed.refs
    });
    return result;
}
