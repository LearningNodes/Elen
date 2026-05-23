import type { Elen } from '@learningnodes/elen';

export const elenStatusTool = {
  name: 'elen_status',
  description:
    'Return local graph observability meta (agent, project, db path, counts, other projects). Call to verify namespace before committing.',
  inputSchema: {
    type: 'object',
    properties: {}
  }
};

export async function handleStatus(elen: Elen): Promise<unknown> {
  return elen.getStatus();
}
