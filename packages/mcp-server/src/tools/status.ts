import type { Elen } from '@learningnodes/elen';

export const elenStatusTool = {
  name: 'elen_status',
  description:
    'Show which workspace this connection writes to, which bots have recorded decisions, and the totals.',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false
  },
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handleStatus(elen: Elen): Promise<unknown> {
  return elen.getStatus();
}
