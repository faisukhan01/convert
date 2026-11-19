# The Go Engine (`services/engine-go`)

RidgeLine runs its automation brain in two coordinated halves:

- **TypeScript app** (`/`) — Next.js 16 product surface: dashboards, auth,
  tenancy-checked REST, templates, provider adapters, the DB as source of truth.
- **Go engine** (`services/engine-go`) — the high-throughput hot path:
  webhook ingest, normalization, audit journal, priority queue and worker
  pool. Standard-library only (`go build ./...`, zero module downloads).

The split mirrors the "Go/worker split" note in `src/lib/engine.ts`: the app
owns durable state and eligibility rules; the engine owns raw throughput,
backpressure and fan-out.

## Why Go on this stack

| Concern                    | TS app             | Go engine                    |
| -------------------------- | ------------------ | ---------------------------- |
| Webhook ingest at burst    | request-scoped     | token bucket + bounded queue |
| Ordering + idempotency     | per-request guards | stream-aware ordering guard  |
| Retries / backoff          | interval worker    | jittered exponential backoff |
| Audit trail                | ProviderEvent rows | ring journal + replay API    |
| Delivery (sends, adapters) | provider adapters  | action intents → app         |

## Pipeline contract

```
raw bytes → HMAC verify → rate limit → parse → journal → dedupe
          → normalize (canonical event) → ordering guard
          → plan (pure) → priority queue → workers → projection
```

Every delivery ends in an explicit journal state:

`RECEIVED → PROCESSED | DUPLICATE | RATE_LIMITED | BAD_SIGNATURE | INVALID | OUT_OF_ORDER | FAILED | REPLAYED`

The state names match the `ProviderEvent.status` enum in `prisma/schema.prisma`,
so journal exports drop straight into the app's reporting surfaces.

## Quick start

```bash
cd services/engine-go
make run        # dev mode, :8088
make demo       # signed demo webhook through the pipeline
make buildctl   # operator CLI
./bin/convertctl stats
```

Docker: `docker compose up -d --build engine` (compose service `engine`).

## Configuration (env)

| Variable                    | Default                              | Meaning                          |
| --------------------------- | ------------------------------------ | -------------------------------- |
| `ENGINE_PORT`               | `8088`                               | HTTP listen port                 |
| `GHL_WEBHOOK_SECRET`        | `ridgeline-demo-webhook-secret`      | HMAC secret (shared with app)    |
| `ENGINE_REQUIRE_SIGNATURE`  | `true`                               | enforce HMAC (must stay on)      |
| `ENGINE_RATE_LIMIT_PER_MIN` | `300`                                | per-location token bucket rate   |
| `ENGINE_BURST_MULTIPLIER`   | `2`                                  | bucket burst allowance           |
| `ENGINE_WORKERS`            | `8`                                  | worker pool size                 |
| `ENGINE_QUEUE_CAPACITY`     | `4096`                               | bounded queue depth              |
| `ENGINE_MAX_ATTEMPTS`       | `5`                                  | per-action retry ceiling         |
| `ENGINE_EVENT_LOG_CAPACITY` | `10000`                              | journal ring size                |
| `ENGINE_ALLOWED_ORIGINS`    | `http://localhost:3000`              | CORS allowlist                   |
| `ENGINE_DEV`                | `false`                              | demo-fire + relaxed guard        |

## CLI (`convertctl`)

`ping · health · stats · events · contacts · replay · demo-fire · version`
— script-friendly exit codes (0 ok / 1 transport / 2 usage).

## Metrics

Prometheus text at `/metrics`: ingest, processed, duplicates, invalid,
signature failures, rate-limited, out-of-order, queue overflow, replays,
actions executed, HTTP requests by route/status.
