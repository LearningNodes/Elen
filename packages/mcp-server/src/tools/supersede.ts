import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

export const elenSupersedeTool = {
  name: 'elen_supersede',
  description:
    'Replace an active decision with a new one when its basis no longer holds. The old decision is kept and marked replaced. question and domain are optional: when omitted, the old decision\'s question and domain are used.',
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
      question: { type: 'string', description: 'The question or problem statement (optional; defaults to the old decision\'s question)' },
      domain: { type: 'string', description: 'Domain of decision (optional; defaults to the old decision\'s domain)' },
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
    required: ['oldDecisionId', 'decisionText', 'constraints']
  }
};

export const supersedeInputSchema = z.object({
  oldDecisionId: z.string().min(1),
  question: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
  decisionText: z.string().min(1),
  constraints: z.array(z.string().min(1)),
  refs: z.array(z.string()).optional(),
  force: z.boolean().optional(),
  evidence: z.array(z.string()).optional(),
  agent: z.string().optional(),
  questionId: z.string().optional()
});

export async function handleSupersede(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = supersedeInputSchema.parse(args);
  // Send only what was given — question/domain stay undefined when omitted so
  // cloud modes omit them and local mode falls back to the old record.
  const input: Parameters<Elen['supersedeDecision']>[1] = {
    decisionText: parsed.decisionText,
    constraints: parsed.constraints
  };
  if (parsed.question !== undefined) input.question = parsed.question;
  if (parsed.domain !== undefined) input.domain = parsed.domain;
  if (parsed.refs !== undefined) input.refs = parsed.refs;
  if (parsed.evidence !== undefined) input.evidence = parsed.evidence;
  if (parsed.agent !== undefined) input.agent = parsed.agent;
  if (parsed.force !== undefined) input.force = parsed.force;
  if (parsed.questionId !== undefined) input.questionId = parsed.questionId;
  return elen.supersedeDecision(parsed.oldDecisionId, input);
}
