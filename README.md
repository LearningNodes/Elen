<p align="center">
  <strong>Elen</strong><br>
  <em>Learning Nodes for Agents</em>
</p>

<p align="center">
  An epistemic decision engine for AI agents.<br>
  API-first. Validation-native. Network-grade.
</p>

<p align="center">
  <a href="./SPEC.md">Spec</a> · <a href="./ROADMAP.md">Roadmap</a> · <a href="./CONTRIBUTING.md">Contributing</a> · <a href="./LICENSE">License</a>
</p>

---

## Why Elen?

Agents make hundreds of decisions per session. None of it is captured, validated, or reviewable.

**Elen changes that.** It gives agents a structured protocol to register decisions, validate them with evidence and epistemic classification, and publish frozen Decision Records that are queryable across the network.

The result:
- **Collaboration networks** see who's good at what — proven by decision history, not self-reported
- **Agent orchestrators** route work based on competence, not availability
- **Decisions become precedent** — citable, searchable, and defensible

## How It Works

```
ASK ──────────────► VALIDATE ──────────────► ACTIVATE
Register what       Log evidence,             Publish a frozen
you're deciding     run checks,               Decision Record —
and why             assign epistemic types     queryable & citable
```

### Quick Example

```typescript
import { Elen } from '@learningnodes/elen';

const elen = new Elen({ agentId: 'agent-42' });

// ASK — register a decision
const decision = await elen.decide({
  question: 'Which database for the session store?',
  domain: 'infrastructure',
  parentPrompt: 'Build a scalable auth system',
});

// Add constraints
await decision.constrain({
  type: 'requirement',
  description: 'Must support >1000 concurrent writes/sec',
});

// VALIDATE — log evidence
await decision.evidence({
  type: 'benchmark',
  claim: 'PostgreSQL handles concurrent writes better than SQLite',
  proof: 'pgbench: 3,200 TPS vs SQLite: 280 TPS under 50 connections',
  confidence: 0.94,
});

// Run a check with epistemic classification
await decision.check({
  claim: 'Selected database supports required concurrency',
  result: 'pass',
  epistemicType: 'empirical',
  confidence: 0.91,
});

// ACTIVATE — validate and publish
const record = await decision.validate({
  answer: 'PostgreSQL 16 with PgBouncer connection pooling',
});

console.log(record.recordId);  // rec-a1b2c3 — frozen, queryable, citable
```

### Query Past Decisions

```typescript
// By domain
const records = await elen.records({ domain: 'infrastructure', minConfidence: 0.8 });

// By prompt origin
const authDecisions = await elen.records({ parentPrompt: 'build auth system' });

// Semantic precedent search
const precedents = await elen.precedents('database selection for high concurrency');

// Cite a past decision as evidence for a new one
await newDecision.evidence({
  type: 'precedent',
  claim: 'PostgreSQL is proven for this use case',
  linkedPrecedent: 'rec-a1b2c3',
});
```

## Key Concepts

| Concept | What it means |
|---|---|
| **Decision Context** | What you're deciding, with constraints — the anchor entity |
| **Evidence** | Data supporting the decision (benchmarks, test results, documentation, precedents) |
| **Check** | Structured claim + proof with epistemic type classification |
| **Decision Record** | The frozen, immutable, queryable output — this is the product |
| **Epistemic Type** | How the evidence was obtained: empirical, analytical, authoritative, heuristic, or precedent |
| **Competency Profile** | Per-domain decision quality metrics, computed from validated Decision Records |
| **Decision Debt** | Network-wide metric: how many decisions are unvalidated, stale, or contradictory |

## Design Principles

- **<50ms writes** — agents can't wait. Decision logging is fire-and-forget fast
- **Validation is async** — submit for validation, get a result later
- **Decision Records are immutable** — once frozen, they're cached aggressively and never change
- **Spam-resistant** — 6-layer mitigation: materiality gates, validation tiers, decay, rate limiting, citation authority, domain reputation
- **Epistemic discipline** — not just *what* was decided, but *why, with what evidence, and who vouched for it*

## Project Structure

```
Elen/
├── packages/
│   ├── core/           # Types, schemas, validation logic
│   ├── sdk-ts/         # TypeScript SDK
│   ├── sdk-python/     # Python SDK
│   └── server/         # Reference API server
└── examples/
    ├── single-agent/   # Single agent decision logging
    ├── multi-agent/    # Multi-agent peer validation
    └── mcp-integration/# MCP server integration
```

## Status

Elen is in **Phase 0 — Foundation**. The spec is published, core types are being defined. See [ROADMAP.md](./ROADMAP.md) for the full plan.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). All contributions require a signed CLA.

## License

[AGPL-3.0](./LICENSE) — see [Open Core model](./SPEC.md#license) for details.

Built by [Learning Nodes](https://www.learningnodes.com).
