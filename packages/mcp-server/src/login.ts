import { chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { stdin } from 'node:process';
import * as readline from 'node:readline';
import {
  readUserConfig,
  writeUserConfig,
  resolveCredentials,
  DEFAULT_CLOUD_URL,
  type ElenAuthConfig
} from '@learningnodes/elen';

export interface LoginOptions {
  apiKeyFlag?: string;
  cloudUrlFlag?: string;
  userEmailFlag?: string;
  configPath?: string;
  rl?: readline.Interface;
}

export interface WhoamiOptions {
  apiKeyFlag?: string;
  cloudUrlFlag?: string;
  userEmailFlag?: string;
  configPath?: string;
}

export interface LogoutOptions {
  configPath?: string;
}

interface WorkspaceInfo {
  workspace_id: string;
  workspace_name?: string;
  record_count?: number;
}

async function fetchWorkspaceInfo(cloudUrl: string, apiKey: string): Promise<WorkspaceInfo> {
  const base = cloudUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/elen/sync/workspace`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Could not resolve workspace from API key (${res.status}): ${body}`);
  }
  return res.json() as Promise<WorkspaceInfo>;
}

function defaultConfigPath(configPath?: string): string {
  return configPath ?? join(homedir(), '.elen', 'config.json');
}

function chmodConfigBestEffort(configPath: string): void {
  try {
    chmodSync(configPath, 0o600);
  } catch {
    // Windows chmod is effectively a no-op; ignore permission errors
  }
}

async function readKeyLine(rl?: readline.Interface): Promise<string> {
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf-8').trim();
  }

  const ownRl = !rl;
  const interface_ =
    rl ??
    readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

  try {
    return await new Promise<string>((resolve) => {
      interface_.question('Paste your LearningNodes API key (lnk_...): ', (answer) => {
        resolve(answer.trim());
      });
    });
  } finally {
    if (ownRl) interface_.close();
  }
}

function resolveLoginKey(opts: LoginOptions): string | undefined {
  if (opts.apiKeyFlag?.trim()) return opts.apiKeyFlag.trim();
  const envKey = process.env.ELEN_CLOUD_API_KEY ?? process.env.ELEN_API_KEY;
  if (envKey?.trim()) return envKey.trim();
  return undefined;
}

function resolveLoginCloudUrl(opts: LoginOptions): string {
  if (opts.cloudUrlFlag?.trim()) return opts.cloudUrlFlag.trim();
  if (process.env.ELEN_CLOUD_URL?.trim()) return process.env.ELEN_CLOUD_URL.trim();
  const config = readUserConfig(opts.configPath);
  if (config?.auth?.cloud_url?.trim()) return config.auth.cloud_url.trim();
  return DEFAULT_CLOUD_URL;
}

function resolveLoginUserEmail(opts: LoginOptions): string | undefined {
  if (opts.userEmailFlag?.trim()) return opts.userEmailFlag.trim();
  if (process.env.ELEN_USER_EMAIL?.trim()) return process.env.ELEN_USER_EMAIL.trim();
  const config = readUserConfig(opts.configPath);
  if (config?.auth?.user_email?.trim()) return config.auth.user_email.trim();
  return undefined;
}

function buildAuthBlock(
  apiKey: string,
  cloudUrl: string,
  userEmail: string | undefined,
  workspaceInfo: WorkspaceInfo
): ElenAuthConfig {
  const auth: ElenAuthConfig = {
    api_key: apiKey,
    cloud_url: cloudUrl,
    workspace_id: workspaceInfo.workspace_id,
    logged_in_at: new Date().toISOString()
  };
  if (userEmail) auth.user_email = userEmail;
  if (workspaceInfo.workspace_name) {
    auth.workspace_name = workspaceInfo.workspace_name;
  }
  return auth;
}

/**
 * runLogin — validate an API key and persist the auth block to ~/.elen/config.json.
 */
export async function runLogin(opts: LoginOptions = {}): Promise<void> {
  let apiKey = resolveLoginKey(opts);
  if (!apiKey) {
    apiKey = await readKeyLine(opts.rl);
  }
  if (!apiKey) {
    process.stderr.write('login: no API key provided.\n');
    process.exit(1);
  }

  const cloudUrl = resolveLoginCloudUrl(opts);
  const userEmail = resolveLoginUserEmail(opts);

  let workspaceInfo: WorkspaceInfo;
  try {
    workspaceInfo = await fetchWorkspaceInfo(cloudUrl, apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`login: ${msg}\n`);
    process.exit(1);
  }

  const config = readUserConfig(opts.configPath) ?? {};
  config.auth = buildAuthBlock(apiKey, cloudUrl, userEmail, workspaceInfo);

  const path = defaultConfigPath(opts.configPath);
  writeUserConfig(config, opts.configPath);
  chmodConfigBestEffort(path);

  const workspaceName = workspaceInfo.workspace_name ?? workspaceInfo.workspace_id;
  process.stdout.write(`Logged in to workspace "${workspaceName}".\n`);
}

/**
 * runWhoami — print resolved workspace identity and key prefix.
 */
export async function runWhoami(opts: WhoamiOptions = {}): Promise<void> {
  const creds = resolveCredentials({
    apiKeyFlag: opts.apiKeyFlag,
    cloudUrlFlag: opts.cloudUrlFlag,
    userEmailFlag: opts.userEmailFlag,
    configPath: opts.configPath
  });

  if (!creds.apiKey) {
    process.stderr.write('No API key found. Run `elen login` to store credentials.\n');
    process.exit(1);
  }

  let workspaceInfo: WorkspaceInfo;
  try {
    workspaceInfo = await fetchWorkspaceInfo(creds.cloudUrl, creds.apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`whoami: ${msg}\n`);
    process.exit(1);
  }

  const keyPrefix = creds.apiKey.slice(0, 12);
  const workspaceName = workspaceInfo.workspace_name ?? workspaceInfo.workspace_id;

  process.stdout.write(`workspace_id: ${workspaceInfo.workspace_id}\n`);
  process.stdout.write(`workspace_name: ${workspaceName}\n`);
  if (typeof workspaceInfo.record_count === 'number') {
    process.stdout.write(`record_count: ${workspaceInfo.record_count}\n`);
  }
  process.stdout.write(`api_key_prefix: ${keyPrefix}\n`);
}

/**
 * runLogout — remove the auth block from config, preserving other keys.
 */
export function runLogout(opts: LogoutOptions = {}): void {
  const config = readUserConfig(opts.configPath);
  if (!config?.auth) {
    process.stdout.write('No stored credentials to remove.\n');
    return;
  }

  delete config.auth;
  const path = defaultConfigPath(opts.configPath);
  writeUserConfig(config, opts.configPath);
  chmodConfigBestEffort(path);
  process.stdout.write('Logged out. Credentials removed from config.\n');
}
