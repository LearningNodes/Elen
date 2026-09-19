import { z } from 'zod';
import { resolveCredentials } from '@learningnodes/elen';
import type { Elen } from '@learningnodes/elen';

export const elenIncomingTool = {
  name: 'elen_incoming',
  description:
    'List decisions other principals have shared into your workspace (the grants inbox), with grant metadata and the shared decision. Query-only; nothing is written locally.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Max results (default 50, max 200)' }
    }
  }
};

export const incomingInputSchema = z.object({
  limit: z.number().int().min(1).max(200).optional().default(50)
});

export async function handleIncoming(_elen: Elen, args: unknown): Promise<unknown> {
  const parsed = incomingInputSchema.parse(args);

  const connected =
    process.env.ELEN_CONNECTED === 'true' || process.env.ELEN_CONNECTED === '1';
  const { apiKey, cloudUrl } = resolveCredentials();

  if (!connected || !cloudUrl || !apiKey) {
    return {
      connected: false,
      message:
        'Elen is not connected. Run `elen login` (or set ELEN_CONNECTED=true, ELEN_CLOUD_URL, and ELEN_CLOUD_API_KEY / ELEN_API_KEY) to read your grants inbox.',
      incoming: []
    };
  }

  const base = cloudUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ limit: String(parsed.limit) });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (process.env.ELEN_AGENT_ID) {
    headers['X-Agent-Id'] = process.env.ELEN_AGENT_ID;
  }

  const res = await fetch(`${base}/elen/mcp/incoming?${params}`, {
    method: 'GET',
    headers
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Incoming grants fetch failed (${res.status}): ${body}`);
  }

  const body = (await res.json()) as { incoming: unknown[] };
  return { connected: true, incoming: body.incoming ?? [] };
}
