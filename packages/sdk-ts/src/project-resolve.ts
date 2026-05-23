import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

export interface ElenUserConfig {
  /** Folder name or path segment → project_id */
  venture_map?: Record<string, string[]>;
  project?: string;
}

export type ProjectResolveSource =
  | 'explicit'
  | 'config'
  | 'venture_map'
  | 'git_remote'
  | 'repo_root';

export interface ProjectResolveResult {
  projectId: string;
  source: ProjectResolveSource;
}

export class ProjectResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectResolveError';
  }
}

function readUserConfig(configPath?: string): ElenUserConfig | null {
  const path = configPath ?? join(homedir(), '.elen', 'config.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ElenUserConfig;
  } catch {
    return null;
  }
}

/** Normalize git remote to owner/repo (lowercase, no .git). */
export function normalizeGitRemote(remote: string): string | null {
  const trimmed = remote.trim();
  // git@github.com:org/repo.git
  const ssh = trimmed.match(/@[^:]+:([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (ssh) return `${ssh[1].toLowerCase()}/${ssh[2].toLowerCase()}`;
  // https://github.com/org/repo.git
  const https = trimmed.match(/[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (https) return `${https[1].toLowerCase()}/${https[2].toLowerCase()}`;
  return null;
}

function gitRepoRoot(cwd: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

function gitRemoteOrigin(cwd: string): string | null {
  try {
    const remote = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      cwd,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    return normalizeGitRemote(remote);
  } catch {
    return null;
  }
}

function matchVentureMap(cwd: string, config: ElenUserConfig): string | null {
  const map = config.venture_map;
  if (!map) return null;
  const normalizedCwd = resolve(cwd).toLowerCase();
  for (const [projectId, patterns] of Object.entries(map)) {
    for (const pattern of patterns) {
      const needle = pattern.toLowerCase();
      if (normalizedCwd.includes(needle) || basename(normalizedCwd) === needle) {
        return projectId;
      }
    }
  }
  return null;
}

function isOsUsername(candidate: string, osUsername?: string): boolean {
  const user = (osUsername ?? process.env.USERNAME ?? process.env.USER ?? '').toLowerCase();
  if (!user) return false;
  return candidate.toLowerCase() === user;
}

export interface ResolveProjectOptions {
  explicitProject?: string;
  cwd?: string;
  configPath?: string;
  osUsername?: string;
}

/**
 * Precedence: (1) explicit flag/config project; (2) venture_map; (3) git remote;
 * (4) repo-root directory name. Never fall back to OS username.
 */
export function resolveProjectId(opts: ResolveProjectOptions = {}): ProjectResolveResult {
  const cwd = opts.cwd ?? process.cwd();

  if (opts.explicitProject?.trim()) {
    const id = opts.explicitProject.trim();
    if (isOsUsername(id, opts.osUsername)) {
      throw new ProjectResolveError(
        `Project id "${id}" matches your OS username — Elen does not use usernames as project ids. ` +
          `Pass --project <name>, set project in ~/.elen/config.json, or run from a git repo with a remote.`
      );
    }
    return { projectId: id, source: 'explicit' };
  }

  const config = readUserConfig(opts.configPath);
  if (config?.project?.trim()) {
    const id = config.project.trim();
    if (isOsUsername(id, opts.osUsername)) {
      throw new ProjectResolveError(
        `config.json "project" must not be your OS username. Use a repo or venture name instead.`
      );
    }
    return { projectId: id, source: 'config' };
  }

  const ventureHit = config ? matchVentureMap(cwd, config) : null;
  if (ventureHit) {
    return { projectId: ventureHit, source: 'venture_map' };
  }

  const remote = gitRemoteOrigin(cwd);
  if (remote) {
    return { projectId: remote, source: 'git_remote' };
  }

  const root = gitRepoRoot(cwd) ?? cwd;
  const dirName = basename(root);
  if (dirName && dirName !== '.' && !isOsUsername(dirName, opts.osUsername)) {
    return { projectId: dirName, source: 'repo_root' };
  }

  throw new ProjectResolveError(
    'Could not resolve project_id. Set one explicitly:\n' +
      '  • MCP/CLI: --project <id>\n' +
      '  • ~/.elen/config.json: { "project": "my-app" }\n' +
      '  • Multi-repo venture: { "venture_map": { "learningnodes": ["marketplace-repos"] } }\n' +
      '  • Or initialize git with `git remote add origin ...` so owner/repo is detected.\n' +
      'Elen never uses your OS username as a project namespace.'
  );
}
