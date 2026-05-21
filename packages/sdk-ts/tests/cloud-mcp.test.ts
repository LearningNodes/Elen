import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CloudMcpStorage } from '../src/storage/cloud-mcp';
import { InMemoryStorage } from '../src/storage/memory';

describe('CloudMcpStorage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => '{}'
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('POSTs commits with LN user and agent attribution headers', async () => {
    const local = new InMemoryStorage();
    const storage = new CloudMcpStorage({
      apiUrl: 'http://localhost:3900',
      userEmail: 'user@example.com',
      agentId: 'cursor-test',
      localFallback: local
    });

    await storage.saveRecord({
      decision_id: 'dec:TES-abc',
      q_id: 'q-1',
      question_text: 'Q?',
      decision_text: 'Use Postgres',
      constraint_set_id: 'cs:empty',
      refs: [],
      status: 'active',
      supersedes_id: null,
      timestamp: new Date().toISOString(),
      agent_id: 'cursor-test',
      domain: 'infra'
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3900/elen/mcp/commit');
    expect(init?.headers).toMatchObject({
      'X-User-Email': 'user@example.com',
      'X-Agent-Id': 'cursor-test'
    });
    const body = JSON.parse(String(init?.body));
    expect(body.decisionText).toBe('Use Postgres');
    expect(body.agent_id).toBe('cursor-test');
  });
});
