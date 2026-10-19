import type { Elen } from '@learningnodes/elen';
import { isCloudV2Storage } from '@learningnodes/elen';

export const elenLogDecisionTool = {
  name: 'elen_log_decision',
  description: 'Create a validated Decision Record from constraints/evidence/answer.',
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false
  },
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      domain: { type: 'string' },
      constraints: { type: 'array', items: { type: 'string' } },
      evidence: { type: 'array', items: { type: 'string' } },
      answer: { type: 'string' },
      parentPrompt: { type: 'string' }
    },
    required: ['question', 'constraints', 'evidence', 'answer']
  }
} as const;

export const elenSearchPrecedentsTool = {
  name: 'elen_search_precedents',
  description: 'Search validated decisions for precedents.',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false
  },
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      domain: { type: 'string' },
      minConfidence: { type: 'number' },
      limit: { type: 'number' }
    }
  }
} as const;

export function validateLogDecisionInput(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('missing required field: question');
  const candidate = input as Record<string, unknown>;
  for (const field of ['question', 'constraints', 'evidence', 'answer']) {
    if (!(field in candidate)) throw new Error(`missing required field: ${field}`);
  }
  return candidate as {
    question: string;
    domain?: string;
    constraints: string[];
    evidence: string[];
    answer: string;
    parentPrompt?: string;
  };
}

export function validateSearchInput(input: unknown): {
  query?: string;
  domain?: string;
  minConfidence?: number;
  limit?: number;
} {
  if (!input) return {};
  if (typeof input !== 'object') throw new Error('invalid search input');
  const c = input as Record<string, unknown>;
  if (c.limit !== undefined && typeof c.limit !== 'number') throw new Error('limit must be a number');
  if (c.minConfidence !== undefined && typeof c.minConfidence !== 'number') {
    throw new Error('minConfidence must be a number');
  }
  return c as { query?: string; domain?: string; minConfidence?: number; limit?: number };
}

export async function handleLogDecision(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = validateLogDecisionInput(args);
  // Connected/hosted v2: map to commit (answer → decisionText, evidence kept, domain default general)
  const storage = typeof elen.getStorage === 'function' ? elen.getStorage() : null;
  const isV2 = storage && isCloudV2Storage(storage);
  if (isV2) {
    return elen.commitDecision({
      question: parsed.question,
      domain: parsed.domain ?? 'general',
      decisionText: parsed.answer,
      constraints: parsed.constraints,
      evidence: parsed.evidence
    });
  }
  const result = await elen.logDecision({
    question: parsed.question,
    domain: parsed.domain ?? 'general',
    constraints: parsed.constraints,
    evidence: parsed.evidence,
    answer: parsed.answer,
    parentPrompt: parsed.parentPrompt
  });

  return { ...result, next_suggested_action: 'Use elen_search_precedents to discover related decisions.' };
}

export async function handleSearchPrecedents(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = validateSearchInput(args);
  const opts = {
    query: parsed.query,
    domain: parsed.domain,
    minConfidence: parsed.minConfidence,
    limit: parsed.limit
  };
  if (typeof elen.searchPrecedents === 'function') {
    return elen.searchPrecedents(parsed.query ?? '', opts);
  }
  return elen.searchRecords(opts);
}
