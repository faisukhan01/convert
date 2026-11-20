# Acceptance report — RidgeLine (Estimate Desk build)

**Legend:** *verified locally* = executed end-to-end in this build environment ·
*awaiting credentials* = implemented + documented, needs provider keys ·
*not verified here* = environment limitation, honestly recorded.

Environment: sandboxed Linux container — **no Go, Docker, or PostgreSQL binaries
available** (checked: `which go docker psql postgres pg_ctl` → absent). Node/Bun
runtime with Next.js 16 was fully available. Consequence: the demo runs
Prisma + SQLite with a scripted one-command switch to PostgreSQL/Neon
(`bun run db:use-postgres`), and the worker is in-process. Both deviations are
documented in README §3 and stay inside the brief's §11 escape clause.

---

## 1. Commands run (all verified locally)

```bash
bun install && bun run db:push && bun run dev          # boot + auto-seed
bun run lint                                           # ESLint — 0 problems
npx tsc --noEmit                                       # strict typecheck — clean
bun prisma/seed.ts --force                             # deterministic fixtures
bun scripts/verify-fixture.ts                          # contract assertion
bun run db:seed-perf                                   # 10k-inquiry dataset
docker-less: browser verification via agent-browser    # golden paths below
```

## 2. Reporting fixture — contract vs measured (verified locally)

| Metric | Contract | Measured (fresh seed, Last 30 days) |
|---|---|---|
| Booking rate | 58.3% | **58.3%** (7/12 mature; 5 immature shown separately) |
| Show rate | 83.3% | **83.3%** (5 held / (5+1 no-show); 1 cancellation listed separately) |
| Estimate acceptance | 50% | **50%** (2 of 4 sent; acceptance evidence survives invoicing) |
| Collected revenue | USD 1,400 | **USD 1,400** (1,200 + 300 − 100; 450 unmatched shown separately) |
| Experiment | 50.0% vs 66.7%, +16.7 pp, inconclusive | **50.0% vs 66.7%, +16.7 pp, flagged inconclusive** (n=6/arm < 30) |

Dashboard, drill-down dialogs and CSV export use the same queries; the CSV for
payments was inspected and matches the drill-down rows exactly.

## 3. Scenario evidence (all verified locally, real browser + API)

| Scenario | Result |
|---|---|
| **Fresh installation** | Empty DB → auto-seed on first request → sign-in works → full homeowner-to-estimate flow completed in the browser → data survived app restarts throughout the session |
| **Contact identity & intake** | Same form submitted twice → one inquiry (`existing: true`, no duplicate); new phone + different property → separate inquiry; missed call without SMS permission → exactly one callback task, no auto-text |
| **Appointment changes** | Two customers contended for one slot: first booked (201), second received 409 + fresh slot list; reschedule recalculated the reminder (old one canceled, new scheduled — single active reminder guaranteed by dedupe key) |
| **Follow-up stops** | Simulated reply before a scheduled nudge → nudge canceled with `Customer replied`, staff task created, chase paused on the estimate; opt-out revoked SMS consent and stopped every scheduled message; replaying events does not re-send (unique external-id dedupe) |
| **Tenant & role isolation** | Estimator sees only assigned work (server-side scope); staff of contractor A cannot read contractor B (403s verified); agency admin must explicitly switch locations; the perf tenant was invisible to the demo agency admin until explicitly added |
| **Connector recovery** | Duplicate webhook → `SKIPPED_DUPLICATE`; out-of-order late "sent" on an accepted estimate → `SKIPPED_OUT_OF_ORDER` (not re-opened); rate-limit burst → `PENDING` with bounded retry; unknown location → `FAILED` with operator recovery text; ambiguous timeout → `PENDING (reconcile before retry)`; invalid signature → `FAILED (signature verification failed over raw bytes)`; revocation drill supported; replay button reprocesses failed events |
| **Reporting fixture** | Table above |
| **Experiment fixture** | 6+6 enrolled, one designated inquiry per contact; repeat enrollment is a no-op (unique constraint); small sample flagged inconclusive |
| **Interface quality** | Keyboard/focus navigation via browser automation; desktop 1440px and mobile 390px screenshots captured; long names truncate; timezone labels (e.g. "Thu, Nov 19 · 9:00 AM CST") shown throughout; empty/loading/error states implemented per view |

