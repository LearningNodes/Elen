# Elen — Technical Specification

> A token-efficient Decision Memory Protocol for multi-domain projects. Explicit graph networking for agents.

## The Problem

Agents burn massive amounts of context window tokens re-litigating the same architectural decisions, searching for the same constraints, and writing the same rationale. Chat logs are ephemeral. Standard vector DBs flood the context window with fuzzy, irrelevant text.

Complex projects fail because decisions decay: they are forgotten, applied out of context, contradicted silently, or re-made repeatedly.

## What Elen Does

Elen gives agents a **Token-Efficient Decision Memory Protocol**. It allows agents to build a permanent, immutable graph of decisions (the "Elen Decision Network") without destroying their context limits.

Instead of stuffing the prompt with past chats, Elen forces a pointer-first retrieval model:
1. **SUGGEST** — Retrieve only minimal Top-K pointer IDs.
2. **EXPAND** — Only fetch the full text if the pointer is explicitly requested.
3. **COMMIT** — Write decisions using hashed constraint sets to avoid duplication.
4. **SUPERSEDE** — Explicitly deprecate outdated decisions to advance the graph.

---

## Core Domain Model

Elen's minimal epistemic schema isolates heavy constraints from node metadata to maintain token efficiency.

### A) Decision Atom

The Decision Atom is designed to be extremely lightweight, used heavily in `Suggest` queries. It only holds pointers and summary strings.

```json
{
  "decision_id": "dec:ENG-a1b2",
  "q_id": "q-x7k2m",
  "question_text": "Which caching database should we use?",
  "domain": "infrastructure",
  "decision_text": "Redis over Memcached due to data-structure support.",
  "constraint_set_id": "cs:7f8d2b",
  "refs": ["dec:ENG-x1y2"],
  "status": "active",
  "supersedes_id": null,
  "timestamp": "2026-02-15T12:30:00Z"
}
```

### B) Constraint Set

Constraints must be both machine-usable and agent-readable. Instead of restating constraints on every decision, they are grouped and cryptographically hashed (SHA-256) into a `ConstraintSet`.

```json
{
  "constraint_id": "cs:7f8d2b",
  "constraints": [
    "Must support pub/sub capabilities",
    "Requires high availability via Sentinel",
    "Latency < 2ms p99"
  ]
}
```

Multiple decisions can point to the same `ConstraintSet`, guaranteeing that agents are inheriting exact, unmodified constraints across domains.

---

## Integration Model (MCP)

### How agents connect to Elen

Elen ships as an **MCP server**. Agents access it via tool calls — no SDK required, no skill files mandatory.

```
Owner adds elen-mcp-server to agent config (one-time)
→ Agent imports exact instructions via System Prompt (AGENTS.md)
→ Agent queries the network via `Suggest` before coding
→ Agent discovers an ID, calls `Expand` to load constraints
→ Agent wires new conclusions into the graph via `Commit` or `Supersede`
```

### The Four Verbs (MCP Tools)

#### 1. elen_suggest (Context Retrieval)
Given a query, Elen returns Top-K candidates with minimal payloads:
```json
{
  "candidates": [
    {
      "decision_id": "dec:ENG-a1b2",
      "decision_text": "Redis over Memcached due to data-structure support.",
      "constraint_set_id": "cs:7f8d2b",
      "status": "active"
    }
  ]
}
```

#### 2. elen_expand (On Demand)
When ambiguity is high or a decision is central, the agent requests expansion. Returns the full decision text, the full constraint array, and reference pointers.

#### 3. elen_commit (Store New Decision)
The acting agent commits a new decision record, summarizing constraints as a plain-text array:
```json
{
  "question": "Caching layer for the User Auth Microservice",
  "domain": "auth",
  "decisionText": "Using Redis, citing previous INF precedent.",
  "constraints": ["Auth tokens must TTL natively"],
  "refs": ["dec:INF-a6b8c9"]
}
```

#### 4. elen_supersede (Revision)
Revision is explicit: new decisions can supersede old ones. Superseded decisions remain queryable to preserve history, but the active graph points forward.
```json
{
  "oldDecisionId": "dec:AUT-b2c4d6",
  "question": "Caching layer for the User Auth Microservice",
  "domain": "auth",
  "decisionText": "Replacing Redis with DynamoDB DAX for auth due to OOM errors under load.",
  "constraints": ["Must prevent node memory fragmentation"]
}
```

#### 5. elen_get_competency (Profile)
Returns a competency profile for the current agent — domain expertise based on validated decision history, including strengths and weaknesses.

---

## Minimal Token Strategy

Elen’s token efficiency comes from three mechanisms:
1. **Pointer-first retrieval:** Returning IDs + 1-liners instead of full documentation text.
2. **Constraint reuse by reference:** A decision references a Constraint Set Hash, avoiding repeating logic.
3. **Demand-based expansion:** Bloated context is only injected when explicitly expanded (`elen_expand`).

### Token Cost Profile

| Action | Tokens | Frequency |
|---|---|---|
| Suggest (Pointer Retrieval) | ~200 | 1-2 per query |
| Expand (Fetch Full Context) | ~300 | As needed |
| Commit / Supersede | ~200 | 3-5 per session |

This keeps routine usage well below typical "context dump" patterns while still enabling extreme rigor when needed.

### Project Isolation

Decisions are scoped per project with **strict isolation by default** (`defaultProjectIsolation: 'strict'`). Cross-project sharing is opt-in via explicit configuration.

---

## Open Core & License

[AGPL-3.0](./LICENSE) — see [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor guidelines and CLA.

Built by [Learning Nodes](https://www.learningnodes.com).
