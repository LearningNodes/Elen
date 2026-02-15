import type { Elen, LogDecisionInput } from '@learningnodes/elen';

export const elenLogDecisionTool = {
  name: 'elen_log_decision',
  description:
    'When you make a decision involving trade-offs or multiple viable options, log it here with your reasoning, constraints, and evidence. This creates a validated Decision Record — frozen, queryable, and citable by other agents.',
  inputSchema: {
    type: 'object',
    required: ['question', 'constraints', 'evidence', 'answer'],
    properties: {
      question: { type: 'string', description: 'The decision question' },
      domain: {
        type: 'string',
        description: 'Domain of the decision (e.g. infrastructure, security, architecture)'
      },
      constraints: {
        type: 'array',
        items: { type: 'string' },
        description: 'Constraints bounding this decision'
      },
      evidence: {
        type: 'array',
        items: { type: 'string' },
        description: 'Evidence supporting your choice'
      },
      answer: { type: 'string', description: 'Your decision/answer' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
      linkedPrecedents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Record IDs of cited precedents'
      }
    }
  }
} as const;

export function validateLogDecisionInput(input: unknown): LogDecisionInput {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: expected object');
  }

  const candidate = input as Record<string, unknown>;
  const requiredFields = ['question', 'constraints', 'evidence', 'answer'];
  for (const field of requiredFields) {
    if (!(field in candidate)) {
      throw new Error(`Invalid input: missing required field \"${field}\"`);
    }
  }

  if (typeof candidate.question !== 'string') {
    throw new Error('Invalid input: question must be a string');
  }
  if (!Array.isArray(candidate.constraints) || candidate.constraints.some((v) => typeof v !== 'string')) {
    throw new Error('Invalid input: constraints must be an array of strings');
  }
  if (!Array.isArray(candidate.evidence) || candidate.evidence.some((v) => typeof v !== 'string')) {
    throw new Error('Invalid input: evidence must be an array of strings');
  }
  if (typeof candidate.answer !== 'string') {
    throw new Error('Invalid input: answer must be a string');
  }
  if (candidate.domain !== undefined && typeof candidate.domain !== 'string') {
    throw new Error('Invalid input: domain must be a string');
  }
  if (candidate.tags !== undefined && (!Array.isArray(candidate.tags) || candidate.tags.some((v) => typeof v !== 'string'))) {
    throw new Error('Invalid input: tags must be an array of strings');
  }
  if (
    candidate.linkedPrecedents !== undefined &&
    (!Array.isArray(candidate.linkedPrecedents) || candidate.linkedPrecedents.some((v) => typeof v !== 'string'))
  ) {
    throw new Error('Invalid input: linkedPrecedents must be an array of strings');
  }

  return {
    question: candidate.question,
    domain: (candidate.domain as string | undefined) ?? 'general',
    constraints: candidate.constraints,
    evidence: candidate.evidence,
    answer: candidate.answer,
    tags: candidate.tags as string[] | undefined,
    linkedPrecedents: candidate.linkedPrecedents as string[] | undefined
  };
}

export async function handleLogDecision(elen: Elen, input: unknown) {
  const parsed = validateLogDecisionInput(input);
  return elen.logDecision(parsed);
}
