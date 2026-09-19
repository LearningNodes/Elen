# Setup guide

This guide covers **connected** MCP mode (cloud commits and team reads). For local-only mode, see the [README](./README.md).

## Connected MCP configuration

Connected mode requires all four environment variables below. `ELEN_USER_EMAIL` is mandatory — the MCP server throws at startup without it.

### Cursor (`~/.cursor/mcp.json` or project `.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "elen": {
      "command": "npx",
      "args": ["-y", "@learningnodes/elen-mcp"],
      "env": {
        "ELEN_CONNECTED": "true",
        "ELEN_CLOUD_URL": "https://api.learningnodes.com",
        "ELEN_USER_EMAIL": "you@example.com",
        "ELEN_CLOUD_API_KEY": "lnk_<your key>"
      }
    }
  }
}
```

### Claude Code (`.mcp.json` at repo root)

```json
{
  "mcpServers": {
    "elen": {
      "command": "npx",
      "args": ["-y", "@learningnodes/elen-mcp"],
      "env": {
        "ELEN_CONNECTED": "true",
        "ELEN_CLOUD_URL": "https://api.learningnodes.com",
        "ELEN_USER_EMAIL": "you@example.com",
        "ELEN_CLOUD_API_KEY": "lnk_<your key>"
      }
    }
  }
}
```

Alternatively, run `elen login` once to persist credentials to `~/.elen/config.json` — see [TERMINAL_AUTH.md](./TERMINAL_AUTH.md). You still need `ELEN_CONNECTED=true` and `ELEN_USER_EMAIL` for connected MCP mode.

## Terminal auth

Use `elen login`, `elen whoami`, and `elen logout` to manage the `auth` block in `~/.elen/config.json`. Details: [TERMINAL_AUTH.md](./TERMINAL_AUTH.md).

## Claim a project

Run `elen claim` to link a local project to your workspace and push history. Details: [CLAIM_FLOW.md](./CLAIM_FLOW.md).

## Reading team decisions

When connected (`ELEN_CONNECTED=true` with valid cloud credentials), two query-only MCP tools read from the cloud — nothing is written to local SQLite:

- **`elen_team_search`** — keyword search over team/human decisions in your workspace (`GET /elen/mcp/search`). Overlapping local atoms get an advisory `conflict_note` in the response only.
- **`elen_incoming`** — cross-principal grants inbox: decisions others have shared into you, with grant metadata and nested decision content (`GET /elen/mcp/incoming`).

Both tools degrade gracefully when not connected (empty result + message to run `elen login` or set env vars).
