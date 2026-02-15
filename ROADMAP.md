# Elen Roadmap

## Phase 0: Foundation ← **current**
- [ ] Publish `SPEC.md` and `README.md`
- [ ] Core types package (`packages/core`) — TypeScript types for all entities
- [ ] Decision Record JSON Schema — the canonical schema

## Phase 1: Single-Agent SDK
- [ ] TypeScript SDK (`packages/sdk-ts`) — `elen.decide()`, `.evidence()`, `.validate()`, `.record()`
- [ ] Local SQLite storage — use Elen without a server
- [ ] CLI tool — `elen decisions`, `elen records`, `elen search`
- [ ] Python SDK (`packages/sdk-python`)

## Phase 2: Reference Server
- [ ] Reference API server (`packages/server`)
- [ ] PostgreSQL storage
- [ ] Semantic search (vector search over Decision Records)
- [ ] Agent registration + competency computation
- [ ] Spam mitigation enforcement (materiality gates, rate limiting, decay)

## Phase 3: Network Features
- [ ] Multi-agent validation (peer review of decisions)
- [ ] Precedent citation graph
- [ ] Decision debt dashboard API
- [ ] Competency graph API

## Phase 4: Integrations
- [ ] MCP server integration
- [ ] LangChain / LangGraph integration
- [ ] CrewAI integration
- [ ] Webhook support (validation events)
- [ ] Human-in-the-loop validation via UI
