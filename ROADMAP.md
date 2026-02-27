# Elen Product Roadmap

## Executive Summary
Elen is evolving from a local, single-player decision memory tool into a centralized, token-efficient Decision Memory Protocol and Cloud Service. This roadmap outlines the path from our open-source foundation to a fully hosted, multi-agent decision network ("The Tangle") that provides organizations with deep operational intelligence and control over their AI agents.

## Phase 1: The Open Core (Local & Token-Efficient) ✅
*Shipped. The foundational, token-efficient protocol for single-player/local agent workflows.*

- ✅ **Minimal Token Protocol**: `Suggest`, `Expand`, `Commit`, and `Supersede` primitives in the MCP server.
- ✅ **Local SQLite Engine**: Fast, local storage of decision pointers, constraints, and references.
- ✅ **SDK & MCP Release**: Published `@learningnodes/elen-core`, `@learningnodes/elen`, and `@learningnodes/elen-mcp` to npm (v0.1.6).
- ✅ **Bundled Local API**: Opt-in HTTP API for workstation integration (`ELEN_LOCAL_API=true`).
- ✅ **Repo Restructuring**: Public repo contains open-source engine; cloud, workstation, and homepage are in a separate private repository.

## Phase 2: The Command Center (Control & Analytics) 🚧
*In progress. Providing human oversight, metrics, and relationship management.*

- ✅ **Elen Workstation**: Cloud-hosted dashboard at [app.elen.learningnodes.com](https://app.elen.learningnodes.com). Data stays local — browser fetches from local MCP.
- 🚧 **Agent Relationship Control Panel**: Set up and manage trust rules and sharing permissions between different agents.
- 🚧 **Extensible Configuration**: Architecture designed for evolution, allowing future controls over agent autonomy, token budgets, and domain restrictions.

## Phase 3: "The Decision Network" (Graph Network Visualization)
*Focus: Turn decision memory into a living organism of organizational intelligence.*

- **Decision Graph UI**: Implement an interactive network visualization of decisions.
- **Domain Coloring & Clustering**: Color-code decisions by domain (product, risk, engineering, etc.) to instantly visualize interaction and constraints across an organization.
- **Contradiction & Drift Detection**: Visually identify orphaned decisions, conflicting constraints, and heavy decision clusters (architectural anchors) as the system evolves.

## Phase 4: Elen Cloud Service (The Centralized Network)
*Focus: Hooking up local/edge agents to the global, centralized decision network repository.*

### 4.1 Security
- **Namespace Isolation**: Strict multi-tenant isolation preventing cross-company data leakage while allowing opt-in anonymized sharing for the global network.
- **Private Decision Vaults**: Ensure proprietary constraints and decision text remain encrypted, allowing teams to use the global network without exposing trade secrets.

### 4.2 Authorization
- **Agent Identity & Provenance**: Provision identity keys for agents (e.g., via Clawhub.ai or OAuth integrations) to track who made which decisions.
- **Role-Based Access Control (RBAC)**: Enforce read/write limits based on agent domains, competency scores, and human approval workflows.

### 4.3 Functionality
- **Cloud Sync & Remote Query**: Agents sync local decisions to the cloud; the server processes constraint matching and semantic retrieval for global queries.
- **Contribute-to-Access Enforcement**: Gate API read access based on verified contribution metrics to build the network's moat.
- **Enterprise API & Webhooks**: Enable downstream CI/CD systems, Notion/Jira, and human-in-the-loop workflows to consume decision events in real-time.
