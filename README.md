<div align="center">

<img src="docs/assets/banner.svg" alt="RidgeLine Convert — AI-Powered Lead Conversion Engine" width="100%"/>

<br/>

<a href="https://github.com/faisukhan01/convert">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono:wght@600&size=22&duration=3200&pause=900&color=F59E0B&center=true&vCenter=true&multiline=false&repeat=true&lines=Ingest+%E2%86%92+Validate+%E2%86%92+Dedupe+%E2%86%92+AI-Qualify+%E2%86%92+Automate;Full-stack+Next.js+16+%C2%B7+TypeScript+%C2%B7+Neon+PostgreSQL;Multi-tenant+SaaS+%C2%B7+durable+TS+worker+%C2%B7+zero+GHL+dependency;From+lead+to+customer+on+autopilot" alt="RidgeLine Convert typing animation"/>
</a>

<br/>
<br/>

<!-- Stack badges -->
<a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js_16-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 16"/></a>
<a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/></a>
<a href="https://www.postgresql.org"><img src="https://img.shields.io/badge/Neon_PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/></a>
<a href="https://www.prisma.io"><img src="https://img.shields.io/badge/Prisma_ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white" alt="Prisma"/></a>
<a href="https://z.ai"><img src="https://img.shields.io/badge/z.ai_Brain-A855F7?style=for-the-badge&logoColor=white" alt="z.ai"/></a>

<br/>

<!-- Meta badges -->
<a href="https://github.com/faisukhan01/convert/actions"><img src="https://img.shields.io/github/actions/workflow/status/faisukhan01/convert/ci.yml?style=flat-square&label=CI&labelColor=18181b&color=22c55e" alt="CI status"/></a>
<a href="LICENSE"><img src="https://img.shields.io/github/license/faisukhan01/convert?style=flat-square&labelColor=18181b&color=f59e0b" alt="License"/></a>
<a href="https://github.com/faisukhan01/convert/pulse"><img src="https://img.shields.io/github/commit-activity/m/faisukhan01/convert?style=flat-square&label=commits%2Fmonth&labelColor=18181b&color=00add8" alt="Commit activity"/></a>
<a href="https://github.com/faisukhan01/convert/commits"><img src="https://img.shields.io/github/last-commit/faisukhan01/convert?style=flat-square&label=last%20commit&labelColor=18181b&color=a855f7" alt="Last commit"/></a>

<br/>
<br/>

<table>
  <tr>
    <td width="50%">
      <img src="https://github-readme-stats.vercel.app/api/pin/?username=faisukhan01&repo=convert&theme=tokyonight&border_color=f59e0b&bg_color=0d1117&title_color=f59e0b&icon_color=00add8" alt="Repository pin card with live language bar"/>
    </td>
    <td width="50%">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=faisukhan01/convert&type=Date&theme=dark"/>
        <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=faisukhan01/convert&type=Date"/>
        <img src="https://api.star-history.com/svg?repos=faisukhan01/convert&type=Date" alt="Star history chart"/>
      </picture>
    </td>
  </tr>
</table>

</div>

<!-- ══════════════════════════ divider ══════════════════════════ -->
<img src="docs/assets/wave-top.svg" alt="" width="100%" height="72"/>

<br/>

## What is RidgeLine Convert?

**RidgeLine Convert** is an independent, multi-tenant **AI lead management & sales automation SaaS** for home-services businesses (roofing, exteriors, plumbing). It is a **full-stack Next.js 16 application** backed by **Neon PostgreSQL** — it runs without GoHighLevel, without a Go service, and without any external CRM.

Leads arrive from websites, WordPress/Elementor/Contact-Form-7 forms, Shopify stores, Laravel apps and partner webhooks through one secure ingestion API. Every lead is validated, deduplicated, AI-qualified (z.ai with OpenAI and deterministic fallbacks), stored in PostgreSQL, routed through native sales-pipeline playbooks and executed by a durable TypeScript worker — all tenant-isolated and audit-logged.

