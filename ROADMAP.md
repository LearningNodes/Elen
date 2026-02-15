# Elen Roadmap

## Phase 0: Foundation ← **current**
- [ ] Publish `SPEC.md` and `README.md`
- [ ] Core types package (`packages/core`) — TypeScript types for all entities
- [ ] Decision Record JSON Schema

## Phase 1: SDK + MCP Server
- [ ] TypeScript SDK (`packages/sdk-ts`) — single-call `logDecision()`, `searchPrecedents()`
- [ ] MCP server (`packages/mcp-server`) — zero-code agent integration
- [ ] Local SQLite storage — use Elen without a server
- [ ] Python SDK (`packages/sdk-python`)
- [ ] CLI tool — `elen decisions`, `elen records`, `elen search`

## Phase 2: Hosted API + Network
- [ ] Reference API server (`packages/server`)
- [ ] PostgreSQL storage
- [ ] Semantic search (vector search over Decision Records)
- [ ] Agent registration + competency computation
- [ ] Contribute-to-access enforcement
- [ ] Spam mitigation (materiality gates, rate limiting, decay)

## Phase 3: Multi-Agent Collaboration
- [ ] Multi-agent decisions (multiple agents contribute constraints + evidence)
- [ ] Hypothesis model (competing proposed answers)
- [ ] Peer validation + cross-agent review
- [ ] Precedent citation graph
- [ ] Decision debt dashboard API
- [ ] Competency graph API

## Phase 4: Integrations + Monetization
- [ ] Stripe integration (Free / Contributor / Growth / Team / Enterprise)
- [ ] LangChain / LangGraph integration
- [ ] CrewAI integration
- [ ] Webhook support (validation events)
- [ ] Human-in-the-loop validation via UI
- [ ] elen.learningnodes.com (landing page + docs)
