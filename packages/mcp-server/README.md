Elen is an open-source MCP server that records the decisions your coding agent makes, with the limits that bound them, and marks old decisions as superseded. It installs with one npx line, works with Cursor, Claude Code and any MCP client, and keeps decisions in a local SQLite file.

## Install

```bash
npx -y @learningnodes/elen-mcp@0.3.1
```

### Claude Code

```bash
claude mcp add --transport stdio elen -- npx -y @learningnodes/elen-mcp@0.3.1
```

### VS Code

Open this link to install:

```
vscode:mcp/install?%7B%22name%22%3A%22elen%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40learningnodes%2Felen-mcp%400.3.1%22%5D%7D
```

### Cursor

Add this to `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "elen": {
      "command": "npx",
      "args": ["-y", "@learningnodes/elen-mcp@0.3.1"]
    }
  }
}
```

### Gemini CLI

Add this to `settings.json` (`~/.gemini/settings.json`, or `.gemini/settings.json` in your project):

```json
{
  "mcpServers": {
    "elen": {
      "command": "npx",
      "args": ["-y", "@learningnodes/elen-mcp@0.3.1"]
    }
  }
}
```

### Any other MCP client

Use the same `mcpServers` entry:

```json
{
  "mcpServers": {
    "elen": {
      "command": "npx",
      "args": ["-y", "@learningnodes/elen-mcp@0.3.1"]
    }
  }
}
```

## Tested with

| Client | Status |
|---|---|
| Claude Code | Run by the maintainer |
| Cursor | Configuration follows the client's documentation. Not yet recorded as tested. |
| VS Code | Configuration follows the client's documentation. Not yet recorded as tested. |
| Gemini CLI | Configuration follows the client's documentation. Not yet recorded as tested. |
| Other MCP clients | Configuration follows the client's documentation. Not yet recorded as tested. |

## Make your agent use it

The tools alone give an agent no habit: it sees what each tool does, but it does not stop mid-task to ask whether a precedent exists. Add the block below to your rules file or system prompt so that searching before a decision and committing after one become part of every session.

```markdown
# Epistemic Decision Memory Protocol

You must adhere to the Minimal Token Protocol for decisions:

1. Pointer-First Retrieval: Before making a technical decision, ALWAYS use elen_suggest to retrieve Top-K minimal pointers.
2. On-Demand Expansion: If a pointer looks relevant, you MUST call elen_expand on that specific ID. Do not hallucinate constraints.
3. Commiting Atoms: When deciding, use elen_commit. Summarize constraints into plain-text arrays (e.g. "budget < 500ms").
4. Graph Revision: If a decision invalidates a precedent, you MUST use elen_supersede to advance the graph state.
```

## What it stores

In local mode decisions stay in a SQLite file on your machine (default ~/.elen/decisions.db). Connected mode is optional, needs elen login and an API key, and is in beta.

## Tools

| Tool | What it does |
|---|---|
| `elen_commit` | Commits a new decision to the graph, with its constraints as a plain-text list. |
| `elen_get_competency` | Shows the competency profile for this agent, built from its validated decision history. |
| `elen_consolidate` | Suggests clusters and duplicate or stale candidates without changing the graph. |
| `elen_get_context` | Gives an overview of active decision threads grouped by domain, for the start of a session. |
| `elen_expand` | Expands a decision ID into its full constraints and text. |
| `elen_incoming` | Lists decisions other people have shared into your workspace. Connected mode, beta. |
| `elen_log_decision` | Creates a validated Decision Record from constraints, evidence and an answer. |
| `elen_search_precedents` | Searches validated decisions for precedents. |
| `elen_status` | Returns the agent, project, database path and counts, to check the namespace before committing. |
| `elen_suggest` | Retrieves short pointers to prior decisions before you make a new one. |
| `elen_supersede` | Revises an older decision and marks it superseded by a new one. |
| `elen_team_search` | Searches team and human decisions visible to your workspace for a topic. Connected mode, beta. |

## Links

- Repository: https://github.com/LearningNodes/Elen
- Issues: https://github.com/LearningNodes/Elen/issues
- Discord: https://discord.gg/zJG6n2WGzM
- Licence: [AGPL-3.0](https://github.com/LearningNodes/Elen/blob/main/LICENSE)

Elen is the open-source part of Learning Nodes, the DecisionOps workspace. For the business decisions behind the code: https://workstation.learningnodes.com?utm_source=elen-readme&utm_medium=referral&utm_campaign=npm-page
