# Configuration inventory

Every key the operator may need to supply later. None are needed for the local
demo. Secrets are supplied via environment variables / deploy secret manager —
never pasted into chat, source, URLs or logs.

| Key | Source (provider) | Required? | Unlocks | Where used |
|---|---|---|---|---|
| `DATABASE_URL` | Neon (owner supplies) | required for real persistence | PostgreSQL persistence (prod + tests) | `prisma/schema.prisma` via Prisma |
| `SESSION_SECRET` | bootstrap/owner generates locally | recommended in prod | signed staff session cookies | `src/lib/session.ts` |
| `TOKEN_ENCRYPTION_KEY` | bootstrap/owner generates locally | required in prod | AES-256-GCM encryption of provider OAuth tokens at rest | `src/lib/crypto.ts` |
| `APP_BASE_URL` | owner (deployed origin) | required in prod | customer-facing booking links + webhook targets | templates, engine |
| `GHL_CLIENT_ID` | GHL marketplace app | optional until live GHL | OAuth installation per location | connections route |
| `GHL_CLIENT_SECRET` | GHL marketplace app | optional until live GHL | token exchange + refresh | connections route |
| `GHL_REDIRECT_URI` | owner (must match GHL app) | optional until live GHL | OAuth callback binding | connections route |
| `GHL_WEBHOOK_SECRET` | GHL app settings | optional until live GHL | inbound webhook signature verification | `src/lib/webhooks.ts` |
| `OIDC_ISSUER_URL` | owner's identity provider | optional | staff sign-in via OIDC (local role path stays until set) | reserved: staff auth |
| `OIDC_CLIENT_ID` | identity provider | optional | staff sign-in via OIDC | reserved: staff auth |
| `OIDC_CLIENT_SECRET` | identity provider | optional | staff sign-in via OIDC | reserved: staff auth |
| `JOBBER_CLIENT_ID` | Jobber developer app | optional | payment connector OAuth | reserved: payments |
| `JOBBER_CLIENT_SECRET` | Jobber developer app | optional | payment connector OAuth | reserved: payments |
| `JOBBER_REDIRECT_URI` | owner | optional | payment connector callback | reserved: payments |

**Generated locally by the owner** (not from any provider): `SESSION_SECRET`,
`TOKEN_ENCRYPTION_KEY` — e.g.
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

**Validation:** `GET /api/health` (persistence), Settings → *Run connection
check* (provider), and the visible per-check states passed / failed / awaiting
configuration distinguish *configured* from *verified live*.

**Per-location values stored in the database** (not env): `ghlLocationId`,
provider links (`ProviderLink`), encrypted install tokens (`ProviderInstall`),
activation flag + timestamp, sync cursors — all tenant-scoped.
