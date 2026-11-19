# RidgeLine — the estimate desk for roofing teams

A multi-tenant SaaS for roofing contractors: capture inquiries, book inspections,
chase estimates, and trace the path from first inquiry to matched payment.
Built for the busy-Monday office: **Today** answers *who needs a response, which
inspection is waiting on someone, and which website inquiries became paid work.*

Runs **fully locally with zero external credentials** — a simulated provider
replaces GoHighLevel until you supply keys, and every unmet prerequisite is
visible on the connection screen. The database is PostgreSQL-ready; local demo
runs on SQLite and switches to Neon with two commands.

---

## 1. Fastest demo path

```bash
bun install
cp .env.example .env          # defaults already work for the local demo
bun run db:push               # create the schema
bun run dev                   # http://localhost:3000  (auto-seeds an empty DB)
```

The app boots, seeds deterministic demo data on first request, and the worker
tick starts automatically. **Repeated restarts preserve your edits**; the demo
reset is explicit (below). No GHL / Jobber / billing credentials are needed.

| Sign in as | Email | Password | You get |
|---|---|---|---|
| Owner / office manager | `owner@ridgeline.demo` | `demo` | The queue, booking, quotes, reports |
| Office | `office@ridgeline.demo` | `demo` | Callbacks, assignment, payment matching |
| Estimator (phone) | `estimator@ridgeline.demo` | `demo` | Assigned visits + outcomes only |
| Agency admin | `agency@ridgeline.demo` | `demo` | Two locations, provisioning, switching |

Homeowner flow (no sign-in): header → **Homeowner view**, or
`/#/public/intake` → submit the form → pick a slot → book → manage/reschedule.

Demo controls (visible only in demo mode): **Outbox & demo** — advance the demo
clock (+1h/+1d/+7d) to mature multi-day follow-up in seconds, run the engine,
inspect every scheduled/stopped message with its stop rule, fire connector
recovery drills (duplicate webhook, out-of-order status, rate limit, revocation,
unknown location, ambiguous timeout), and **reset demo data** to the fixtures.

### Switch to your Neon PostgreSQL (when keys arrive)

```bash
bun run db:use-postgres       # flips prisma/schema.prisma provider to postgresql
# set DATABASE_URL in .env to your Neon connection string (…?sslmode=require)
bun run db:push
bun run dev                   # re-seeds the empty Neon database on first request
```

Model types were chosen to be identical on both engines (String-based status
fields, Decimal money, UTC instants, IANA timezones), so this is a provider
flip — not a migration rewrite.

### Reset demo explicitly

```bash
bun run demo:reset            # wipe + reinstall deterministic fixtures
# or click "Reset demo data" in Outbox & demo (demo mode only)
```

---

## 2. What's inside

| Area | Where |
|---|---|
| Homeowner intake → self-booking → reschedule/cancel | `#/public/*` views, `/api/public/*` |
| Today (response queue, inspections, aging estimates) | `#/today` |
| Inquiries + detail (consent, activity, tasks, automation queue) | `#/inquiries` |
| Calendar (week agenda, estimator phone view, stale outcomes) | `#/calendar` |
| Estimates (aging list, status ladder, chase ladder) | `#/estimates` |
| Reports (booking rate, attendance, acceptance, collected revenue) + drill-down + CSV | `#/reports`, `/api/reports/*` |
| Experiments (A/B follow-up messages, idempotent enrollment, inconclusive flag) | `#/reports` |
| Outbox & demo (clock, engine, stop rules, connector drills, replay) | `#/outbox` |
| Settings (profile, hours, playbooks, connection status, team, billing) | `#/settings` |
| Agency (provisioning, per-location status, explicit switching) | `#/agency` |

**Playbooks** (all stop-rule guarded, contact-window aware, dedupe-keyed):
new-inquiry booking link · missed-call callback (consolidated, auto-reply
suppressed without SMS permission) · inspection reminder (exactly one active,
recalculated on reschedule) · no-show recovery · estimate chase ladder
(+1/3/7d, editable) · morning digest (8:00 local). Every dispatch re-checks
eligibility immediately before sending, so a reply / opt-out / pause / decision
that arrives before the send wins the race.

**Connector architecture:** one adapter contract (`src/lib/providers.ts`) with
a simulated demo implementation and a GHL implementation recorded against the
current marketplace endpoints. Inbound webhooks verify the signature over the
raw bytes, durably record the event, process with idempotency + ordering guards
(a late "sent" never re-opens an accepted estimate), and expose failed events
with safe replay. OAuth tokens are AES-256-GCM encrypted per location.

**Trust boundaries:** every API route resolves the caller's tenancy server-side
(`requireAccess`), estimators are scoped to assigned work, agency admins must
explicitly switch locations, exports are scoped to the requester's filters, and
settings changes are audit-logged.

## 3. Architecture & ownership

