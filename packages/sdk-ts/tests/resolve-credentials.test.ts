import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveCredentials, DEFAULT_CLOUD_URL } from '../src/resolve-credentials';

describe('resolveCredentials', () => {
  let tmpDir: string;
  let configPath: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'elen-creds-'));
    configPath = join(tmpDir, 'config.json');
    for (const key of ['ELEN_CLOUD_API_KEY', 'ELEN_API_KEY', 'ELEN_CLOUD_URL', 'ELEN_USER_EMAIL']) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses flag over env over config over default for cloud URL', () => {
    writeFileSync(
      configPath,
      JSON.stringify({ auth: { cloud_url: 'https://config.example.com' } })
    );
    process.env.ELEN_CLOUD_URL = 'https://env.example.com';

    const flagResult = resolveCredentials({ cloudUrlFlag: 'https://flag.example.com', configPath });
    expect(flagResult.cloudUrl).toBe('https://flag.example.com');
    expect(flagResult.cloudUrlSource).toBe('flag');

    const envResult = resolveCredentials({ configPath });
    expect(envResult.cloudUrl).toBe('https://env.example.com');
    expect(envResult.cloudUrlSource).toBe('env');

    delete process.env.ELEN_CLOUD_URL;
    const configResult = resolveCredentials({ configPath });
    expect(configResult.cloudUrl).toBe('https://config.example.com');
    expect(configResult.cloudUrlSource).toBe('config');

    writeFileSync(configPath, JSON.stringify({}));
    const defaultResult = resolveCredentials({ configPath });
    expect(defaultResult.cloudUrl).toBe(DEFAULT_CLOUD_URL);
    expect(defaultResult.cloudUrlSource).toBe('default');
  });

  it('uses flag over env over config for API key (canonical env first)', () => {
    writeFileSync(
      configPath,
      JSON.stringify({ auth: { api_key: 'lnk_configkey' } })
    );
    process.env.ELEN_CLOUD_API_KEY = 'lnk_envcanonical';
    process.env.ELEN_API_KEY = 'lnk_envalias';

    const flagResult = resolveCredentials({ apiKeyFlag: 'lnk_flagkey', configPath });
    expect(flagResult.apiKey).toBe('lnk_flagkey');
    expect(flagResult.apiKeySource).toBe('flag');

    const envResult = resolveCredentials({ configPath });
    expect(envResult.apiKey).toBe('lnk_envcanonical');
    expect(envResult.apiKeySource).toBe('env');

    delete process.env.ELEN_CLOUD_API_KEY;
    const aliasResult = resolveCredentials({ configPath });
    expect(aliasResult.apiKey).toBe('lnk_envalias');
    expect(aliasResult.apiKeySource).toBe('env');

    delete process.env.ELEN_API_KEY;
    const configResult = resolveCredentials({ configPath });
    expect(configResult.apiKey).toBe('lnk_configkey');
    expect(configResult.apiKeySource).toBe('config');
  });

  it('uses flag over env over config for user email', () => {
    writeFileSync(
      configPath,
      JSON.stringify({ auth: { user_email: 'config@example.com' } })
    );
    process.env.ELEN_USER_EMAIL = 'env@example.com';

    const flagResult = resolveCredentials({ userEmailFlag: 'flag@example.com', configPath });
    expect(flagResult.userEmail).toBe('flag@example.com');
    expect(flagResult.userEmailSource).toBe('flag');

    const envResult = resolveCredentials({ configPath });
    expect(envResult.userEmail).toBe('env@example.com');
    expect(envResult.userEmailSource).toBe('env');

    delete process.env.ELEN_USER_EMAIL;
    const configResult = resolveCredentials({ configPath });
    expect(configResult.userEmail).toBe('config@example.com');
    expect(configResult.userEmailSource).toBe('config');
  });
});
