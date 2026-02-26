<p align="center">
  <strong>Elen</strong><br>
  <em>Learning Nodes for Agents</em>
</p>

<p align="center">
  A decision record protocol for AI agents and the humans who work with them.<br>
  Log decisions. Search precedents. Build institutional memory.
</p>

<p align="center">
  <a href="https://discord.gg/zJG6n2WGzM">Join Discord</a> · <a href="https://elen.learningnodes.com/walkthrough.html">See how it works</a> · <a href="./SPEC.md">Spec</a> · <a href="./ROADMAP.md">Roadmap</a> · <a href="./CONTRIBUTING.md">Contributing</a> · <a href="./LICENSE">License</a>
</p>

---

## The Problem

Agents burn massive amounts of context window tokens re-litigating the same architectural decisions, searching for the same constraints, and writing the same rationale. Chat logs are ephemeral. Standard vector DBs flood the context window with fuzzy, irrelevant text.

## What Elen Does

Elen gives agents a **Token-Efficient Decision Memory Protocol**. It allows agents to build a permanent, immutable graph of decisions (the "Elen Decision Network") without destroying their context limits.

Instead of stuffing the prompt with past chats, Elen forces a pointer-first retrieval model:
1. **SUGGEST** — Retrieve only minimal Top-K pointer IDs (`dec:ENG-1a2b`).
2. **EXPAND** — Only fetch the full text if the pointer is explicitly requested.
3. **COMMIT** — Write decisions using hashed constraint sets to avoid duplication.
4. **SUPERSEDE** — Explicitly deprecate outdated decisions to advance the graph.

> *"Agents don't get smarter with bigger models. They get smarter with better reasoning processes. Elen is that process."*

## Quick Start

```typescript
import { Elen } from '@learningnodes/elen';

const elen = new Elen({
  agentId: 'frontend-agent',
  projectId: 'my-project', // auto-detected from git remote if omitted
  storage: 'sqlite',
});

// 1. Suggest (Pointer-First Retrieval)
const pointers = await elen.suggest('checkout latency constraints');
// Returns: [{ id: 'dec:MKT-9f21', summary: 'Mobile checkout rendering SLAs' }]

// 2. Expand (On-Demand Materialization)
const record = await elen.expand('dec:MKT-9f21');
// Resolves full constraints: "All checkout flows must render under 1.5s"

// 3. Commit (Graph Wiring)
const newDecision = await elen.commit({
  question: 'Which payment element to use?',
  domain: 'frontend',
  decisionText: 'Stripe Elements (native rendering over redirect)',
  constraints: ['must render < 1.5s', 'PCI compliant'],
  refs: ['dec:MKT-9f21'] // Explicitly linking to Marketing's constraint
});

console.log(newDecision.decision_id); // dec:FRN-a1b2c3 - Frozen, queryable
```

### Via MCP (zero-code integration)

Add Elen as an MCP server — your agent gets tools with descriptions that tell it when to use them. No SDK required.

```json
{
  "mcpServers": {
    "elen": {
      "command": "npx",
      "args": ["@learningnodes/elen-mcp"]
    }
  }
}
```

Project identity is auto-detected from the git remote or `package.json` in the working directory.

> [!IMPORTANT]
> **MCP alone is not enough.** Agents won't reliably call `elen_suggest` or `elen_commit` without behavioral priming. Add an `AGENTS.md` file to your repo root — see [Making Agents Log Decisions](#making-agents-log-decisions) below.

## How It Works

```
Agent faces a problem
    │
    ├── SUGGEST: "What are the relevant minimal pointers?"
    │   → Finds [dec:ENG-1a, dec:ENG-2b]
    │
    ├── EXPAND: "dec:ENG-2b looks relevant, fetch the full payload."
    │   → Retrieves constraints and full rationale into context window
    │
    └── COMMIT / SUPERSEDE: "I've solved it."
        → Writes a new explicit node to the graph
```

## Key Concepts