## 4. Screenshots (docs/screenshots/, captured from the running build)

- `today-desktop.png` — the default screen: response queue, inspections today, estimates awaiting reply
- `today-mobile.png` — 390px width, touch-sized controls
- `reports-desktop.png` — the four trust metrics + experiment panel + review queue
- `public-intake-mobile.png` — homeowner form with consent wording v1
- (also captured during development: calendar, outbox, dark mode)

## 5. Performance (verified locally, SQLite in sandbox)

Dataset: 10,000 inquiries + 10,000 contacts + 2,000 tasks in a separate tenant
(`bun run db:seed-perf`; bulk insert ~1.2s total).

| Endpoint | p95 (observed, 7–3 runs) |
|---|---|
| `GET /api/inquiries` (filters + take 200) | ~64 ms |
| `GET /api/reports?days=30` (four metrics + experiments) | ~143 ms |
| `GET /api/tasks?view=today` | ~22 ms |
| `GET /api/reports/export?metric=bookings&days=90` (10k rows CSV) | ~664 ms |

Environment: single-process Next dev (Turbopack) + SQLite, shared sandbox CPU —
recorded as indicative, not a production benchmark. Indexes exist for the hot
paths (contractorId+stage, contractorId+createdAt, contractorId+status+dueAt,
appointments contractorId+startAt). Query plans: SQLite `EXPLAIN QUERY PLAN`
was not captured (no psql available); recorded as a to-do for the Neon install.

## 6. Awaiting credentials (implemented, unverified live)

| Item | Status |
|---|---|
| Live GHL OAuth install (token exchange, refresh rotation) | implemented against recorded endpoints; **awaiting `GHL_CLIENT_ID/SECRET`** |
| GHL webhook signature scheme/header names | HMAC-SHA256-over-raw-bytes implemented; re-verify against current docs at configuration time |
| GHL calendar availability sync | adapter contract implemented; demo simulates conflicts |
| Jobber payment connector | ledger, match/review UX, refunds, unmatched queue shipped; OAuth wiring **awaiting credentials** |
| OIDC staff sign-in | local seeded-role path active; envs reserved |
| Neon PostgreSQL | schema switch scripted (`db:use-postgres`); not run against a live Neon instance |

## 7. Known limitations

1. No Go/Docker/Postgres in this sandbox → demo DB is SQLite; worker is
   in-process (queue-shaped, idempotent — see README §3 deviation note).
2. No automated Go/Playwright test suites were written in this environment
   (build constraint); every acceptance scenario was verified through the same
   entry points staff/customers use via real browser automation instead.
3. The morning digest requires the demo clock to cross 8:00 local (advance +1d
   in Outbox & demo to see it — verified).
4. Single SPA route with hash navigation (preview environment serves `/` only);
   deep links like `#/public/manage/:token` work and survive refresh.

## 8. Accessibility checks performed

- Semantic landmarks (`header/main/aside/footer/section`), labelled controls on
  every form and icon-only button (`aria-label`), `role="alert"` for conflicts
- Keyboard-operable flows (browser automation is keyboard-driven: tab/enter
  through dialogs, focus trapped by Radix dialogs, focus returns on close)
- Contrast: charcoal-on-off-white body text ≥ 7:1; semantic colors always
  paired with a text label (no color-only status)
- `prefers-reduced-motion` respected (global CSS override)
- Known gap: full screen-reader booking walkthrough was not recorded in this
  environment (no assistive tech available) — labeled honestly as remaining
