/**
 * login.test.ts — tests for `elen login` / `whoami` / `logout`.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readUserConfig } from '@learningnodes/elen';
import { runLogin, runWhoami, runLogout } from '../src/login';

function makeTmpDir(prefix: string): string {
  const dir = join(tmpdir(), `${prefix}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const WORKSPACE_RESPONSE = {
  workspace_id: '34',
  workspace_name: 'Acme',
  record_count: 12
};

const WORKSPACE_NO_NAME = {
  workspace_id: '34',
  record_count: 5
};

describe('runLogin', () => {
  let tmpDir: string;
  let configPath: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = makeTmpDir('elen-login-test');
    configPath = join(tmpDir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        venture_map: { test: ['repo'] },
        claimed_projects: { 'my-project': { claimed_at: '2026-01-01T00:00:00.000Z' } }
      })
    );
    for (const key of ['ELEN_CLOUD_API_KEY', 'ELEN_API_KEY', 'ELEN_CLOUD_URL', 'ELEN_USER_EMAIL']) {
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
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('writes auth block on successful login with --key flag', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => WORKSPACE_RESPONSE
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await runLogin({
      apiKeyFlag: 'lnk_testkey1234567890abcdef',
      configPath
    });

    const cfg = readUserConfig(configPath);
    expect(cfg?.venture_map).toEqual({ test: ['repo'] });
    expect(cfg?.claimed_projects?.['my-project']).toBeDefined();
    expect(cfg?.auth).toMatchObject({
      api_key: 'lnk_testkey1234567890abcdef',
      cloud_url: 'https://api.learningnodes.com',
      workspace_id: '34',
      workspace_name: 'Acme',
      logged_in_at: expect.any(String)
    });
  });

  it('aborts without writing auth on non-2xx validation', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized'
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error('process.exit called');
    });

    await expect(
      runLogin({ apiKeyFlag: 'lnk_badkey', configPath })
    ).rejects.toThrow('process.exit called');

    exitSpy.mockRestore();
    const cfg = readUserConfig(configPath);
    expect(cfg?.auth).toBeUndefined();
  });

  it('writes clean auth block when workspace_name is absent', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => WORKSPACE_NO_NAME
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    await runLogin({
      apiKeyFlag: 'lnk_testkey1234567890abcdef',
      configPath
    });

    const cfg = readUserConfig(configPath);
    expect(cfg?.auth?.workspace_id).toBe('34');
    expect(cfg?.auth?.workspace_name).toBeUndefined();
    expect(JSON.stringify(cfg?.auth)).not.toContain('undefined');
  });

  it('env var beats config for login cloud URL resolution path', async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        auth: { cloud_url: 'https://old.example.com', api_key: 'lnk_old' }
      })
    );
    process.env.ELEN_CLOUD_URL = 'https://env.example.com';

    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('env.example.com');
      return { ok: true, json: async () => WORKSPACE_RESPONSE } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await runLogin({
      apiKeyFlag: 'lnk_testkey1234567890abcdef',
      configPath
    });
  });

  it('flag beats env var for API key', async () => {
    process.env.ELEN_CLOUD_API_KEY = 'lnk_fromenv';

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer lnk_fromflag');
      return { ok: true, json: async () => WORKSPACE_RESPONSE } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    await runLogin({
      apiKeyFlag: 'lnk_fromflag',
      configPath
    });
  });
});

describe('runLogout', () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = makeTmpDir('elen-logout-test');
    configPath = join(tmpDir, 'config.json');
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('removes only auth block and preserves claimed_projects', () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        auth: { api_key: 'lnk_test', cloud_url: 'https://api.learningnodes.com', workspace_id: '1', logged_in_at: '2026-01-01T00:00:00.000Z' },
        claimed_projects: { proj: { claimed_at: '2026-01-01T00:00:00.000Z' } }
      })
    );

    runLogout({ configPath });

    const cfg = readUserConfig(configPath);
    expect(cfg?.auth).toBeUndefined();
    expect(cfg?.claimed_projects?.proj).toBeDefined();
  });
});

describe('runWhoami', () => {
  let tmpDir: string;
  let configPath: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = makeTmpDir('elen-whoami-test');
    configPath = join(tmpDir, 'config.json');
    for (const key of ['ELEN_CLOUD_API_KEY', 'ELEN_API_KEY']) {
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
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('exits non-zero when no key resolves', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number | string | null) => {
      throw new Error('process.exit called');
    });

    await expect(runWhoami({ configPath })).rejects.toThrow('process.exit called');
    exitSpy.mockRestore();
  });

  it('prints workspace info and key prefix without full key', async () => {
    writeFileSync(
      configPath,
      JSON.stringify({
        auth: {
          api_key: 'lnk_testkey1234567890abcdef',
          cloud_url: 'https://api.learningnodes.com',
          workspace_id: '34',
          logged_in_at: '2026-01-01T00:00:00.000Z'
        }
      })
    );

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => WORKSPACE_RESPONSE
    } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });

    await runWhoami({ configPath });

    const output = written.join('');
    expect(output).toContain('workspace_id: 34');
    expect(output).toContain('workspace_name: Acme');
    expect(output).toContain('api_key_prefix: lnk_testkey1');
    expect(output).not.toContain('lnk_testkey1234567890abcdef');
  });
});
