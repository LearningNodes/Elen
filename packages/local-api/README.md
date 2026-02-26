# @learningnodes/elen-local-api

> Read-only HTTP server that exposes your local Elen Decision Network to the cloud dashboard.

## Quick Start

```bash
npx @learningnodes/elen-local-api
```

Then open [visualize.elen.app](https://visualize.elen.app) — your dashboard will connect automatically.

## How It Works

```
Your Machine                           Cloud (elen.app)
────────────────────────────           ────────────────
~/.elen/decisions.db
        │
elen-local-api :3333  ◄──── browser fetch ───── HTML/CSS/JS
(read-only GET API)          (your browser)       (minified)
```

**Your data never leaves your machine.** The browser fetches directly from `localhost:3333`. The cloud only serves the UI files.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ELEN_DB` | `~/.elen/decisions.db` | Path to your decisions database |
| `ELEN_API_PORT` | `3333` | Port to listen on |
| `ELEN_ORIGINS` | — | Extra comma-separated CORS origins |

## API Endpoints

All endpoints are read-only `GET` requests.

| Endpoint | Description |
|---|---|
| `/api/health` | Connection check, DB status, record count |
| `/api/projects` | List projects with record counts |
| `/api/records?project=X` | Decision records (latest 200) |
| `/api/stats?project=X` | Aggregate stats, domains, timeline |
| `/api/threads?project=X` | Threaded decision view |
| `/api/competency/:agentId` | Agent competency profile |
| `/api/usage?project=X` | Citation and reuse analysis |
| `/api/efficiency?project=X` | ROI metrics (token cost vs. savings) |
| `/api/precedent-rate?project=X` | Search hit rate |
| `/api/skill-suggestions?project=X` | Skills worth codifying |
