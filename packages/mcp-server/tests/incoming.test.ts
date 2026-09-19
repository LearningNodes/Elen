import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleIncoming } from '../src/tools/incoming';

vi.mock('@learningnodes/elen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@learningnodes/elen')>();
  return {
    ...actual,
    resolveCredentials: vi.fn()
  };
});

import { resolveCredentials } from '@learningnodes/elen';

const resolveMock = vi.mocked(resolveCredentials);

describe('handleIncoming', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    resolveMock.mockReset();
    for (const key of ['ELEN_CONNECTED', 'ELEN_AGENT_ID']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it('returns disconnected without calling fetch when not connected', async () => {
    resolveMock.mockReturnValue({
      apiKey: 'lnk_test',
      apiKeySource: 'env',
      cloudUrl: 'https://api.learningnodes.com',
      cloudUrlSource: 'env',
      userEmail: undefined,
      userEmailSource: 'none'
    });

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const elen = {} as any;
    const result = await handleIncoming(elen, { limit: 10 });

    expect(result).toEqual({
      connected: false,
      message: expect.stringContaining('not connected'),
      incoming: []
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issues GET to /elen/mcp/incoming and returns server envelope verbatim', async () => {
    process.env.ELEN_CONNECTED = 'true';
    resolveMock.mockReturnValue({
      apiKey: 'lnk_testkey',
      apiKeySource: 'env',
      cloudUrl: 'https://api.learningnodes.com/',
      cloudUrlSource: 'env',
      userEmail: undefined,
      userEmailSource: 'none'
    });

    const serverItem = {
      grant_id: 9,
      record_type: 'mcp_decision',
      record_id: 'dec:abc',
      role: 'viewer',
      granted_by: 10,
      granted_at: '2026-07-01T00:00:00.000Z',
      ack_state: 'new',
      ack_at: null,
      decision: {
        decision_id: 'dec:abc',
        domain: 'backend',
        question_text: 'Which DB?',
        decision_text: 'PostgreSQL',
        status: 'active',
        refs: [],
        updated_at: '2026-07-01T00:00:00.000Z',
        agent_id: 'cursor-agent'
      }
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ incoming: [serverItem] })
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const elen = {} as any;
    const result = (await handleIncoming(elen, { limit: 25 })) as {
      connected: boolean;
      incoming: typeof serverItem[];
    };

    expect(result.connected).toBe(true);
    expect(result.incoming).toHaveLength(1);
    expect(result.incoming[0]).toEqual(serverItem);
    expect(result.incoming[0]).toHaveProperty('grant_id', 9);
    expect(result.incoming[0]).toHaveProperty('ack_state', 'new');
    expect(result.incoming[0]).toHaveProperty('role', 'viewer');
    expect(result.incoming[0]).toHaveProperty('granted_at');
    expect(result.incoming[0].decision).toBeDefined();
    expect(result.incoming[0]).not.toHaveProperty('source_label');
    expect(result.incoming[0]).not.toHaveProperty('conflict_note');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/elen\/mcp\/incoming/);
    expect(url).toContain('limit=25');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer lnk_testkey');
  });

  it('sends X-Agent-Id when ELEN_AGENT_ID is set', async () => {
    process.env.ELEN_CONNECTED = 'true';
    process.env.ELEN_AGENT_ID = 'inbox-agent';
    resolveMock.mockReturnValue({
      apiKey: 'lnk_testkey',
      apiKeySource: 'env',
      cloudUrl: 'https://api.learningnodes.com',
      cloudUrlSource: 'env',
      userEmail: undefined,
      userEmailSource: 'none'
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ incoming: [] })
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await handleIncoming({} as any, {});

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Agent-Id']).toBe('inbox-agent');
  });

  it('omits X-Agent-Id when ELEN_AGENT_ID is unset', async () => {
    process.env.ELEN_CONNECTED = 'true';
    resolveMock.mockReturnValue({
      apiKey: 'lnk_testkey',
      apiKeySource: 'env',
      cloudUrl: 'https://api.learningnodes.com',
      cloudUrlSource: 'env',
      userEmail: undefined,
      userEmailSource: 'none'
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ incoming: [] })
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await handleIncoming({} as any, {});

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Agent-Id']).toBeUndefined();
  });
});
