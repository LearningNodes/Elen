# Changelog

All notable changes to Elen packages are documented here.

## 0.3.0 — 2026-07-03

### Added

- **Terminal auth** (`mcp-server`, `sdk-ts`): `elen login` / `elen whoami` / `elen logout` CLI commands. Key-paste login validates an `lnk_` API key via `GET /elen/sync/workspace` and persists an `auth` block to `~/.elen/config.json`. Shared `resolveCredentials` module resolves API key, cloud URL, and user email from flags → env → config → default.
- **Team-read MCP tools** (`mcp-server`): `elen_team_search` (workspace keyword search via `GET /elen/mcp/search`) and `elen_incoming` (cross-principal grants inbox via `GET /elen/mcp/incoming`). Query-only — nothing written to local SQLite.
- **Onboarding docs** (repo root): `TERMINAL_AUTH.md`, `CLAIM_FLOW.md`, and `SETUP.md` covering terminal auth, claim flow, and connected-mode MCP configuration.

### Fixed

- **Sync push — chunked batches** (`sdk-ts`): Push sends records in chunks (default 20) to survive server body limits; partial progress is reported on failure; re-run is idempotent via content-hash dedup.
- **Sync wire format** (`sdk-ts`): Aligned push request/response to deployed server — `items` array and server `status` field names on push results.
- **Sync push ordering** (`sdk-ts`): Supersede targets are pushed before their superseders so dependency order is respected server-side.
- **Documentation npx pins** corrected from `@learningnodes/elen-mcp@0.1.7` to `@0.3.0` in `AGENTS.md` and `README.md`.

### Changed

- **Claim flow** (`mcp-server`): Consent summary now shows server-side workspace record count when returned by `GET /elen/sync/workspace`.
- **Sync auth comments** (`sdk-ts`): Removed stale BLOCKER notes on `CloudMcpStorage` — gateway `/elen/sync/*` routes authenticate via Bearer `lnk_` API keys.

### Package versions

| Package | Old | New |
|---|---|---|
| `@learningnodes/elen-core` | 0.2.0 | 0.3.0 |
| `@learningnodes/elen` (sdk-ts) | 0.2.0 | 0.3.0 |
| `@learningnodes/elen-mcp` | 0.2.0 | 0.3.0 |
| `@learningnodes/elen-consolidator` | 0.2.0 | 0.3.0 |
| `@learningnodes/elen-local-api` | 0.2.0 | 0.3.0 |

## 0.2.0 — 2026-06-11

### Added

- **PRAGMA user_version** (`sdk-ts`): SQLiteStorage now sets `user_version = 2` on fresh DB creation and after each migration run. Old DBs with `user_version = 0` still hit the full column-sniff/rebuild path; once migrated they are marked at version 2 and skip migration on subsequent opens.
- **Sync client — push/pull** (`sdk-ts`): `SyncEngine` (DS-0 §6) with `push()` and `pull()` methods; `CloudMcpStorage.pushBatch()` and `pullBatch()`; `computeContentHash()` for stable content-addressed hashing of decision records; `SQLiteStorage.upsertCloudRecord()` and `listLocalRecordsForPush()`.
- **Claim flow** (`mcp-server`): `elen claim` CLI sub-command for linking a local DB to a cloud workspace via API key.
- **CORS workstation origins** (`mcp-server`, `local-api`): `https://workstation.learningnodes.com` and `https://workstation.dev.learningnodes.com` added to CORS allowlist in both the embedded local-api (inside mcp-server) and the standalone `elen-local-api` package.
- **`ELEN_LOCAL_API_PORT` env var** (`mcp-server`, `local-api`): Port selection now reads `ELEN_LOCAL_API_PORT` first, then falls back to `ELEN_API_PORT`, then to `3333`. The old `ELEN_API_PORT` name remains accepted for backward compatibility.
- **EADDRINUSE handler** (`mcp-server`, `local-api`): If the local API port is already in use, the server logs a message to stderr and does not crash the MCP stdio process.

### Fixed

- **`consolidator.js` + `check.js`** (`consolidator`): All `record_json` column references renamed to `payload_json` to match the current `records` table schema. Affected: `SELECT` queries, `UPDATE` statements, `JSON.parse` calls, and named-parameter keys.

### Changed

- `/api/health` version string bumped to `0.2.0` in both `mcp-server/src/local-api.ts` and `local-api/index.js` (previously `0.1.6`).
- AGENTS.md npx pin updated from `@0.1.7` to `@0.2.0`.

### Package versions

| Package | Old | New |
|---|---|---|
| `@learningnodes/elen-core` | 0.1.6 | 0.2.0 |
| `@learningnodes/elen` (sdk-ts) | 0.1.6 | 0.2.0 |
| `@learningnodes/elen-mcp` | 0.1.7 | 0.2.0 |
| `@learningnodes/elen-consolidator` | 0.1.1 | 0.2.0 |
| `@learningnodes/elen-local-api` | 0.1.1 | 0.2.0 |
