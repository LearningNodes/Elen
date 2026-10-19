import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenCommitTool = {
  name: 'elen_commit',
  description:
    'Record a decision you made: the question, what you chose and why, the facts that bounded it and where they came from. If a similar active decision exists, nothing is written and you get it back to cite, supersede or force.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  },
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question or problem statement' },
      domain: { type: 'string', description: 'Domain of decision (e.g. infrastructure, product)' },
      decisionText: { type: 'string', description: 'The proposed answer/decision made' },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Plain-text facts and limits that bounded the choice'
      },
      refs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Explicit pointers to other decision IDs or artifacts'
      },
      force: {
        type: 'boolean',
        description: 'Commit even when similar active decisions exist'
      },
      evidence: {
        type: 'array',
        items: { type: 'string' },
        description: 'Where the facts came from'
      },
      agent: { type: 'string', description: 'Bot name for this write' },
      questionId: { type: 'string', description: 'Reuse an existing question thread id' }
    },
    required: ['question', 'domain', 'decisionText', 'constraints']
  }
};

export const commitInputSchema = z.object({
  question: z.string().min(1),
  domain: z.string().min(1),
  decisionText: z.string().min(1),
  constraints: z.array(z.string().min(1)),
  refs: z.array(z.string()).optional(),
  force: z.boolean().optional(),
  evidence: z.array(z.string()).optional(),
  agent: z.string().optional(),
  questionId: z.string().optional()
});

export async function handleCommit(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = commitInputSchema.parse(args);
  return elen.commitDecision(parsed);
}
