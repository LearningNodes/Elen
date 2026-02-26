# Agent instructions for Elen

You are operating within the `Elen` repository, an open-source "Decision Network" infrastructure tool.

## Core Directives

1. **Use the Elen MCP for Decisions**: Any time you make a meaningful technical, design, security, or product decision while working in this repository, you **MUST** document it using the Elen MCP server tools (`mcp_elen_elen_commit`). This ensures visible reasoning.
2. **Consult the Graph First**: Before executing sweeping refactors, changing project architecture, or making broad stylistic decisions, use `mcp_elen_elen_suggest` to verify if a preceding constraint or decision already exists.
3. **No Unpinned Execution**: When writing instructions or automation that fetch external packages via `npx` or similar tools, you must pin the version (e.g., `@0.1.0`) to avoid supply-chain vulnerabilities. 

## Development Workflow

- The core Node.js SDK is located in `packages/sdk-ts`.
- The MCP server package is located in `packages/mcp-server`.
- When building `packages/sdk-ts`, ensure you use `npm run build` so that the `tsconfig.json` rules are properly applied.
- E2E testing for the observer lives in the `elen-cloud` ecosystem.

## Connecting to the Elen Context Server

To fulfill your primary directive of logging decisions, you must be connected to the Elen MCP server. If your user has not configured it, instruct them to add the following to their AI settings:

```json
{
  "mcpServers": {
    "elen": {
      "command": "npx",
      "args": ["-y", "@learningnodes/elen-mcp@0.1.2"]
    }
  }
}
```

If you support a `.agent/skills` architecture, you can read the full documentation in `.agent/skills/elen-mcp/SKILL.md`.
