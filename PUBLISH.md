# Publish checklist (0.3.0)

Publish in **dependency order** (leaf first). Each package is published individually with `npm publish` from its own directory — there is no root workspace or changesets.

## Publish order

1. `@learningnodes/elen-core` (`packages/core`)
2. `@learningnodes/elen-consolidator` (`packages/consolidator`)
3. `@learningnodes/elen` (`packages/sdk-ts`)
4. `@learningnodes/elen-local-api` (`packages/local-api`)
5. `@learningnodes/elen-mcp` (`packages/mcp-server`)

## Pre-publish rewrite for `mcp-server` only

The committed `packages/mcp-server/package.json` uses `file:` links for local development. Before publishing `@learningnodes/elen-mcp`, temporarily set dependencies to published ranges:

```json
"@learningnodes/elen": "^0.3.0",
"@learningnodes/elen-consolidator": "^0.3.0"
```

Restore the `file:` links after publishing so the working tree continues to build locally.

## Dry-run

Verifies each tarball without writing to the registry:

```bash
cd packages/core && npm publish --dry-run
cd packages/consolidator && npm publish --dry-run
cd packages/sdk-ts && npm publish --dry-run
cd packages/local-api && npm publish --dry-run
cd packages/mcp-server && npm publish --dry-run
```

## Versions

| Package | Version |
|---------|---------|
| `@learningnodes/elen-core` | 0.3.0 |
| `@learningnodes/elen` | 0.3.0 |
| `@learningnodes/elen-consolidator` | 0.3.0 |
| `@learningnodes/elen-local-api` | 0.3.0 |
| `@learningnodes/elen-mcp` | 0.3.0 |

After publish, point MCP configs at `@learningnodes/elen-mcp@0.3.0` (or `@latest` for per-client native prebuilds).
