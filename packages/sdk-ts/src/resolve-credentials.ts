import { readUserConfig } from './project-resolve';

export const DEFAULT_CLOUD_URL = 'https://api.learningnodes.com';

export type CredentialSource = 'flag' | 'env' | 'config' | 'default' | 'none';

export interface ResolveCredentialsOptions {
  cloudUrlFlag?: string;
  apiKeyFlag?: string;
  userEmailFlag?: string;
  configPath?: string;
}

export interface ResolveCredentialsResult {
  apiKey: string | undefined;
  apiKeySource: CredentialSource;
  cloudUrl: string;
  cloudUrlSource: CredentialSource;
  userEmail: string | undefined;
  userEmailSource: CredentialSource;
}

/**
 * Resolve cloud credentials with precedence: flag → env → config → default (cloud URL only).
 */
export function resolveCredentials(opts: ResolveCredentialsOptions = {}): ResolveCredentialsResult {
  const config = readUserConfig(opts.configPath);
  const auth = config?.auth;

  let apiKey: string | undefined;
  let apiKeySource: CredentialSource = 'none';
  if (opts.apiKeyFlag?.trim()) {
    apiKey = opts.apiKeyFlag.trim();
    apiKeySource = 'flag';
  } else {
    const envKey = process.env.ELEN_CLOUD_API_KEY ?? process.env.ELEN_API_KEY;
    if (envKey?.trim()) {
      apiKey = envKey.trim();
      apiKeySource = 'env';
    } else if (auth?.api_key?.trim()) {
      apiKey = auth.api_key.trim();
      apiKeySource = 'config';
    }
  }

  let cloudUrl: string;
  let cloudUrlSource: CredentialSource;
  if (opts.cloudUrlFlag?.trim()) {
    cloudUrl = opts.cloudUrlFlag.trim();
    cloudUrlSource = 'flag';
  } else if (process.env.ELEN_CLOUD_URL?.trim()) {
    cloudUrl = process.env.ELEN_CLOUD_URL.trim();
    cloudUrlSource = 'env';
  } else if (auth?.cloud_url?.trim()) {
    cloudUrl = auth.cloud_url.trim();
    cloudUrlSource = 'config';
  } else {
    cloudUrl = DEFAULT_CLOUD_URL;
    cloudUrlSource = 'default';
  }

  let userEmail: string | undefined;
  let userEmailSource: CredentialSource = 'none';
  if (opts.userEmailFlag?.trim()) {
    userEmail = opts.userEmailFlag.trim();
    userEmailSource = 'flag';
  } else if (process.env.ELEN_USER_EMAIL?.trim()) {
    userEmail = process.env.ELEN_USER_EMAIL.trim();
    userEmailSource = 'env';
  } else if (auth?.user_email?.trim()) {
    userEmail = auth.user_email.trim();
    userEmailSource = 'config';
  }

  return {
    apiKey,
    apiKeySource,
    cloudUrl,
    cloudUrlSource,
    userEmail,
    userEmailSource
  };
}
