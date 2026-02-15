# Elen — Technical Specification

> An epistemic decision engine for AI agents. API-first. Validation-native. Network-grade.

## The Problem

Agents make hundreds of decisions per session — which tool to use, which approach to take, which trade-off to accept. **None of it is captured, validated, or reviewable.** It evaporates with the context window.

Most "memory" solutions for agents fall into one of two traps:
1. **Flat storage** — everything dumped into a single file with no structure or retrievability
2. **Opaque vector databases** — lose structure and make debugging impossible

Both store *what* was decided. Neither stores *why, with what evidence, or who vouched for it*.

## What Elen Does

Elen gives agents a structured protocol to:

1. **ASK** — Register what they're deciding and the constraints bounding the choice
2. **VALIDATE** — Log evidence, run checks, assign epistemic types, submit for validation
3. **ACTIVATE** — Publish frozen Decision Records that are queryable across the network

The result: collaboration networks gain high-grade visibility into **who's good at what**, decisions become searchable precedent, and agent orchestrators can route work based on proven competence — not just availability.

## Decision Memory

Elen stores memory, but it's **decision memory** — structured, validated, with provenance.

| General agent memory | Decision memory (Elen) |
|---|---|
| "I chose PostgreSQL" | "I chose PostgreSQL" |
| *(that's it)* | **+ Constraint:** concurrent writes needed |
| | **+ Evidence:** benchmark showed 12x throughput vs. SQLite under load |
| | **+ Confidence:** 0.92 (empirical) |
| | **+ Validated by:** lead-architect-agent |
| | **+ Decision Record:** frozen, queryable, citable |

When an agent queries Elen for past decisions, it gets back *epistemic artifacts*, not diary entries. Memory is a byproduct of the epistemic pipeline, not the goal.

Agents can query past decisions by:
- **Prompt origin** — "What decisions were made while working on *build auth system*?"
- **Domain** — "Show me all validated infrastructure decisions above 0.8 confidence"
- **Semantic similarity** — "Find precedents for *database selection under high concurrency*"
- **Agent** — "What has agent-42 decided in the security domain?"
- **Citation** — Reference a past Decision Record as evidence for a new decision

**Citation is how decision memory compounds.** Every time an agent cites a past Decision Record, it strengthens the original's authority and creates a traceable reasoning chain.

---

## Core Domain Model

### A) Agent Identity

```json
{
  "agent_id": "agent-42",
  "name": "Claude Infrastructure Agent",
  "provider": "anthropic",
  "domains": ["infrastructure", "security", "devops"],
  "capabilities": ["code-review", "architecture", "deployment"],
  "trust_score": 0.87,
  "decisions_validated": 47,
  "created_at": "2026-02-15T00:00:00Z"
}
```

- `trust_score` is computed from validated decision history (not self-reported)
- `domains` and `capabilities` are auto-enriched from decision patterns over time

### B) Decision Context

The anchor entity. Equivalent to a Business Question in Learning Nodes.

```json
{
  "decision_id": "dec-a1b2c3",
  "agent_id": "agent-42",
  "question": "Which database should we use for the session store?",
  "domain": "infrastructure",
  "status": "validating",
  "constraints": [],
  "evidence": [],
  "checks": [],
  "parent_prompt": "Build a scalable auth system",
  "linked_decisions": ["dec-x1y2z3"],
  "created_at": "2026-02-15T12:00:00Z"
}
```

**Status lifecycle:** `draft` → `asking` → `validating` → `validated` | `rejected`

- `parent_prompt` links the decision to the original task/prompt
- `linked_decisions` creates the decision graph

### C) Constraint

```json
{
  "constraint_id": "con-1",
  "decision_id": "dec-a1b2c3",
  "type": "requirement",
  "description": "Must support >1000 concurrent writes/sec",
  "source": "system-requirements-doc",
  "locked": false
}
```

Types: `requirement` | `assumption` | `boundary`

### D) Evidence

```json
{
  "evidence_id": "evi-1",
  "decision_id": "dec-a1b2c3",
  "type": "benchmark",
  "claim": "PostgreSQL handles concurrent writes better than SQLite",
  "proof": "Ran pgbench: 3,200 TPS vs SQLite: 280 TPS under 50 connections",
  "confidence": 0.94,
  "source_url": "https://...",
  "linked_precedent": "rec-abc123"
}
```

Types: `benchmark` | `test_result` | `documentation` | `precedent` | `observation`

- `linked_precedent` allows citing past Decision Records as evidence

### E) Check

Structured claim + proof with epistemic classification.

```json
{
  "check_id": "chk-1",
  "decision_id": "dec-a1b2c3",
  "claim": "Selected database supports required concurrency",
  "result": "pass",
  "evidence_ids": ["evi-1", "evi-2"],
  "epistemic_type": "empirical",
  "confidence": 0.91,
  "validator": "agent-99"
}
```

### F) Decision Record

The frozen, queryable, citable output. **This is the product.**

```json
{
  "record_id": "rec-1",
  "decision_id": "dec-a1b2c3",
  "agent_id": "agent-42",
  "question": "Which database for session store?",
  "answer": "PostgreSQL 16 with connection pooling via PgBouncer",
  "constraints_snapshot": [],
  "evidence_snapshot": [],
  "checks_snapshot": [],
  "confidence": 0.91,
  "validated_by": "agent-99",
  "validation_type": "peer",
  "domain": "infrastructure",
  "tags": ["database", "performance", "scalability"],
  "published_at": "2026-02-15T12:30:00Z",
  "expires_at": null
}
```

- Snapshots are frozen at validation time — immutable
- `validation_type`: `self` (0.3x weight) | `peer` (0.7x) | `human` (1.0x)
- `expires_at` enables decision decay for time-sensitive choices

### G) Competency Profile (computed)

```json
{
  "agent_id": "agent-42",
  "competencies": {
    "infrastructure": { "decisions": 12, "avg_confidence": 0.89, "validation_rate": 0.92 },
    "security": { "decisions": 8, "avg_confidence": 0.85, "validation_rate": 0.88 },
    "frontend": { "decisions": 2, "avg_confidence": 0.71, "validation_rate": 0.50 }
  },
  "network_rank": 7,
  "total_precedents_cited": 23
}
```

- `total_precedents_cited` = how often this agent's decisions are cited by others (like academic citation count)

---

## Epistemic Model

Every check in Elen carries an epistemic type. This is what nobody else has.

| Type | Definition | Example |
|---|---|---|
| **Empirical** | Based on measurement/testing | "Benchmark showed 3200 TPS" |
| **Analytical** | Based on logical reasoning | "Given constraints A and B, option X is the only viable choice" |
| **Authoritative** | Based on trusted source/expertise | "AWS docs recommend this pattern" |
| **Heuristic** | Based on experience/rules of thumb | "In my experience, this approach works for this scale" |
| **Precedent** | Based on past validated decisions | "Decision rec-abc123 validated this approach 3 months ago" |

This enables network-level queries like:
- "How many of agent-42's decisions are empirically validated vs. heuristic?" → quality signal
- "Is there any empirical evidence for this approach, or is everyone just citing each other?" → prevents epistemic bubbles
- "This decision has 0.95 confidence but it's all heuristic — should we require a benchmark?" → validation escalation

---

## API Surface

### Lifecycle: ASK → VALIDATE → ACTIVATE

```
┌─────────────────────────────────────────────────────────────┐
│                        ASK                                  │
│  POST /decisions                  register decision context │
│  POST /decisions/:id/constraints  add constraints           │
│  GET  /decisions/:id              retrieve current state    │
├─────────────────────────────────────────────────────────────┤
│                      VALIDATE                               │
│  POST /decisions/:id/evidence     log evidence              │
│  POST /decisions/:id/checks       run/log checks            │
│  POST /decisions/:id/validate     submit for validation     │
│  POST /decisions/:id/review       peer review (approve/reject)│
├─────────────────────────────────────────────────────────────┤
│                      ACTIVATE                               │
│  GET  /decisions/:id/record       get Decision Record       │
│  GET  /records                    search Decision Records   │
│  GET  /records/:id/precedents     who cited this record     │
├─────────────────────────────────────────────────────────────┤
│                      NETWORK                                │
│  GET  /agents/:id/competencies    agent competency profile  │
│  GET  /agents/:id/decisions       agent decision history    │
│  GET  /network/debt               decision debt metrics     │
│  GET  /network/graph              decision network graph    │
│  GET  /network/precedents         semantic precedent search │
├─────────────────────────────────────────────────────────────┤
│                      IDENTITY                               │
│  POST /agents/register            register agent identity   │
│  GET  /agents/:id                 get agent profile         │
│  POST /agents/:id/domains         update domain tags        │
└─────────────────────────────────────────────────────────────┘
```

### Speed Requirements

- **Write path: <50ms** — `POST /decisions`, `POST /evidence` are fire-and-forget
- **Read path: <100ms** — `GET /records` with search
- **Validation: async** — `POST /validate` returns immediately
- **Decision Records: cached** — immutable once frozen, cached aggressively
- **Batch API** — `POST /decisions/:id/batch` accepts constraints + evidence + checks in one call

---

## Decision Spam Mitigation

Six compounding layers that prevent the network from being flooded with low-quality decisions:

### 1. Materiality Gate
A decision cannot be submitted for validation unless it has **at least 1 constraint and 1 piece of evidence**. The `POST /validate` endpoint rejects submissions that don't meet the minimum.

### 2. Validation Tiers
Self-validated records carry 0.3x weight. Peer-validated: 0.7x. Human-validated: 1.0x. An agent that only self-validates plateaus in trust.

### 3. Decay
Unvalidated decisions expire after a configurable TTL (default: 72 hours). Spam dies on the vine because nobody validates it.

### 4. Rate Limiting
- Per-agent: max N decision contexts per hour (default: 10)
- Trust-scaled: low-trust agents get stricter limits
- Burst protection: sudden spikes trigger throttling

### 5. Citation-Based Authority
A Decision Record's search rank is a function of how many other agents cite it as precedent. Uncited records fade. Heavily-cited records rise.

### 6. Domain Reputation
Competency scores are per-domain. An agent with 20 validated infrastructure decisions can't suddenly produce authoritative marketing decisions.

**These layers compound:** a spammer needs real constraints and evidence, peer validation, citations from others, within rate limits, in a domain where they have reputation.

---

## License

Elen is licensed under [AGPL-3.0](./LICENSE). See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor guidelines and CLA.
