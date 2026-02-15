import type { Elen } from '@learningnodes/elen';

export const elenGetCompetencyTool = {
  name: 'elen_get_competency',
  description:
    'View the competency profile for this agent — domain expertise based on validated decision history.',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: { type: 'string', description: 'Agent ID (defaults to current agent)' }
    }
  }
} as const;

export function validateCompetencyInput(input: unknown): { agentId?: string } {
  if (input === undefined) {
    return {};
  }

  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: expected object');
  }

  const candidate = input as Record<string, unknown>;
  if (candidate.agentId !== undefined && typeof candidate.agentId !== 'string') {
    throw new Error('Invalid input: agentId must be a string');
  }

  return { agentId: candidate.agentId as string | undefined };
}

export async function handleGetCompetency(elen: Elen, input: unknown, currentAgentId: string) {
  const parsed = validateCompetencyInput(input);

  if (parsed.agentId && parsed.agentId !== currentAgentId) {
    throw new Error('Cross-agent profile lookup is not supported by this MCP server');
  }

  return elen.getCompetencyProfile();
}
