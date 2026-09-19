import { z } from 'zod';
import { resolveCredentials } from '@learningnodes/elen';
import type { Elen } from '@learningnodes/elen';

export const elenTeamSearchTool = {
  name: 'elen_team_search',
  description:
    'Search team and human decisions visible to your workspace for a topic. Query-only; nothing is written locally.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Topic to search' },
      domain: { type: 'string', description: 'Filter by domain' },
      limit: { type: 'number', description: 'Max results (default 50, max 200)' }
    }
  }
};

export const teamSearchInputSchema = z.object({
  query: z.string().optional(),
  domain: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50)
});

interface TeamDecisionRow {
  decision_id: string;
  question_text: string;
  decision_text: string;
  domain?: string;
  status: string;
  supersedes_id?: string | null;
  refs?: unknown[];
  content_hash?: string;
  updated_at?: string;
  created_at?: string;
  sync_version?: number;
  agent_id?: string;
  workspace_id?: string;
  principal_id?: string;
  [key: string]: unknown;
}

function questionsOverlap(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return la === lb || la.includes(lb) || lb.includes(la);
}

function sourceLabel(agentId: string | undefined): string {
  return typeof agentId === 'string' && agentId.length > 0 ? 'agent atom' : 'human decision record';
}

export async function handleTeamSearch(elen: Elen, args: unknown): Promise<unknown> {
  const parsed = teamSearchInputSchema.parse(args);

  const connected =
    process.env.ELEN_CONNECTED === 'true' || process.env.ELEN_CONNECTED === '1';
  const { apiKey, cloudUrl } = resolveCredentials();

  if (!connected || !cloudUrl || !apiKey) {
    return {
      connected: false,
      message:
        'Elen is not connected. Run `elen login` (or set ELEN_CONNECTED=true, ELEN_CLOUD_URL, and ELEN_CLOUD_API_KEY / ELEN_API_KEY) to read team decisions.',
      decisions: []
    };
  }

  const base = cloudUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ limit: String(parsed.limit) });
  if (parsed.query) params.set('q', parsed.query);
  if (parsed.domain) params.set('domain', parsed.domain);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (process.env.ELEN_AGENT_ID) {
    headers['X-Agent-Id'] = process.env.ELEN_AGENT_ID;
  }

  const res = await fetch(`${base}/elen/mcp/search?${params}`, {
    method: 'GET',
    headers
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Team search failed (${res.status}): ${body}`);
  }

  const body = (await res.json()) as { decisions: TeamDecisionRow[] };
  const rows = body.decisions ?? [];

  let localAtoms: Array<{ decision_id: string; question_text: string }> = [];
  if (parsed.query) {
    const suggested = await elen.suggest({
      query: parsed.query,
      domain: parsed.domain,
      limit: parsed.limit
    });
    localAtoms = (suggested as Array<{ decision_id: string; question_text: string }>) ?? [];
  }

  const decisions = rows.map((row) => {
    const item: TeamDecisionRow & {
      source_label: string;
      conflict_note?: string;
      local_atom_ref?: string;
    } = {
      ...row,
      source_label: sourceLabel(row.agent_id)
    };

    if (parsed.query && row.question_text) {
      for (const atom of localAtoms) {
        if (atom.question_text && questionsOverlap(row.question_text, atom.question_text)) {
          item.conflict_note = 'A human decision exists on this question.';
          item.local_atom_ref = atom.decision_id;
          break;
        }
      }
    }

    return item;
  });

  return { connected: true, decisions };
}
