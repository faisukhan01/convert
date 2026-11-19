# RidgeLine Go Engine — the Go / GHL Stack

The Go automation engine that powers RidgeLine Convert: webhook ingest,
lead scoring, rules-based routing and **GoHighLevel (GHL) API execution**,
backed by a durable PostgreSQL mirror and a z.ai brain.

## Why Go here

The hot path of lead automation is I/O-bound, concurrency-heavy and
latency-sensitive: sign → parse → score → route → execute, thousands of
times per minute, with hard guarantees on opt-outs. Go gives the engine
single-binary deploys, predictable memory, first-class HTTP and context
cancellation — while the TypeScript app stays focused on the operator
experience.

## Components

| Component | Path | Role |
|---|---|---|
| Engine daemon | `cmd/engine` | Ingest → normalize → score → route → queue → execute |
| GHL SDK | `internal/ghlapi` | Typed GoHighLevel API v2 client + intent executor |
| Pipeline | `internal/pipeline` | Normalize, enrich, dedupe, order, plan |
| Scoring | `internal/scoring` | Deterministic lead temperature (hot/warm/cold) |
| Rules | `internal/rules` | Declarative routing ruleset with stats |
| AI brain | `internal/ai` | z.ai qualification + reply drafting (with fallbacks) |
| Durable store | `internal/store/pg` | PostgreSQL mirror: events, contacts, actions |
| Queue | `internal/queue` | Bounded priority queue with retries/backoff |
| Server | `internal/server` | HTTP surface incl. admin + GHL proxy |
| CLI | `cmd/ghlctl` | Operator CLI for the GHL surface |

## Build & Run

```bash
go build -o bin/engine ./cmd/engine
go build -o bin/ghlctl ./cmd/ghlctl

# with the durable Postgres mirror
DATABASE_URL="postgres://postgres@127.0.0.1:5432/convert?sslmode=disable" \
ENGINE_DEV=true ENGINE_REQUIRE_SIGNATURE=false ./bin/engine
```

## Key environment variables

| Variable | Effect |
|---|---|
| `GHL_ACCESS_TOKEN` | Private Integration Token — without it the executor is dry-run |
| `GHL_LOCATION_ID` | Sub-account the executor writes into |
| `GHL_DRY_RUN` | Force dry-run even with a token (default: no token = dry-run) |
| `DATABASE_URL` | Postgres DSN — enables the durable mirror |
| `ZAI_API_KEY` | z.ai brain key — without it, deterministic fallbacks serve |
| `ZAI_MODEL` | Model id (default `glm-4-flash`) |
| `ENGINE_ADMIN_TOKEN` | Guards rules PUT + GHL write proxies |
| `ENGINE_RULES_FILE` | JSON ruleset; omit for the built-in set |

## API surface

`POST /v1/webhooks/ghl` · `GET /v1/score` · `GET|PUT /v1/rules` ·
`POST /v1/ai/qualify` · `POST /v1/ai/reply` · `GET /v1/ghl/status` ·
`GET /v1/ghl/pipelines` · `POST /v1/ghl/contacts` ·
`POST /v1/ghl/opportunities` · `GET /v1/store/stats|events|actions` ·
`GET /v1/events` · `POST /v1/replay` · `POST /v1/demo/fire` ·
`GET /healthz|/readyz|/metrics`

## Design guarantees

1. **Stop rule wins the race** — opt-outs are evaluated first and suppress
   every downstream send.
2. **Nothing is silently dropped** — every delivery lands in the journal
   with an explicit terminal state; stuck events replay via `POST /v1/replay`.
3. **No double sends** — idempotency keys collapse redeliveries; the
   executor keeps a per-process suppression cache.
4. **Fail soft on AI** — the brain's absence degrades to keyword scoring,
   never to a stalled pipeline.
5. **Durable audit** — every executed intent is recorded in Postgres with
   status and error detail.
