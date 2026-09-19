# Claim flow (`elen claim`)

`elen claim` links a local Elen project to a LearningNodes workspace and bulk-pushes local decision history to the cloud.

## Prerequisites

- A workspace API key (`lnk_…`) — mint from the workspace settings UI.
- `ELEN_CLOUD_URL` and the API key set via env vars, flags, or `elen login` (see [TERMINAL_AUTH.md](./TERMINAL_AUTH.md)).
- A resolved `project_id` (via `--project`, `~/.elen/config.json`, git remote, or repo directory name).

## Key = workspace

The `lnk_` API key **fully determines the workspace**. Elen calls `GET /elen/sync/workspace` with `Authorization: Bearer <key>`; the server returns `workspace_id`, optional `workspace_name`, and optional `record_count`. Claim **confirms** this workspace — it never asks you to choose among workspaces.

## Step by step

1. **Resolve workspace** — gateway lookup from the API key.
2. **Show summary** — project id, workspace name/id, key prefix, server-side record count (when returned), and count of local records to push.
3. **Consent** — `Proceed? [y/N]` with default **No**. Any input other than trimmed lowercase `y` aborts with `Aborted. Nothing was pushed.` and performs no push.
4. **Write config** — adds a `claimed_projects[project_id]` entry to `~/.elen/config.json` with workspace hint, key prefix, and timestamp.
5. **Bulk push** — `SyncEngine.push()` uploads all local records. Content-hash dedup on the server makes re-runs safe: duplicates are skipped, not re-created.
6. **Summary** — JSON with `pushed`, `duplicates`, `rejected`, and workspace name.

## Idempotency

Re-running `elen claim` on the same project is safe. Records already in the workspace (matched by `content_hash`) return `duplicate` status and are not re-inserted.

## Future: multi-workspace

One API key mapping to multiple selectable workspaces is a planned migration. It is **not supported today** — the key alone binds to exactly one workspace.

See [SETUP.md](./SETUP.md) for MCP configuration and [TERMINAL_AUTH.md](./TERMINAL_AUTH.md) for credential storage.
