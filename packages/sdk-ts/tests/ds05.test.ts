import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { Elen } from '../src';

describe('DS-0.5 local graph', () => {
  it('commit blocks near-duplicate active decisions unless force', async () => {
    const dbPath = join(tmpdir(), `elen-dedup-${Date.now()}.db`);
    const elen = new Elen({
      agentId: 'agent-a',
      projectId: 'proj-a',
      storage: 'sqlite',
      sqlitePath: dbPath
    });

    const first = await elen.commitDecision({
      question: 'Which auth provider?',
      domain: 'security',
      decisionText: 'Use Clerk for hosted auth',
      constraints: ['SOC2 required']
    });
    expect(first.committed?.decision_id).toBeDefined();

    const second = await elen.commitDecision({
      question: 'Which auth provider should we use?',
      domain: 'security',
      decisionText: 'Use Clerk for hosted authentication',
      constraints: ['SOC2 required']
    });
    expect(second.blocked).toBe(true);
    expect(second.similar_candidates?.length).toBeGreaterThan(0);

    const forced = await elen.commitDecision({
      question: 'Which auth provider should we use?',
      domain: 'security',
      decisionText: 'Use Clerk for hosted authentication v2',
      constraints: ['SOC2 required'],
      force: true
    });
    expect(forced.committed).toBeDefined();

    elen.close();
    rmSync(dbPath, { force: true });
  });

  it('rename and merge re-tag project_id', async () => {
    const dbPath = join(tmpdir(), `elen-admin-${Date.now()}.db`);
    const elen = new Elen({
      agentId: 'agent-a',
      projectId: 'old-name',
      storage: 'sqlite',
      sqlitePath: dbPath
    });

    await elen.commitDecision({
      question: 'Cache?',
      domain: 'infra',
      decisionText: 'Redis',
      constraints: ['fast'],
      force: true
    });

    const rename = elen.renameProject('old-name', 'new-name', { backup: false });
    expect(rename.records).toBeGreaterThan(0);

    const elen2 = new Elen({
      agentId: 'agent-a',
      projectId: 'new-name',
      storage: 'sqlite',
      sqlitePath: dbPath
    });
    const meta = elen2.getStatus();
    expect(meta.total).toBe(1);

    await elen2.commitDecision({
      question: 'DB?',
      domain: 'infra',
      decisionText: 'Postgres',
      constraints: ['durable'],
      force: true
    });

    const merge = elen2.mergeProjects(['legacy'], 'new-name', { backup: false });
    expect(merge.records).toBe(0);

    elen.close();
    elen2.close();
    rmSync(dbPath, { force: true });
  });

  it('getContext includes meta with project counts', async () => {
    const dbPath = join(tmpdir(), `elen-meta-${Date.now()}.db`);
    const elen = new Elen({
      agentId: 'agent-a',
      projectId: 'alpha',
      storage: 'sqlite',
      sqlitePath: dbPath
    });

    await elen.commitDecision({
      question: 'Q',
      domain: 'd',
      decisionText: 'A',
      constraints: ['c'],
      force: true
    });

    const ctx = await elen.getContext();
    expect(ctx.meta.agent_id).toBe('agent-a');
    expect(ctx.meta.project_id).toBe('alpha');
    expect(ctx.meta.total).toBe(1);

    elen.close();
    rmSync(dbPath, { force: true });
  });
});
