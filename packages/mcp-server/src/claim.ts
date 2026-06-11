import * as readline from 'node:readline';
import { SQLiteStorage } from '@learningnodes/elen';
import { CloudMcpStorage } from '@learningnodes/elen';
import { SyncEngine } from '@learningnodes/elen';
import { readUserConfig, writeUserConfig } from '@learningnodes/elen';
import type { SyncPushResultItem } from '@learningnodes/elen';

export interface ClaimOptions {
  /** project_id to claim (already resolved by resolveProjectId) */
  projectId: string;
  /** Local SQLite DB path */
  storagePath: string;
  /** Gateway base URL, e.g. https://api.learningnodes.com */
  cloudUrl: string;
  /** Bearer lnk_ API key */
  apiKey: string;
  /** Agent ID used for SyncEngine */
  agentId?: string;
  /** Override config path for tests */
  configPath?: string;
  /**
   * Injectable readline interface for testing.
   * When provided, claim.ts will NOT create its own and will NOT close stdin.
   */
  rl?: readline.Interface;
}

/**
 * Information the gateway returns when we pre-check the API key.
 * The gateway endpoint GET /elen/sync/workspace derives the workspace from
 * the Bearer key, so the user never has to supply it.
 */
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

/** Ask the user a yes/no question via readline. Default is No. */
function askConsent(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/**
 * runClaim — interactive flow for `elen claim`.
 *
 * (1) Resolves workspace from the API key (server side).
 * (2) Shows the user: project_id, key prefix, local record count.
 * (3) Requires explicit "y" consent; any other input aborts.
 * (4) Writes claimed_projects entry to ~/.elen/config.json.
 * (5) Bulk-pushes all local records via SyncEngine (content_hash dedup = idempotent).
 * (6) Prints {pushed, duplicates, rejected, workspace}.
 */
export async function runClaim(opts: ClaimOptions): Promise<void> {
  const { projectId, storagePath, cloudUrl, apiKey, configPath } = opts;
  const agentId = opts.agentId ?? 'claim-agent';
  const keyPrefix = apiKey.length > 10 ? apiKey.slice(0, 10) + '...' : apiKey;

  // ── 1. Resolve workspace from key ──────────────────────────────────
  process.stdout.write(`Resolving workspace for key ${keyPrefix} ...\n`);
  let workspaceInfo: WorkspaceInfo;
  try {
    workspaceInfo = await fetchWorkspaceInfo(cloudUrl, apiKey);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`claim: ${msg}\n`);
    process.exit(1);
  }

  const workspaceName = workspaceInfo.workspace_name ?? workspaceInfo.workspace_id;

  // ── 2. Count local records ─────────────────────────────────────────
  const local = new SQLiteStorage(storagePath, projectId, 'open');
  let localCount = 0;
  try {
    const batch = await local.listLocalRecordsForPush();
    localCount = batch.length;
  } finally {
    // keep local open for later push
  }

  // ── 3. Display summary and request consent ─────────────────────────
  process.stdout.write('\n');
  process.stdout.write(`  Project : ${projectId}\n`);
  process.stdout.write(`  Workspace: ${workspaceName}\n`);
  process.stdout.write(`  API key : ${keyPrefix}\n`);
  process.stdout.write(`  Records to push: ${localCount}\n`);
  process.stdout.write('\n');
  process.stdout.write(
    'This will link the project to your workspace and upload all local history.\n' +
      'Content-hash dedup makes this idempotent — running again skips duplicates.\n'
  );
  process.stdout.write('\n');

  const ownRl = !opts.rl;
  const rl =
    opts.rl ??
    readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

  let consented = false;
  try {
    consented = await askConsent(rl, 'Proceed? [y/N] ');
  } finally {
    if (ownRl) rl.close();
  }

  if (!consented) {
    process.stdout.write('Aborted. Nothing was pushed.\n');
    return;
  }

  // ── 4. Write claimed_projects to config ───────────────────────────
  const config = readUserConfig(configPath) ?? {};
  config.claimed_projects = config.claimed_projects ?? {};
  config.claimed_projects[projectId] = {
    workspace_hint: workspaceName,
    api_key_prefix: keyPrefix,
    claimed_at: new Date().toISOString()
  };
  writeUserConfig(config, configPath);
  process.stdout.write(`Config updated: ${projectId} claimed to workspace "${workspaceName}".\n`);

  // ── 5. Bulk push via SyncEngine ───────────────────────────────────
  const cloud = new CloudMcpStorage({
    apiUrl: cloudUrl,
    apiKey,
    agentId
  });
  const engine = new SyncEngine({ cloud, local });

  process.stdout.write('Pushing local history ...\n');
  const pushResponse = await engine.push();

  // ── 6. Print summary ──────────────────────────────────────────────
  local.close();

  const results: SyncPushResultItem[] = pushResponse.results;
  const pushed = results.filter((r) => r.status === 'created').length;
  const duplicates = results.filter((r) => r.status === 'duplicate').length;
  const rejected = results.filter((r) => r.status === 'error').length;

  process.stdout.write('\n');
  process.stdout.write('Claim complete.\n');
  process.stdout.write(
    JSON.stringify({ workspace: workspaceName, pushed, duplicates, rejected }, null, 2) + '\n'
  );

  if (rejected > 0) {
    process.stderr.write(
      `Warning: ${rejected} record(s) were rejected by the server. Run with verbose logging for details.\n`
    );
  }
}