> GoHighLevel remains available as an **optional** connector. The product never depends on it.

| Layer | Technology | Responsibility |
|---|---|---|
| **App + API** | Next.js 16 · TypeScript · App Router | Operator dashboard, intake forms, public booking, REST APIs, ingestion endpoint |
| **Database** | PostgreSQL (Neon) · Prisma ORM | Multi-tenant data model, transactions, indexes, migration-ready schema |
| **AI** | z.ai (default) · OpenAI (optional) · deterministic fallback | Zod-validated lead qualification, reply drafting, usage journaling |
| **Background work** | TypeScript worker (`mini-services/worker`) | Durable job queue, retries with backoff, dead-lettering, health endpoint |
| **Auth** | Signed HMAC sessions (cookie + Bearer) · OIDC-ready | Role-based access: agency admin / owner / office / estimator |

### Highlights

| | |
|---|---|
| **Zero CRM dependency** | Contacts, leads, pipeline stages, tasks, appointments, estimates, payments and automations are native. GHL is a pluggable adapter, not a core. |
| **Secure multi-tenant ingestion** | `POST /api/v1/leads` with hashed org API keys (`x-api-key`), Zod validation, duplicate suppression, per-key rate limits and audit logging. |
| **AI with guardrails** | Customer text is treated as untrusted data (prompt-injection hardened); outputs must pass a strict Zod schema; the model can never execute actions or mutate records directly. |
| **Durable by default** | Background jobs live in PostgreSQL with atomic claims, exponential backoff, stale-claim recovery and dead-letter states. |
| **Hard-stop compliance** | Consent events, opt-outs and manual pauses win every race before any message dispatch. |
| **Observable** | `/api/health` reports database, queue and every integration's real state — `configured` vs `not_configured`, never simulated. |

<br/>

## Architecture

<details open>
<summary><strong>Data flow</strong></summary>

```text
Websites / WordPress / Elementor / CF7 / Shopify / Laravel / partners
        │
        ▼
POST /api/v1/leads ── x-api-key (sha256-hashed, org-scoped)
        │  verify key → rate limit → Zod validate → dedupe
        ▼
Neon PostgreSQL ── Contact · Inquiry · Activity · ConsentEvent · AuditEvent
        │
        ├─▶ BackgroundJob(LEAD_CLASSIFY) ──▶ TypeScript worker (:3004)
        │                                        │ retries · backoff · dead-letter
        │                                        ▼
        ├─▶ inline AI attempt (best effort) ──▶ z.ai / OpenAI / deterministic
        │                                        │ Zod-validated classification
        ▼                                        ▼
   AI fields on Inquiry (HOT/WARM/COLD/SPAM/NEEDS_REVIEW + score 0–100)
        │
        ▼
Native automation engine ──▶ OutboxMessage (playbooks: ack, callbacks, reminders, follow-ups)
        │                     stop rules: reply / opt-out / pause / decision win every race
        ▼
Next.js 16 dashboard ── Today · Inquiries · Calendar · Estimates · Reports · Settings
```
</details>

<br/>

## Repository Layout

