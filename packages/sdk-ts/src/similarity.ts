const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or',
  'if', 'while', 'that', 'this', 'these', 'those', 'it', 'its',
  'we', 'us', 'our', 'they', 'them', 'their', 'what', 'which', 'who'
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function termFrequency(tokens: string[]): Record<string, number> {
  const tf: Record<string, number> = {};
  for (const token of tokens) {
    tf[token] = (tf[token] ?? 0) + 1;
  }
  const max = Math.max(...Object.values(tf), 1);
  for (const key of Object.keys(tf)) {
    tf[key] /= max;
  }
  return tf;
}

export function cosineSimilarity(textA: string, textB: string): number {
  const tfA = termFrequency(tokenize(textA));
  const tfB = termFrequency(tokenize(textB));
  const terms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const term of terms) {
    const a = tfA[term] ?? 0;
    const b = tfB[term] ?? 0;
    dot += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.55;

export interface SimilarityCandidate {
  decision_id: string;
  question_text?: string;
  decision_text: string;
  domain: string;
  status: string;
  score: number;
}

export function rankBySimilarity(
  queryText: string,
  rows: Array<{
    decision_id: string;
    question_text?: string;
    decision_text: string;
    domain: string;
    status: string;
  }>,
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
  limit = 5
): SimilarityCandidate[] {
  const scored = rows
    .map((r) => {
      const corpus = `${r.question_text ?? ''} ${r.decision_text} ${r.domain}`;
      return { ...r, score: cosineSimilarity(queryText, corpus) };
    })
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
  return limit ? scored.slice(0, limit) : scored;
}
