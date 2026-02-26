import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenCommitTool = {
    name: 'elen_commit',
    description: 'Commit a new minimal epistemic decision to the graph. Pass constraints as plain text array.',
    inputSchema: {
        type: 'object',
        properties: {
            question: { type: 'string', description: 'The question or problem statement' },
            domain: { type: 'string', description: 'Domain of decision (e.g. infrastructure, product)' },
            decisionText: { type: 'string', description: 'The proposed answer/decision made' },
            constraints: {
                type: 'array',
                items: { type: 'string' },
                description: 'Plain-text constraint rules (e.g. "budget < 500 tokens")'
            },
            refs: {
                type: 'array',
                items: { type: 'string' },
                description: 'Explicit pointers to other decision IDs or artifacts'
            }
        },
        required: ['question', 'domain', 'decisionText', 'constraints']
    }
};

export const commitInputSchema = z.object({
    question: z.string().min(1),
    domain: z.string().min(1),
    decisionText: z.string().min(1),
    constraints: z.array(z.string().min(1)),
    refs: z.array(z.string()).optional()
});

export async function handleCommit(elen: Elen, args: unknown): Promise<unknown> {
    const parsed = commitInputSchema.parse(args);
    const result = await elen.commitDecision(parsed);
    return result;
}
