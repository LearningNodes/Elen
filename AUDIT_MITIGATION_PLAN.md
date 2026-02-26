# Elen Audit Mitigation Plan

This plan addresses every finding in the **Elen Usability & Logic Audit**, including core gaps, blind spots, and KPI/measurement recommendations.

## 1) API drift between implementation and tests/docs (Critical)

- **Error we are going to solve**
  - Public surface mismatch between current implementation (`commitDecision`, `saveRecord`, `elen_commit`, `elen_suggest`) and legacy references in tests/docs/examples (`logDecision`, `saveDecision`, `elen_log_decision`, `elen_search_precedents`).
- **Scope of error**
  - `packages/core`, `packages/sdk-ts`, `packages/mcp-server` tests.
  - README, protocol/spec docs, snippets, migration notes.
  - CI quality gates and release validation.
- **Proposal/plan to fix**
  1. Create a canonical API contract document (SDK + MCP) in `docs/api-contract.md` and treat it as the single source of truth.
  2. Add API compatibility matrix by version (e.g., `0.1.0 -> 0.1.1`) with old/new symbol mapping.
  3. Update all tests to target canonical names and remove legacy fixtures.
  4. Add temporary compatibility shims + deprecation warnings where practical, with removal target version.
  5. Add CI checks that fail when docs/examples/tests reference non-contract names.
  6. Add release checklist item: “contract-drift check passes.”

## 2) Question not persisted in record schema (High)

- **Error we are going to solve**
  - Decision intent (`question`) is accepted at commit time but not persisted as first-class record data.
- **Scope of error**
  - SDK input/output types, storage interface, SQLite schema/migrations, memory storage parity, query results, MCP payloads.
- **Proposal/plan to fix**
  1. Extend record schema with `question_text` (nullable for back-compat).
  2. Write migration for SQLite with data-safe default and migration test coverage.
  3. Update `commitDecision` pipeline to persist `question_text`.
  4. Include `question_text` in `suggest` snippets and `expand` payload where relevant.
  5. Add round-trip tests across storage engines and MCP tool tests validating visibility.
  6. Add docs explaining when `q_id` vs `question_text` should be used.

## 3) Retrieval relevance model is minimal (Medium)

- **Error we are going to solve**
  - Retrieval quality relies on basic `LIKE` clauses with limited ranking semantics.
- **Scope of error**
  - SQLite search implementation, optional index management, ranking policy, evaluation harness, performance tradeoffs.
- **Proposal/plan to fix**
  1. Introduce deterministic weighted scoring (ID exact > domain > text > constraints).
  2. Add optional SQLite FTS path behind config flag.
  3. Build benchmark dataset (`fixtures/retrieval-goldens`) and scripts to compute precision@k/recall@k/success@k.
  4. Add regression threshold checks in CI (non-flaky fixed corpus).
  5. Document tuning knobs and safe defaults for small vs large datasets.

## 4) Cross-project sharing defaults may overexpose by default (Medium)

- **Error we are going to solve**
  - If sharing rules are absent, visibility defaults to open across projects.
- **Scope of error**
  - Access control logic in SDK/storage, default config semantics, migration behavior, docs, operator expectations.
- **Proposal/plan to fix**
  1. Change default behavior to strict current-project isolation.
  2. Add explicit config `defaultProjectIsolation: "strict" | "open"` (default `strict`).
  3. Maintain legacy behavior only when explicitly configured for compatibility.
  4. Surface source project/visibility scope in suggest responses.
  5. Add tests for no-rules behavior, explicit-sharing behavior, and cross-project denial/allow cases.
  6. Add upgrade note with security impact callout.

## 5) Competency profiling is frequency-only (Low/Medium)

- **Error we are going to solve**
  - Domain competency signal is count-based and vulnerable to quantity bias.
- **Scope of error**
  - Competency aggregation logic, scoring model, API output shape, explainability text.
- **Proposal/plan to fix**
  1. Introduce weighted score including recency decay and superseded penalty.
  2. Add confidence bands (e.g., low/medium/high confidence) instead of hard binary thresholds.
  3. Expose score components in debug mode for auditability.
  4. Validate on synthetic and historical corpora to avoid regressions.
  5. Document model assumptions and gaming limitations.

## 6) Change management risk (Blind spot)

- **Error we are going to solve**
  - Weak release discipline enables drift and accidental breakage.
- **Scope of error**
  - Versioning policy, changelog quality, deprecation process, cross-package release coordination.
- **Proposal/plan to fix**
  1. Adopt explicit semver policy and cross-package release checklist.
  2. Require migration notes for all breaking/renamed symbols.
  3. Add “breaking change detector” job comparing public type/tool names.
  4. Enforce conventional changelog sections: Added/Changed/Deprecated/Removed/Migration.

