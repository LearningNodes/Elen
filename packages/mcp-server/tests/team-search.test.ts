import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handleTeamSearch } from '../src/tools/team-search';

vi.mock('@learningnodes/elen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@learningnodes/elen')>();
  return {
    ...actual,
    resolveCredentials: vi.fn()
  };
});

import { resolveCredentials } from '@learningnodes/elen';

const resolveMock = vi.mocked(resolveCredentials);

describe('handleTeamSearch', () => {
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

    const elen = { suggest: vi.fn() } as any;
    const result = await handleTeamSearch(elen, { query: 'db' });

    expect(result).toEqual({
      connected: false,
      message: expect.stringContaining('not connected'),
      decisions: []
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('issues GET to /elen/mcp/search with params and returns source_label', async () => {
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
      json: async () => ({
        decisions: [
          {
            decision_id: 'dec:abc',
            question_text: 'Which DB?',
            decision_text: 'PostgreSQL',
            status: 'active',
            agent_id: 'cursor-agent'
          },
          {
            decision_id: 'dec:def',
            question_text: 'Auth model?',
            decision_text: 'JWT',
            status: 'active',
            agent_id: ''
          }
        ]
      })
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const elen = { suggest: vi.fn(async () => []) } as any;
    const result = (await handleTeamSearch(elen, { query: 'db', domain: 'backend', limit: 10 })) as {
      connected: boolean;
      decisions: Array<{ source_label: string }>;
    };

    expect(result.connected).toBe(true);
    expect(result.decisions).toHaveLength(2);
    expect(result.decisions[0].source_label).toBe('agent atom');
    expect(result.decisions[1].source_label).toBe('human decision record');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/elen/mcp/search');
    expect(url).toContain('q=db');
    expect(url).toContain('domain=backend');
    expect(url).toContain('limit=10');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer lnk_testkey');
    expect(headers['X-Agent-Id']).toBeUndefined();
  });

  it('adds conflict_note when team decision overlaps local atom', async () => {
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
      json: async () => ({
        decisions: [
          {
            decision_id: 'dec:team1',
            question_text: 'Which database to use?',
            decision_text: 'MySQL',
            status: 'active',
            agent_id: 'human'
          }
        ]
      })
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const elen = {
      suggest: vi.fn(async () => [
        { decision_id: 'dec:local1', question_text: 'which database to use' }
      ])
    } as any;

    const result = (await handleTeamSearch(elen, { query: 'database' })) as {
      decisions: Array<{ conflict_note?: string; local_atom_ref?: string }>;
    };

    expect(result.decisions[0].conflict_note).toBe('A human decision exists on this question.');
    expect(result.decisions[0].local_atom_ref).toBe('dec:local1');
  });

  it('sends X-Agent-Id when ELEN_AGENT_ID is set', async () => {
    process.env.ELEN_CONNECTED = 'true';
    process.env.ELEN_AGENT_ID = 'my-agent';
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
      json: async () => ({ decisions: [] })
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const elen = { suggest: vi.fn(async () => []) } as any;
    await handleTeamSearch(elen, {});

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Agent-Id']).toBe('my-agent');
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
      json: async () => ({ decisions: [] })
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const elen = { suggest: vi.fn(async () => []) } as any;
    await handleTeamSearch(elen, {});

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Agent-Id']).toBeUndefined();
  });
});
