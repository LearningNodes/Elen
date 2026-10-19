import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';
import { commitInputSchema } from './commit';

export const elenSupersedeTool = {
  name: 'elen_supersede',
  description:
    'Replace an active decision with a new one when its basis no longer holds. The old decision is kept and marked replaced.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  },
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
        description: 'Plain-text basis facts'
      },
      refs: {
        type: 'array',
        items: { type: 'string' }
      },
      evidence: {
        type: 'array',
        items: { type: 'string' }
      },
      agent: { type: 'string', description: 'Bot name for this write' }
    },
    required: ['oldDecisionId', 'question', 'domain', 'decisionText', 'constraints']
  }
};

export const supersedeInputSchema = commitInputSchema.extend({
  oldDecisionId: z.string().min(1)
});

export async function handleSupersede(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = supersedeInputSchema.parse(args);
  return elen.supersedeDecision(parsed.oldDecisionId, {
    question: parsed.question,
    domain: parsed.domain,
    decisionText: parsed.decisionText,
    constraints: parsed.constraints,
    refs: parsed.refs,
    evidence: parsed.evidence,
    agent: parsed.agent
  });
}