## 7) Documentation trust risk (Blind spot)

- **Error we are going to solve**
  - Documentation and executable reality diverge.
- **Scope of error**
  - README, SPEC/ROADMAP references, examples, test docs, snippets used by users.
- **Proposal/plan to fix**
  1. Generate docs snippets from tested examples where possible.
  2. Add docs validation in CI (compile/run snippets).
  3. Mark version applicability at top of each major doc.
  4. Add “known incompatibilities” section until drift is eliminated.

## 8) Data governance risk (Blind spot)

- **Error we are going to solve**
  - Least-privilege expectations are not guaranteed by defaults.
- **Scope of error**
  - Configuration defaults, local multi-project environments, auditability of access decisions.
- **Proposal/plan to fix**
  1. Implement strict-by-default isolation (see item 4).
  2. Add access decision logging hooks for diagnostics.
  3. Provide explicit policy templates for personal vs team environments.
  4. Add security test suite covering unexpected visibility leakage.

## 9) Evaluation blind spot (Blind spot)

- **Error we are going to solve**
  - No consistent benchmark framework for retrieval quality and workflow outcomes.
- **Scope of error**
  - Test assets, benchmark scripts, CI reporting, release quality gates.
- **Proposal/plan to fix**
  1. Create benchmark harness with fixed corpora and expected relevance.
  2. Track precision@k, recall@k, success@k, and token cost deltas.
  3. Publish benchmark report artifact in CI for every PR touching retrieval.
  4. Set fail thresholds only after baseline stabilization period.

## 10) Operational migration blind spot (Blind spot)

- **Error we are going to solve**
  - Partial or failed schema migrations may go undetected in user environments.
- **Scope of error**
  - Migration engine, startup checks, telemetry/logging, recovery/runbook docs.
- **Proposal/plan to fix**
  1. Add migration preflight and post-migration integrity checks.
  2. Introduce migration status table/checksum verification.
  3. Add startup warning/fail-fast for inconsistent schema states.
  4. Document rollback/recovery playbook and troubleshooting steps.

## 11) Product usability KPI implementation

- **Error we are going to solve**
  - KPIs are recommended but not operationalized.
- **Scope of error**
  - Telemetry schema, event emission points in SDK/MCP server, dashboards/reports.
- **Proposal/plan to fix**
  1. Define canonical event schema for commit/suggest/expand/supersede operations.
  2. Instrument time-to-first-decision and tool completion rate.
  3. Classify errors (validation/tool-not-found/schema mismatch) with stable codes.
  4. Add opt-in telemetry config and local report command.

## 12) Retrieval KPI implementation

- **Error we are going to solve**
  - Retrieval quality metrics are not continuously measured.
- **Scope of error**
  - Benchmark harness, CI metrics export, regression triage workflows.
- **Proposal/plan to fix**
  1. Automate precision@k/recall@k/success@k runs on benchmark corpus.
  2. Track `% suggest results requiring expand` and downstream completion success.
  3. Compare token cost against full-history baseline.
  4. Store historical metric snapshots for trend monitoring.

## 13) Logic soundness KPI implementation

- **Error we are going to solve**
  - Graph integrity/supersession invariants are not measured as release gates.
- **Scope of error**
  - Integrity checks, property tests, data fixtures, CI enforcement.
- **Proposal/plan to fix**
  1. Add graph integrity suite (no dangling supersedes refs, valid statuses, lineage continuity).
  2. Add supersession correctness tests (old node state, new node linkage).
  3. Track constraint dedup ratio and alert on abnormal shifts.
  4. Run integrity suite in CI and before publish.

## Sequenced execution plan

### Phase 0 (Stability first: 1–2 weeks)
1. Canonical API contract + test/doc synchronization (Item 1).
2. Persist and expose `question_text` (Item 2).
3. Strict-by-default project isolation and config (Item 4).

### Phase 1 (Quality + safety hardening: 2–3 weeks)
1. Retrieval ranking + optional FTS + benchmark harness (Items 3, 9, 12).
2. Migration integrity checks and operational guardrails (Item 10).
3. Documentation trust workflow + CI doc validation (Item 7).

### Phase 2 (Observability + model maturity: 2 weeks)
1. KPI instrumentation for usability and logic soundness (Items 11, 13).
2. Competency model quality scoring and explainability (Item 5).
3. Release/change management enforcement (Item 6).

## Ownership suggestion

- **Core data/model**: `packages/core`
- **SDK contract + storage + retrieval**: `packages/sdk-ts`
- **MCP tool/API stability + telemetry plumbing**: `packages/mcp-server`
- **Docs/release discipline**: root docs + CI workflows

## Definition of done (global)

