import type { MinimalDecisionRecord } from '@learningnodes/elen-core';
import { rankBySimilarity, type SimilarityCandidate } from './similarity';
import type { GraphMeta, ProjectCount } from './types';

export function buildGraphMeta(
  dbPath: string,
  agentId: string,
  projectId: string,
  rows: Array<{
    project_id: string;
    status: string;
    agent_id: string;
    question_text: string | null;
    decision_text: string;
    domain: string;
    decision_id: string;
  }>
): GraphMeta {
  const projectRows = rows.filter((r) => r.project_id === projectId);
  const active = projectRows.filter((r) => r.status === 'active').length;
  const superseded = projectRows.filter((r) => r.status === 'superseded').length;
  const total = projectRows.length;

  const projectCounts = new Map<string, number>();
  for (const r of rows) {
    projectCounts.set(r.project_id, (projectCounts.get(r.project_id) ?? 0) + 1);
  }
  const projects: ProjectCount[] = [...projectCounts.entries()]
    .map(([pid, count]) => ({ project_id: pid, count }))
    .sort((a, b) => b.count - a.count);

  const meta: GraphMeta = {
    agent_id: agentId,
    project_id: projectId,
    db_path: dbPath,
    total,
    active,
    superseded,
    projects
  };

  if (total === 0 && projects.length > 0) {
    const others = projects.filter((p) => p.project_id !== projectId);
    meta.hint =
      `No records for project "${projectId}". Other namespaces in this database: ` +
      others.map((p) => `${p.project_id} (${p.count})`).join(', ') +
      '. Pass --project or fix venture_map / git remote.';
  }

  return meta;
}

export function findDuplicateCandidates(
  input: { question: string; decisionText: string; domain: string },
  activeRows: Array<{
    decision_id: string;
    question_text?: string;
    decision_text: string;
    domain: string;
    status: string;
  }>
): SimilarityCandidate[] {
  const query = `${input.question} ${input.decisionText} ${input.domain}`;
  return rankBySimilarity(query, activeRows);
}

export interface ConsolidateCluster {
  topic: string;
  decision_ids: string[];
  reason: string;
}

export interface ConsolidateSuggestion {
  kind: 'duplicate' | 'stale' | 'contradiction';
  decision_ids: string[];
  message: string;
  proposed_action: 'supersede' | 'merge' | 'review';
}

const STALE_MS = 90 * 24 * 60 * 60 * 1000;

export function suggestConsolidation(
  records: Array<MinimalDecisionRecord & { timestamp: string }>
): { clusters: ConsolidateCluster[]; suggestions: ConsolidateSuggestion[] } {
  const active = records.filter((r) => r.status === 'active');
  const suggestions: ConsolidateSuggestion[] = [];
  const clusters: ConsolidateCluster[] = [];
  const now = Date.now();

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      const score = rankBySimilarity(
        `${a.question_text ?? ''} ${a.decision_text}`,
        [
          {
            decision_id: b.decision_id,
            question_text: b.question_text,
            decision_text: b.decision_text,
            domain: b.domain,
            status: b.status
          }
        ],
        0.65,
        1
      );
      if (score.length > 0) {
        suggestions.push({
          kind: 'duplicate',
          decision_ids: [a.decision_id, b.decision_id],
          message: `Similar active decisions (${score[0].score.toFixed(2)}): consider supersede or differentiate.`,
          proposed_action: 'supersede'
        });
      }
    }
  }

  for (const r of active) {
    const age = now - new Date(r.timestamp).getTime();
    if (age > STALE_MS) {
      suggestions.push({
        kind: 'stale',
        decision_ids: [r.decision_id],
        message: `Active decision older than 90 days — confirm still valid or supersede.`,
        proposed_action: 'review'
      });
    }
  }

  const byDomain = new Map<string, string[]>();
  for (const r of active) {
    const list = byDomain.get(r.domain) ?? [];
    list.push(r.decision_id);
    byDomain.set(r.domain, list);
  }
  for (const [domain, ids] of byDomain) {
    if (ids.length >= 2) {
      clusters.push({
        topic: domain,
        decision_ids: ids,
        reason: `${ids.length} active decisions in domain "${domain}"`
      });
    }
  }

  return { clusters, suggestions };
}
