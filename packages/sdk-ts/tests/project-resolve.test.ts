import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ProjectResolveError, resolveProjectId } from '../src/project-resolve';

vi.mock('node:child_process', () => ({
  execSync: vi.fn()
}));

const execMock = vi.mocked(execSync);

describe('resolveProjectId', () => {
  beforeEach(() => {
    execMock.mockReset();
  });

  it('prefers explicit --project over git', () => {
    const result = resolveProjectId({ explicitProject: 'my-app', cwd: '/tmp/repo' });
    expect(result).toEqual({ projectId: 'my-app', source: 'explicit' });
    expect(execMock).not.toHaveBeenCalled();
  });

  it('uses normalized git remote when no explicit project', () => {
    execMock.mockImplementation((cmd: unknown) => {
      if (String(cmd).includes('remote get-url')) return 'https://github.com/LearningNodes/Elen.git\n';
      throw new Error('not found');
    });
    const result = resolveProjectId({ cwd: '/tmp/elen' });
    expect(result.projectId).toBe('learningnodes/elen');
    expect(result.source).toBe('git_remote');
  });

  it('uses venture_map when configured', () => {
    const dir = mkdtempSync(join(tmpdir(), 'elen-venture-'));
    const configPath = join(dir, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify({ venture_map: { learningnodes: ['marketplace-repos'] } })
    );
    execMock.mockImplementation(() => {
      throw new Error('no git');
    });
    const repo = join(dir, 'marketplace-repos', 'work');
    mkdirSync(repo, { recursive: true });
    const result = resolveProjectId({ cwd: repo, configPath });
    expect(result).toEqual({ projectId: 'learningnodes', source: 'venture_map' });
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects OS username as explicit project', () => {
    expect(() =>
      resolveProjectId({ explicitProject: 'testuser', osUsername: 'testuser' })
    ).toThrow(ProjectResolveError);
  });

  it('errors with guidance when nothing resolves', () => {
    execMock.mockImplementation(() => {
      throw new Error('no git');
    });
    const cwd = join(tmpdir(), 'testuser');
    mkdirSync(cwd, { recursive: true });
    expect(() => resolveProjectId({ cwd, osUsername: 'testuser' })).toThrow(ProjectResolveError);
    rmSync(cwd, { recursive: true, force: true });
  });
});