- Tests/docs/examples align with canonical API contract.
- `question_text` survives commit -> suggest/expand round-trip.
- Default access control is least-privilege (`strict`) unless explicitly opened.
- Retrieval KPIs and logic integrity KPIs run in CI with visible artifacts.
- Migration checks detect partial/inconsistent schema states.
- Release checklist enforces migration notes and breaking-change disclosure.

## 14) Engine boundary vs cross-decision collaboration (New requirement)

- **Error we are going to solve**
  - Plan ambiguity on whether enterprise cross-decision collaboration belongs in this repository or an external system.
- **Scope of error**
  - Product boundary definitions, MCP extension points, enterprise integration strategy, token optimization architecture.
- **Proposal/plan to fix**
  1. Keep this repository as the **decision-memory engine** (commit/suggest/expand/supersede, retrieval, integrity, local policy).
  2. Add explicit extension interface for external collaboration orchestrators:
     - `external_context_provider` hook for additional ranked candidate IDs.
     - `federated_suggest` MCP tool contract (optional) that merges local + external pointers.
     - deterministic merge policy with provenance tags (`source: local|external`).
  3. Do **not** implement enterprise identity/workflow/chat orchestration here unless required for correctness.
  4. If external orchestration cannot supply deterministic ranking/provenance guarantees, fallback implementation should live in `packages/mcp-server` as a plugin-style adapter (still isolated from core decision schema).
  5. Document non-goals: org chart permissions, human approval workflows, and global chat memory remain out of scope for this engine.

## 15) Token consumption claim impact (Before vs After)

- **Error we are going to solve**
  - Token-efficiency claim is currently qualitative and not tied to measurable before/after baselines.
- **Scope of error**
  - SDK/MCP payload design, retrieval precision, expansion ratio, benchmark methodology, user-facing messaging.
- **Proposal/plan to fix**
  1. Define baseline as “full-history prompt injection” and compare against `suggest -> expand` flow.
  2. Measure and publish these metrics per release: median prompt tokens, P95 prompt tokens, expansion rate, successful completion rate.
  3. Target improvements from this roadmap:
     - API consistency: reduces retries/tool-name errors (indirect token savings).
     - `question_text` persistence: improves first-pass relevance and lowers unnecessary expands.
     - Ranking/FTS: improves precision@k, reducing irrelevant candidates and context bloat.
     - strict isolation defaults: avoids cross-project noise injection.

### Token estimate model (planning assumptions)

| Scenario | Before (current drift/minimal ranking) | After (plan complete) | Why |
|---|---:|---:|---|
| Median `suggest` payload | 350-700 tokens | 180-350 tokens | Better ranking + tighter snippets + reduced irrelevant hits |
| `% requests needing expand` | 55-75% | 25-45% | Higher quality top-k from persisted question + weighted ranking |
| Median total per task (`suggest` + optional `expand`) | 1.3k-2.6k | 700-1.5k | Fewer retries/expands and smaller selected context |
| Tool-call retry overhead | 8-20% extra tokens | 1-5% extra tokens | Contract alignment eliminates unknown-tool/API mismatch loops |

Expected claim update (conservative): **~30-50% lower median context-token usage** versus current behavior, and larger gains versus full-history prompting.

## 16) Local MCP server load impact (Before vs After)

- **Error we are going to solve**
  - Lack of clear local resource footprint guidance for users running MCP server on personal hardware.
- **Scope of error**
  - CPU/RAM/storage overhead at idle and under query load, indexing cost, migration cost, default configs.
- **Proposal/plan to fix**
  1. Publish runtime profile doc for laptop-class hardware (4-core / 16 GB RAM reference).
  2. Keep FTS optional and disabled by default for very small datasets; enable automatically above configured record threshold.
  3. Add maintenance knobs:
     - index rebuild schedule
     - max results / max expansion payload
     - telemetry sampling rate
  4. Add startup diagnostics command (`mcp-server doctor`) reporting DB size, index state, and expected query latency band.

### Local resource envelope (planning assumptions)

| Metric | Before | After (without FTS) | After (with FTS enabled) |
|---|---:|---:|---:|
| Idle RAM | ~70-120 MB | ~80-140 MB | ~100-180 MB |
| Query CPU spike (`suggest`) | low-to-medium | low-to-medium | medium |
| P50 `suggest` latency (10k records) | 120-260 ms | 90-180 ms | 40-120 ms |
| Storage footprint (10k decisions) | 1.0x | 1.05x (question_text + metadata) | 1.15x-1.35x (FTS index) |
| Migration/startup overhead | minimal but opaque | +small integrity checks (predictable) | +index verification time |

Interpretation:
- For most local users, the plan trades a **small RAM/storage increase** for better relevance and lower token consumption.
- Power users with large datasets can opt into FTS for latency gains, accepting moderate index/storage overhead.
