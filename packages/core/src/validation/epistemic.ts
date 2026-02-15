import type { EpistemicType, Evidence } from '../types';

const empiricalPattern = /\b(benchmark|test|measured|tps|latency|ms)\b/i;
const authoritativePattern = /\b(documentation|docs|recommends|official)\b/i;
const precedentPattern = /\b(rec-|decision record|precedent|previously validated)\b/i;
const heuristicPattern = /\b(experience|typically|usually|rule of thumb)\b/i;

export function classifyEpistemicType(evidence: Evidence): EpistemicType {
  const text = `${evidence.claim} ${evidence.proof}`;

  if (empiricalPattern.test(text)) {
    return 'empirical';
  }

  if (authoritativePattern.test(text)) {
    return 'authoritative';
  }

  if (precedentPattern.test(text)) {
    return 'precedent';
  }

  if (heuristicPattern.test(text)) {
    return 'heuristic';
  }

  return 'analytical';
}
