import { createRequire } from 'node:module';
import { z } from 'zod';
import type { Elen } from '@learningnodes/elen';

const requireConsolidator = createRequire(__filename);

function runConsolidatorDaemon(dbPath: string): {
  processed: number;
  clustered: number;
  bridged: number;
} {
  const pkg = requireConsolidator('@learningnodes/elen-consolidator') as Record<string, unknown>;
  const consolidateFn = pkg.consolidate;
  if (typeof consolidateFn !== 'function') {
    throw new Error('@learningnodes/elen-consolidator did not export consolidate()');
  }
  return (consolidateFn as (path: string) => { processed: number; clustered: number; bridged: number })(
    dbPath
  );
}

export const elenConsolidateTool = {
  name: 'elen_consolidate',
  description:
    'Suggest consolidation clusters and duplicate/stale candidates. Does not modify the graph — apply supersede/merge only after human confirmation.',
  inputSchema: {
    type: 'object',
    properties: {
      apply: {
        type: 'boolean',
        description: 'If true, run the consolidator daemon to enrich thread metadata (backs up DB first). Never auto-deletes.'
      }
    }
  }
};

export const consolidateInputSchema = z.object({
  apply: z.boolean().optional()
});

export async function handleConsolidate(elen: Elen, args: unknown, dbPath: string): Promise<unknown> {
  const parsed = consolidateInputSchema.parse(args ?? {});
  const suggestions = await elen.consolidate();

  if (!parsed.apply) {
    return { mode: 'suggest', ...suggestions };
  }

  const backupPath = elen.backup();
  const result = runConsolidatorDaemon(dbPath);
  return { mode: 'apply', backup: backupPath, daemon: result, ...suggestions };
}