```
Homeowner (public SPA views)          Staff (role-scoped SPA views)
        │                                     │
        ▼                                     ▼
  /api/public/*  ────────┐          /api/* (REST, tenancy-checked)
                         │                   │
                   ┌───── ▼ ────────┐   ┌─────▼─────┐
                   │  Automation    │   │ RidgeLine │
                   │  engine tick   │◄──┤ domain    │
                   │  (in-process)  │   │ services  │
                   └─────┬──────────┘   └─────┬─────┘
                         │     Outbox + dedupe keys
                         ▼                    ▼
              ┌────────────────┐    ┌────────────────┐
              │ Provider       │    │ PostgreSQL     │
              │ adapter        │    │ (Neon-ready)   │
              │ demo | GHL     │    │ Prisma         │
              └────────────────┘    └────────────────┘
```

- **Product-specific records live here**: staff permissions, inquiry-to-job
  links, task ownership, connector state, consent changes, attribution rules,
  audit events, reporting projections. GHL owns contacts/conversations/
  calendars in connected mode; the UI labels synchronized data with source and
  last-refresh.
- **Worker**: the queue is simulated in-process (15s tick, idempotent).
  Moving to the Go/worker split later means swapping the tick for a
  Postgres-backed queue (e.g. River) — the outbox + dedupe-key contract is
  already queue-shaped.
- **Stack**: Next.js 16 (App Router) · React 19 · TypeScript (strict) ·
  Tailwind 4 + shadcn/ui (New York) · Prisma 6 · SQLite→PostgreSQL/Neon ·
  zustand · sonner. Exact versions live in `package.json` / `bun.lockb`.

> **Deviation note (deliberate):** the original brief proposed a separate Go
> API service. This build implements the same REST contract as Next.js route
> handlers because the target environment runs Next.js only (no Go/Docker).
> The contract, tenancy rules and queue-shaped outbox are preserved, so a Go
> extraction is a re-hosting exercise, not a redesign. Everything else in the
> brief — GHL integration, real persistence, run-before-credentials — is intact.

## 4. The reporting contract (seeded fixtures)

`bun run demo:reset` installs fixtures that satisfy the acceptance contract
exactly, visible on `#/reports` for **Last 30 days**:

| Metric | Expected |
|---|---|
| Booking rate | **58.3%** — 7 of 12 mature eligible inquiries booked within 14 days (+5 immature shown separately) |
| Attendance | **83.3%** show rate — 5 held, 1 no-show, 1 cancellation shown separately |
| Estimate acceptance | **50%** — 2 accepted of 4 sent (revisions count once) |
| Collected revenue | **USD 1,400** — 1,200 + 300 receipts − 100 refund, +450 unmatched in the review queue |
| Experiment | A **50.0%** vs B **66.7%** (+16.7 pp), flagged inconclusive (n=6 < 30) |

Dashboard, drill-down and CSV export use the same queries. Verify any time:

```bash
bun scripts/verify-fixture.ts
```

## 5. Docs

- `docs/ghl-installation-guide.md` — WordPress embed, location mapping, playbook
  settings, sending ownership, snapshot recipe, activation checklist
- `docs/configuration-inventory.md` — every key: where it comes from, optional?,
  what it unlocks
- `docs/acceptance-report.md` — commands run, results, screenshots, known
  limitations, and what stays **awaiting credentials**
- `docs/screenshots/` — representative desktop + mobile captures

## 6. Deployment example

```bash
docker compose up            # app :3000 + Postgres (or point DATABASE_URL at Neon)
```

`Dockerfile` (multi-stage, non-root) and `docker-compose.yml` ship in-repo.
Health check: `GET /api/health`. Migration order: `db:push` before first boot;
seed runs only against an empty database.

## 7. Scripts

| Command | Purpose |
|---|---|
| `bun run dev` | Web app (single route + REST API) |
| `bun run lint` / `npx tsc --noEmit` | Lint / typecheck |
| `bun run db:push` | Apply schema |
| `bun run db:seed` | Seed if empty |
| `bun run demo:reset` | Explicit demo reset with fixtures |
| `bun run db:use-postgres` / `db:use-sqlite` | Flip datasource provider |
| `bun run db:seed-perf` | 10k-inquiry performance dataset (separate tenant) |
| `bun scripts/verify-fixture.ts` | Assert the reporting contract |

## 8. Known limitations (honest list)

- Go/Docker/Postgres binaries were unavailable in the build environment, so the
  running demo uses SQLite locally + in-process worker; the Postgres/Neon switch
  is scripted but **not exercised against a live Neon instance** (awaiting keys).
- GHL adapter endpoints are recorded from current docs and flagged for
  **live verification** once `GHL_CLIENT_ID/SECRET` exist; signature scheme and
  header names should be re-checked at configuration time.
- OIDC staff sign-in is scaffolded (envs reserved) with the local role path
  active — **awaiting credentials**.
- Jobber payment connector: contract + match/review UX modeled; OAuth wiring
  **awaiting credentials**.
- Automated test suites (Go/Playwright) from the brief are not included in this
  environment build; verification was performed end-to-end in a real browser
  and recorded in the acceptance report.
