# RidgeLine Engine — Go

The high-performance half of RidgeLine's automation stack (the "Go/worker split"
previewed in `src/lib/engine.ts`): webhook ingest, normalization, an audit
journal, a priority action queue and worker pool — all in dependency-free
standard-library Go.

```
GHL webhook ──▶ HMAC verify ──▶ rate limit ──▶ parse ──▶ journal
                                                       │
                     canonical event ◀── normalize ────┘
                            │
                     ordering + dedupe guards
                            │
                     plan actions (pure)
                            │
                     priority queue ──▶ worker pool ──▶ actions + projection
```

## Run

```bash
make run            # dev mode: ENGINE_DEV=true, unsigned webhooks allowed
make demo           # fire one signed intake webhook through the pipeline
curl localhost:8088/v1/stats   # operational snapshot
```

## CLI

```bash
make buildctl
./bin/convertctl ping
./bin/convertctl stats
./bin/convertctl events --status FAILED --limit 20
./bin/convertctl replay --limit 50
```

## Endpoints

| Method | Path                 | Purpose                                    |
| ------ | -------------------- | ------------------------------------------ |
| POST   | `/v1/webhooks/ghl`   | provider ingest (HMAC-SHA256 verified)     |
| GET    | `/v1/events`         | journal listing (`?status=&limit=`)        |
| POST   | `/v1/replay`         | re-drive recoverable events                |
| GET    | `/v1/stats`          | operational snapshot                       |
| GET    | `/v1/contacts`       | projection listing                         |
| POST   | `/v1/demo/fire`      | self-fire signed webhook (`ENGINE_DEV`)    |
| GET    | `/healthz` `/readyz` | liveness / readiness                       |
| GET    | `/metrics`           | Prometheus text format                     |

## Design invariants

- **Every delivery lands in the journal** — even invalid or rejected ones —
  so nothing is silently dropped and everything is replayable.
- **Planning is pure.** Workers re-validate eligibility before any real send;
  a reply, opt-out or pause that arrives before the send wins the race.
- **Bounded everything.** Token-bucket rate limits, bounded queue with
  explicit backpressure states, capped retries with jittered exponential
  backoff.
- **Zero external dependencies.** The module builds with `go build ./...`
  on any machine, no network required.