```
convert/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── v1/leads/          # secure org-scoped lead ingestion (x-api-key)
│   │   │   ├── api-keys/          # staff-managed org API credentials (hashed)
│   │   │   ├── session/           # auth: sign-in, switch location, sign out
│   │   │   ├── inquiries/ estimates/ appointments/ tasks/ reports/ payments/
│   │   │   ├── public/            # homeowner intake + booking + manage links
│   │   │   ├── connections/       # provider OAuth installs (optional connectors)
│   │   │   └── health/            # liveness + DB + queue + integration states
│   │   └── page.tsx               # single-page app shell (hash routing)
│   ├── lib/
│   │   ├── ai.ts                  # provider abstraction + qualification + journal
│   │   ├── engine.ts              # native automation playbooks (outbox + stop rules)
│   │   ├── ratelimit.ts           # sliding-window limiter (per API key)
│   │   ├── session.ts crypto.ts   # signed sessions, token encryption at rest
│   │   └── db.ts bootstrap.ts     # Prisma client + demo bootstrap
│   ├── components/ hooks/ store/  # operator UI (shadcn/ui + zustand)
├── mini-services/
│   └── worker/                    # independent TS job processor (port 3004)
├── prisma/
│   ├── schema.prisma              # PostgreSQL (Neon-ready) multi-tenant schema
│   └── seed.ts                    # demo organizations, users, pipeline data
├── scripts/
│   ├── dev.ts                     # dev launcher: embedded Postgres + forced .env
│   ├── pg-server.ts               # local PostgreSQL lifecycle (embedded binaries)
│   ├── mint-api-key.ts            # CLI org key minting for integrations
│   └── use-db.ts                  # datasource provider switcher (postgres/sqlite)
└── docs/                          # migration inventory, configuration, guides
```

<br/>

## Quickstart

> Prereqs: **Bun** (or Node 20+). No Go. No GHL. No external Postgres needed for local dev — an embedded PostgreSQL starts automatically.

```bash
bun install
cp .env.example .env          # local defaults work out of the box
bun run db:push               # create schema in PostgreSQL
bun run db:seed               # demo orgs + users + pipeline data (idempotent)
bun run dev                   # Next.js on :3000 (starts embedded Postgres on :5432)
cd mini-services/worker && bun run dev   # background worker on :3004
```

Sign in at `http://localhost:3000` with a demo role — `owner@ridgeline.demo` / password `demo` (four seeded roles including agency admin).

### Production (Neon PostgreSQL)

