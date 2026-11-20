# Migration Inventory — RidgeLine Convert → Independent Next.js SaaS

Status legend: **MIGRATED** (native, verified) · **PRESERVED** (carried over as-is) · **OPTIONAL CONNECTOR** (kept, product does not depend on it) · **FOUNDATION** (secure structure + real status states; activation needs external credentials/approvals)

| Feature | Implementation location | Previously depended on GHL? | Replacement / status | Status |
|---|---|---|---|---|
| Multi-tenant organizations (agency → locations) | `prisma/schema.prisma` (`Agency`, `Contractor`, `Membership`) | No | Native tenancy; server-side scoping in `src/lib/api.ts` (`requireAccess`) | **MIGRATED** |
| Staff auth (email/password + signed sessions) | `src/app/api/session/route.ts`, `src/lib/session.ts` | No | HMAC cookie + Bearer token; OIDC env hooks (`OIDC_*`) for Google Workspace/any IdP | **PRESERVED** |
| Role-based access (agency admin / owner / office / estimator) | `src/lib/api.ts` (`assertManage`, `estimatorScope`) | No | Enforced server-side on every query/mutation | **MIGRATED** |
| Lead capture — homeowner intake form | `src/app/api/public/intake/route.ts` | No | Native public endpoint with duplicate guard | **PRESERVED** |
| Lead capture — external sites & partner systems | `src/app/api/v1/leads/route.ts`, `src/lib/ratelimit.ts` | Yes (GHL inbound webhooks) | `POST /api/v1/leads`: hashed org API keys, Zod validation, dedupe, rate limits, consent, audit | **MIGRATED** (new) |
| Contacts (create/update/dedupe/tags/notes/history) | `Contact`, `ConsentEvent`, `Activity`, `Touchpoint` models | Yes (GHL contacts) | Native contact records scoped per organization with consent tracking | **MIGRATED** |
| Sales pipeline (stages, statuses) | `Inquiry.stage` + `src/lib/constants.ts` (`STAGES`) | Yes (GHL opportunities/pipelines) | Native stage model (NEW → RESPONDING → BOOKED → INSPECTED → QUOTED → WON/LOST/PAUSED) | **MIGRATED** |
| Estimates & payments | `Estimate`, `Payment` models + `/api/estimates`, `/api/payments` | Partial (status sync) | Native estimates with view/accept lifecycle; payment matching (GHL adapter optional) | **MIGRATED** |
| Tasks (assign, due dates, automation-created) | `Task` model + `/api/tasks` | Yes (GHL tasks) | Native tasks with dedupe keys and STAFF/AUTOMATION origin | **MIGRATED** |
| Appointments & booking | `Appointment`, `/api/appointments`, `/api/availability`, `/api/public/booking` | Yes (GHL calendars) | Native booking with double-booking guards, manage links, reminders | **MIGRATED** |
| AI lead qualification | `src/lib/ai.ts` | Partial (Go engine AI brain) | z.ai (default) / OpenAI / deterministic fallback; Zod-validated verdicts; `AIInteraction` journal; staff overrides | **MIGRATED** (new) |
| Background automation (queues, retries, dead-letter) | `BackgroundJob` model, `mini-services/worker/`, `src/lib/engine.ts` | Yes (Go engine queue) | PostgreSQL-backed durable job queue + TS worker; atomic claims, backoff, stale-claim recovery, dead-lettering | **MIGRATED** (new) |
| Messaging / follow-up sequences | `OutboxMessage`, `src/lib/templates.ts`, `src/lib/engine.ts` | Yes (GHL conversations/SMS) | Provider-independent outbox with stop rules (reply/opt-out/pause win); simulated delivery in demo; real provider adapters plug in via credentials | **MIGRATED** (delivery simulated until a provider is configured) |
| Webhook ingestion (verify, dedupe, journal, replay) | `ProviderEvent`, `/api/webhooks/ghl`, `/api/provider-events` | Yes | Signature verification + durable event journal with terminal states and replay | **PRESERVED** |
| Missed-call recovery, AI voice, reactivation, AI estimates, revenue attribution, AI knowledge base | `docs/` roadmap | Yes (Go engine) | Extension points preserved in schema/engine; explicitly **not simulated** | **FOUNDATION** |
| GoHighLevel connector | `src/lib/providers.ts`, `ProviderInstall`, `/api/connections` | — | Kept as an optional connector; status `not_configured` without credentials; product never requires it | **OPTIONAL CONNECTOR** |
| Go engine (`services/engine-go`) | did not exist in this repository | Yes | Nothing to port — all relevant capabilities re-implemented natively in TypeScript | **MIGRATED** (no Go services required) |
| Demo data + operator clock | `prisma/seed.ts`, `src/lib/democlock.ts` | No | Preserved unchanged | **PRESERVED** |

## Database

- `prisma/schema.prisma` is now **PostgreSQL** (`provider = "postgresql"`) — the committed, deployable schema for Neon.
- Local development runs the same engine via embedded PostgreSQL (`scripts/pg-server.ts`, auto-started by `scripts/dev.ts`), so there is no engine drift between dev and production.
- `bun run db:use-sqlite` remains available as an emergency fallback but is no longer the default path.
- New models this migration: `ApiKey`, `BackgroundJob`, `AIInteraction`; new indexed AI fields on `Inquiry` (`aiCategory`, `aiScore`, `aiConfidence`, `aiUrgency`, `aiNextAction`, `aiSuggestedReply`, `aiMissingInfo`, `aiClassifiedAt`, `aiModel`, override fields).

## Verified end-to-end (local PostgreSQL, 2026-11-20)

- `bun run db:push` + seed against PostgreSQL; sign-in, dashboard, inquiries, tasks all served from Postgres.
- `POST /api/v1/leads` → contact + inquiry created, consent captured, audit logged.
- AI qualification landed (z.ai `glm-4-flash`): urgent leak → **HOT/95/HIGH**, price-shopper → **WARM/40/LOW**, solicitation → **SPAM/0**.
- `GET /api/v1/leads?id=…` status endpoint; invalid key → 401; cross-tenant id with a valid foreign key → 404 (no info leak); rate limit exceeded → 429 with `retryAfterSec`.
- Worker (`:3004/health`): jobs claimed atomically, `done` counter increments, retries configured, dead-letter after `maxAttempts`.
- Duplicate suppression: same `externalId` and same contact/service/ZIP within 30 min both return `duplicate: true`.
