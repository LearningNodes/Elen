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

## 0.3.1 (elen-mcp only)

Only `@learningnodes/elen-mcp` (`packages/mcp-server`) is published. The other four packages stay at 0.3.0 and are not republished.

Nico runs every publish and every login below. Nobody else, and no bot, publishes or logs in.

### npm

1. In `packages/mcp-server/package.json`, temporarily rewrite the two `file:` dependencies:

   ```json
   "@learningnodes/elen": "^0.3.0",
   "@learningnodes/elen-consolidator": "^0.3.0"
   ```

2. Build and check the tarball:

   ```bash
   cd packages/mcp-server
   npm run build
   npm pack --dry-run
   ```

   The file list must contain `README.md`, `package.json` and `dist/`, and must not contain `src/` or `tests/`.

3. Publish with two-factor sign-in:

   ```bash
   npm publish --access public
   ```

4. Restore the two `file:` dependencies (`file:../sdk-ts` and `file:../consolidator`) so the working tree builds locally again.

### MCP Registry

The server name is `com.learningnodes/elen`, proved by the DNS TXT record on `learningnodes.com`. It must equal `mcpName` in `package.json` and `name` in `server.json`.

1. Log in for the chosen namespace. **Verify against https://modelcontextprotocol.io/registry/authentication before running.**

   ```bash
   mcp-publisher login dns --domain learningnodes.com --private-key "<hex>"
   ```

2. Publish from `packages/mcp-server`, after the npm publish above has finished. **Verify against https://modelcontextprotocol.io/registry/authentication before running.**

   ```bash
   cd packages/mcp-server
   mcp-publisher publish
   ```

3. Check the entry. **Verify against https://modelcontextprotocol.io/registry/authentication before running.**

   ```bash
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=elen"
   ```

   The result must list `com.learningnodes/elen` at version 0.3.1.
