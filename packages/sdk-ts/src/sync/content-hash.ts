import { createHash } from 'node:crypto';

/**
 * DS-0 §6.2 canonical content hash.
 *
 * Canonical JSON has a fixed key order:
 *   question_text, decision_text, constraint_set_id, domain, agent_id, refs
 *
 * Rules:
 *   - null/undefined question_text → empty string ''
 *   - refs sorted ascending before hashing
 *   - SHA-256 hex output
 *
 * This golden vector must match the ai-service planner's implementation byte-for-byte.
 * Any change to key order, null handling, or refs sort breaks cross-device dedup.
 */
export interface ContentHashInput {
  question_text?: string | null;
  decision_text: string;
  constraint_set_id: string;
  domain: string;
  agent_id: string;
  refs?: string[];
}

export function computeContentHash(record: ContentHashInput): string {
  const canonical = {
    question_text: record.question_text ?? '',
    decision_text: record.decision_text,
    constraint_set_id: record.constraint_set_id,
    domain: record.domain,
    agent_id: record.agent_id,
    refs: [...(record.refs ?? [])].sort()
  };
  const json = JSON.stringify(canonical);
  return createHash('sha256').update(json).digest('hex');
}