| Concept | What |
|---|---|
| **Top-K Pointers** | Agents retrieve IDs and summaries first, saving tokens. |
| **Constraint Sets** | Reusable, SHA-256 hashed plain-text rules ("budget < 500ms"). |
| **Explicit DAG** | Decisions explicitly reference (`refs`) or override (`supersedes`) others. |
| **Project Segmentation** | Decisions scoped per project, with optional cross-project sharing. |

## What's Built

| Feature | Status |
|---|---|
| TypeScript Base SDK (`suggest`, `expand`, `commit`, `supersede`) | ✅ Shipped |
| MCP server with standard protocol tools | ✅ Shipped |
| Local SQLite storage (`~/.elen/decisions.db`) | ✅ Shipped |
| Constraint Set hashing & Deduplication | ✅ Shipped |
| Explicit Graph DAG (refs & supersedes wiring) | ✅ Shipped |
| Project segmentation with auto-detection from git/package.json | ✅ Shipped |
| Shared Cross-Project Workspaces | ✅ Shipped |

See [ROADMAP.md](./ROADMAP.md) for what's next.

## Making Agents Log Decisions

Agents have access to the protocol verbs but won't intuitively use them without explicit trigger conditions. The tool description tells the agent *what* the tool does — but agents are task-focused and don't self-assess "should I search precedent right now?" mid-conversation.

**The fix:** Include instructions to **use the Elen MCP** in your prompt or add an [`AGENTS.md`](../AGENTS.md) file to your repo root. This file is automatically loaded into the agent's context at the start of every session across Antigravity, Claude Code, Cursor, and Copilot. It tells the agent:

- **When to query:** Before formulating any technical plan or making an implementation choice.
- **When to commit:** After successfully resolving errors, selecting technologies, or making architectural trade-offs.
- **How to format:** Extracting constraints as discrete rules, pointing explicitly to prior IDs if available.

### Protocol Instructions (Copy to `.cursorrules` or System Prompt)

```markdown
# Epistemic Decision Memory Protocol

You must adhere to the Minimal Token Protocol for decisions:

1. Pointer-First Retrieval: Before making a technical decision, ALWAYS use elen_suggest to retrieve Top-K minimal pointers.
2. On-Demand Expansion: If a pointer looks relevant, you MUST call elen_expand on that specific ID. Do not hallucinate constraints.
3. Commiting Atoms: When deciding, use elen_commit. Summarize constraints into plain-text arrays (e.g. "budget < 500ms").
4. Graph Revision: If a decision invalidates a precedent, you MUST use elen_supersede to advance the graph state.
```

See the [AGENTS.md template](../AGENTS.md) in the repo root for the complete behavioral wrapper.

> *Without AGENTS.md, the agent has the tool but no habit. With it, decision logging becomes a session norm — like running tests before committing.*

## IDE Compatibility

Elen works with **any IDE or agent that supports MCP** (Model Context Protocol) — the open standard for AI tool integration.

| IDE / Agent | Works Today |
|---|---|
| **Claude Code** (Anthropic) | ✅ |
| **Cursor** | ✅ |
| **Windsurf** (Codeium) | ✅ |
| **VS Code + Copilot** | ✅ |
| **Custom agents** (LangChain, CrewAI, etc.) | ✅ via SDK |

Same config for all:

```json
{
  "mcpServers": {
    "elen": {
      "command": "npx",
      "args": ["@learningnodes/elen-mcp"]
    }
  }
}
```

All decisions are stored locally in `~/.elen/decisions.db` by default. Nothing leaves your machine unless you explicitly share via cross-project rules or join a team network.

## Project Structure

```
Elen/
├── packages/
│   ├── core/           # Types, schemas, validation logic
│   ├── sdk-ts/         # TypeScript SDK
│   ├── mcp-server/     # MCP server for agent integration
│   ├── dashboard/      # Decision dashboard (localhost:3737)
│   ├── observer/       # Background decision extraction server
│   └── consolidator/   # Cross-thread clustering engine
├── homepage/           # elen.learningnodes.com
└── SPEC.md             # Protocol specification
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). All contributions require a signed CLA.

## License

[AGPL-3.0](./LICENSE) — see [open core model](./SPEC.md#license) for details.

Built by [Learning Nodes](https://www.learningnodes.com).
