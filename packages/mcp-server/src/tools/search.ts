import type { Elen, SearchOptions } from '@learningnodes/elen';

export const elenSearchPrecedentsTool = {
  name: 'elen_search_precedents',
  description:
    'Before making a significant technical decision, search for existing validated decisions in this domain. Returns past Decision Records with evidence and confidence scores.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      domain: { type: 'string', description: 'Filter by domain' },
      minConfidence: { type: 'number', description: 'Minimum confidence threshold (0-1)' },
      limit: { type: 'number', description: 'Max results (default 5)' }
    }
  }
} as const;

export function validateSearchInput(input: unknown): SearchOptions {
  if (input === undefined) {
    return { limit: 5 };
  }

  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: expected object');
  }

  const candidate = input as Record<string, unknown>;
  if (candidate.query !== undefined && typeof candidate.query !== 'string') {
    throw new Error('Invalid input: query must be a string');
  }
  if (candidate.domain !== undefined && typeof candidate.domain !== 'string') {
    throw new Error('Invalid input: domain must be a string');
  }
  if (candidate.minConfidence !== undefined && typeof candidate.minConfidence !== 'number') {
    throw new Error('Invalid input: minConfidence must be a number');
  }
  if (candidate.limit !== undefined && typeof candidate.limit !== 'number') {
    throw new Error('Invalid input: limit must be a number');
  }

  return {
    query: candidate.query as string | undefined,
    domain: candidate.domain as string | undefined,
    minConfidence: candidate.minConfidence as number | undefined,
    limit: (candidate.limit as number | undefined) ?? 5
  };
}

export async function handleSearchPrecedents(elen: Elen, input: unknown) {
  const parsed = validateSearchInput(input);
  return elen.searchRecords(parsed);
}
