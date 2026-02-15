import { describe, expect, it, vi } from 'vitest';
import {
  elenGetCompetencyTool,
  elenLogDecisionTool,
  elenSearchPrecedentsTool,
  handleGetCompetency,
  handleLogDecision,
  handleSearchPrecedents,
  validateCompetencyInput,
  validateLogDecisionInput,
  validateSearchInput
} from '../src/tools';

describe('MCP tool schemas', () => {
  it('tool descriptions match expected format', () => {
    expect(elenLogDecisionTool.description).toContain('validated Decision Record');
    expect(elenSearchPrecedentsTool.description).toContain('validated decisions');
    expect(elenGetCompetencyTool.description).toContain('competency profile');
  });

  it('elen_log_decision schema has required fields', () => {
    expect(elenLogDecisionTool.inputSchema.required).toEqual(['question', 'constraints', 'evidence', 'answer']);
  });

  it('elen_search_precedents schema includes optional filters', () => {
    expect(elenSearchPrecedentsTool.inputSchema.properties).toHaveProperty('query');
    expect(elenSearchPrecedentsTool.inputSchema.properties).toHaveProperty('domain');
    expect(elenSearchPrecedentsTool.inputSchema.properties).toHaveProperty('minConfidence');
    expect(elenSearchPrecedentsTool.inputSchema.properties).toHaveProperty('limit');
  });

  it('elen_get_competency schema supports optional agentId', () => {
    expect(elenGetCompetencyTool.inputSchema.properties).toHaveProperty('agentId');
  });
});

describe('MCP tool handlers', () => {
  it('elen_log_decision creates a record via SDK', async () => {
    const elen = {
      logDecision: vi.fn(async (input: unknown) => ({ record_id: 'rec-1', ...((input ?? {}) as object) }))
    } as any;

    const result = await handleLogDecision(elen, {
      question: 'Which DB?',
      domain: 'infrastructure',
      constraints: ['Must scale'],
      evidence: ['benchmark measured 3200 TPS'],
      answer: 'PostgreSQL'
    });

    expect(elen.logDecision).toHaveBeenCalledOnce();
    expect((result as { record_id: string }).record_id).toBe('rec-1');
  });

  it('elen_search_precedents returns matching records', async () => {
    const elen = {
      searchRecords: vi.fn(async () => [{ record_id: 'rec-a' }, { record_id: 'rec-b' }])
    } as any;

    const result = await handleSearchPrecedents(elen, { query: 'database choice', limit: 2 });

    expect(elen.searchRecords).toHaveBeenCalledWith({ query: 'database choice', domain: undefined, minConfidence: undefined, limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('elen_get_competency returns profile', async () => {
    const elen = {
      getCompetencyProfile: vi.fn(async () => ({ domains: ['infrastructure'] }))
    } as any;

    const result = await handleGetCompetency(elen, {}, 'agent-a');

    expect(elen.getCompetencyProfile).toHaveBeenCalledOnce();
    expect((result as { domains: string[] }).domains).toContain('infrastructure');
  });

  it('throws on invalid tool inputs', () => {
    expect(() => validateLogDecisionInput({ question: 'Q' })).toThrow('missing required field');
    expect(() => validateSearchInput({ limit: '5' })).toThrow('limit must be a number');
    expect(() => validateCompetencyInput({ agentId: 42 })).toThrow('agentId must be a string');
  });
});
