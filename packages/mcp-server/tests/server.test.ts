import { describe, expect, it, vi } from 'vitest';
import { parseCliArgs } from '../src/index';
import { defaultStoragePath, routeToolCall } from '../src/server';

describe('MCP server CLI', () => {
  it('parses --agent-id and --storage args', () => {
    const parsed = parseCliArgs(['--agent-id', 'my-agent', '--storage', '/tmp/elen.db']);

    expect(parsed.agentId).toBe('my-agent');
    expect(parsed.storagePath).toBe('/tmp/elen.db');
  });

  it('uses defaults when args are omitted', () => {
    const parsed = parseCliArgs([]);

    expect(parsed.agentId).toBe('default-agent');
    expect(defaultStoragePath()).toContain('.elen/decisions.db');
    expect(parsed.storagePath).toBeUndefined();
  });
});

describe('routeToolCall', () => {
  it('routes known tools and throws for unknown tool', async () => {
    const elen = {
      logDecision: vi.fn(async () => ({ record_id: 'rec-1' })),
      searchRecords: vi.fn(async () => [{ record_id: 'rec-1' }]),
      getCompetencyProfile: vi.fn(async () => ({ domains: [] }))
    } as any;

    await expect(routeToolCall(elen, 'agent-a', 'elen_log_decision', {
      question: 'Q',
      domain: 'infrastructure',
      constraints: ['C'],
      evidence: ['E'],
      answer: 'A'
    })).resolves.toEqual({ record_id: 'rec-1' });

    await expect(routeToolCall(elen, 'agent-a', 'elen_search_precedents', {})).resolves.toEqual([{ record_id: 'rec-1' }]);
    await expect(routeToolCall(elen, 'agent-a', 'elen_get_competency', {})).resolves.toEqual({ domains: [] });

    await expect(routeToolCall(elen, 'agent-a', 'unknown_tool', {})).rejects.toThrow('Unknown tool');
  });
});