1. Create a project at [neon.tech](https://neon.tech) and copy the **pooled** connection string.
2. Set environment variables in Vercel (or your host):

```env
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx.aws.neon.tech/neondb?sslmode=require"
SESSION_SECRET="<openssl rand -hex 32>"
TOKEN_ENCRYPTION_KEY="<openssl rand -hex 32>"
AI_PROVIDER="zai"              # or "openai" + OPENAI_API_KEY
APP_BASE_URL="https://your-domain"
```

3. Sync the schema once: `DATABASE_URL="<neon-url>" bun run db:push`
4. Deploy. The app boots with zero external credentials; every unmet integration shows as `not_configured` in `/api/health`.

<br/>

## Lead Ingestion API

Every external source (website forms, WordPress, Elementor, Contact Form 7, WPForms, Gravity Forms, Shopify, Laravel, partner systems) posts to one secure endpoint.

**1. Mint an org API key** (owner/office role, or CLI):

```bash
bun scripts/mint-api-key.ts --slug summit --name "Company website"
```

**2. Submit a lead** (from a server — never from browser JavaScript):

```bash
curl -X POST https://your-domain/api/v1/leads \
  -H "Content-Type: application/json" \
  -H "x-api-key: rl_live_xxxxxxxxxxxxxxxx" \
  -d '{
    "firstName": "Tom", "lastName": "Iker",
    "phone": "+15125550142", "email": "tom@example.com",
    "zip": "78745", "service": "repair",
    "source": "website",
    "message": "Roof is leaking after last night'\''s storm — need help today.",
    "smsConsent": true,
    "externalId": "wp-form-8841"
  }'
```

**3. Response** (`201`):

```json
{
  "ok": true, "duplicate": false,
  "lead": { "id": "…", "stage": "NEW", "source": "WEBSITE",
            "aiCategory": null, "aiScore": null, "aiStatus": "queued" }
}
```

`aiStatus` flips to `"classified"` once the AI layer lands (inline attempt or worker). Check any time:

```bash
curl "https://your-domain/api/v1/leads?id=<leadId>" -H "x-api-key: rl_live_…"
```

**Built-in protections:** SHA-256-hashed keys (raw shown once) · per-key sliding-window rate limits (`429` + `retryAfterSec`) · Zod validation with field-level issues · externalId idempotency (safe retries) · 30-minute duplicate suppression · consent capture · audit log per submission · strict tenant scoping (a key only ever sees its own organization).

<br/>

## AI Lead Qualification

Every inbound lead is classified into **HOT / WARM / COLD / SPAM / NEEDS_REVIEW** with a 0–100 intent score, confidence, urgency, reason, detected service, recommended next action, a draft reply and missing-information gaps.

- Providers: `zai` (default, always available), `openai` (`AI_PROVIDER=openai` + `OPENAI_API_KEY`), and a deterministic keyword scorer as the safety net — the pipeline never stalls because a model is down.
- All outputs pass a strict **Zod schema**; the model cannot mutate records or execute actions — it only classifies and suggests.
- Customer text is delimited and treated as **untrusted data** (prompt-injection hardened).
- Every call is journaled in `AIInteraction` (provider, model, latency, validated output) and staff can override any classification; overrides are kept alongside the machine result.

<details>
<summary><strong>Classification verdict schema</strong></summary>

```json
{
  "category": "HOT",
  "score": 95,
  "confidence": 0.92,
  "reason": "Active leak with same-day expectations.",
  "service": "Roof repair",
  "urgency": "HIGH",
  "recommendedNextAction": "Call immediately to schedule emergency repair.",
  "suggestedReply": "Hi Tom — sorry about the leak. Can someone be home this afternoon?",
  "missingInfo": ["Budget range", "Roof age"]
}
```
</details>

<br/>

## Multi-Tenancy & Security

- **Isolation:** every record is scoped to an organization (agency → locations); every API query re-checks membership server-side — estimators additionally see only their assigned work.
- **Roles:** `AGENCY_ADMIN · OWNER · OFFICE · ESTIMATOR` enforced on the server, not the UI.
- **Ingestion keys:** stored hashed, revocable, rate-limited, audited.
- **Sessions:** HMAC-signed cookie + Bearer token; provider OAuth tokens encrypted at rest (AES-256-GCM).
- **Automation safety:** consent events + opt-outs + manual pauses stop every outbound path; unique dedupe keys make overlapping triggers send exactly one message.
- **Audit:** staff actions and ingested leads land in an append-only audit trail.

<br/>

## Roadmap

- [x] Independent full-stack Next.js SaaS (no Go, no GHL core dependency)
- [x] PostgreSQL/Neon as the primary database (Prisma, migration-ready schema)
- [x] Secure org-scoped ingestion API with hashed keys, dedupe and rate limits
- [x] AI lead qualification (z.ai / OpenAI / deterministic) with journaling
- [x] Durable TypeScript worker: retries, backoff, dead-letter, health endpoint
- [x] Native contacts, pipeline stages, tasks, appointments, estimates, payments
- [x] Multi-tenant isolation + role-based access control
- [ ] Gmail connector activation (OAuth scope verification pending)
- [ ] Facebook Lead Ads connector activation (Meta app review pending)
- [ ] WhatsApp Business connector activation (phone-number verification pending)
- [ ] Google Calendar OAuth for appointment sync
- [ ] Inngest / Trigger.dev option for managed background processing

<br/>

## License

Released under the [MIT License](LICENSE).

<br/>

<div align="center">

<img src="docs/assets/wave-bottom.svg" alt="" width="100%" height="72"/>

<a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js 16"/></a>
<a href="https://neon.tech"><img src="https://img.shields.io/badge/Neon_PostgreSQL-4169E1?style=flat-square&labelColor=18181b" alt="Neon PostgreSQL"/></a>
<a href="https://z.ai"><img src="https://img.shields.io/badge/Brain-z.ai-A855F7?style=flat-square&labelColor=18181b" alt="z.ai brain"/></a>
<a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&labelColor=18181b" alt="TypeScript"/></a>

**RidgeLine Convert** — from lead to customer, on autopilot.

</div>
