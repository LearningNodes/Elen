# Publish checklist (DS-0.5)

Publish in dependency order. Before publishing `@learningnodes/elen-mcp`, set its dependencies to published ranges (not `file:`):

```json
"@learningnodes/elen": "^0.1.6",
"@learningnodes/elen-consolidator": "^0.1.1"
```

## Dry-run

```bash
cd packages/core && npm publish --dry-run
cd packages/sdk-ts && npm publish --dry-run
cd packages/consolidator && npm publish --dry-run
cd packages/local-api && npm publish --dry-run
cd packages/mcp-server && npm publish --dry-run
```

## Versions

| Package | Version |
|---------|---------|
| `@learningnodes/elen-core` | 0.1.6 |
| `@learningnodes/elen` | 0.1.6 |
| `@learningnodes/elen-consolidator` | 0.1.1 |
| `@learningnodes/elen-local-api` | 0.1.1 |
| `@learningnodes/elen-mcp` | 0.1.7 |

After publish, point MCP configs at `@learningnodes/elen-mcp@0.1.7` (or `@latest` for per-client native prebuilds).
