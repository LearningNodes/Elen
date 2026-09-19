# Terminal authentication

Elen stores cloud credentials in `~/.elen/config.json` so you do not need to export API keys in every shell session.

## Commands

```
elen login [--key] [--cloud-url] [--user-email]   # paste a lnk_ key, validate, persist auth block
elen whoami [--key] [--cloud-url] [--user-email]  # print workspace identity and key prefix
elen logout                                        # remove the auth block from config
```

- **`elen login`** — prompts for an `lnk_` API key (or accepts `--key` / `--api-key`, env vars, or piped stdin). Validates the key via `GET /elen/sync/workspace`, then writes the `auth` block below. Does not set `ELEN_CONNECTED`.
- **`elen whoami`** — resolves credentials, re-validates against the gateway, and prints `workspace_id`, `workspace_name`, `record_count` (when present), and the first 12 characters of the API key (never the full key).
- **`elen logout`** — deletes only the `auth` block; `venture_map`, `project`, and `claimed_projects` are preserved.

## Config file (`~/.elen/config.json`)

Login adds a top-level `auth` object:

```json
{
  "auth": {
    "api_key": "lnk_<full key>",
    "cloud_url": "https://api.learningnodes.com",
    "user_email": "you@example.com",
    "workspace_id": "34",
    "workspace_name": "Acme",
    "logged_in_at": "2026-07-03T00:00:00.000Z"
  }
}
```

`user_email` and `workspace_name` are optional. `workspace_id` is always a string.

## Value resolution precedence

Highest priority first:

| Value | 1. Flag | 2. Env var | 3. Config | 4. Default |
|---|---|---|---|---|
| API key | `--key` / `--api-key` | `ELEN_CLOUD_API_KEY` (canonical), `ELEN_API_KEY` (alias) | `auth.api_key` | — |
| Cloud URL | `--cloud-url` | `ELEN_CLOUD_URL` | `auth.cloud_url` | `https://api.learningnodes.com` |
| User email | `--user-email` | `ELEN_USER_EMAIL` | `auth.user_email` | — |

`ELEN_CONNECTED` (`true` or `1`) independently gates connected MCP mode. Login stores credentials; it does not flip connected mode.

## Security

- A full API key is `lnk_` plus 64 hex characters. Mint one from the workspace UI (`POST /settings/api-keys`); the raw key is shown exactly once.
- The config file contains a secret `lnk_` key. On POSIX systems, login writes it with `0o600` permissions (owner read/write only). On Windows, `chmod` is effectively a no-op — rely on OS user profile isolation.
- Never commit `~/.elen/config.json` or paste full keys into chat logs.

See also [SETUP.md](./SETUP.md) for MCP connected-mode configuration and [CLAIM_FLOW.md](./CLAIM_FLOW.md) for the one-time project claim flow.
