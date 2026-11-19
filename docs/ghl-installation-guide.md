# GoHighLevel Installation & Snapshot Guide

This guide takes one contractor location from "no connection" to "activated".
Status meanings (also shown on **Settings → Connection status**):

| State | Meaning |
|---|---|
| **Local demo** | Simulated connector contracts; works with zero keys; identity + reset controls visible |
| **Configured** | Real credentials installed; checks not all passed yet |
| **Live (verified)** | Connection check passed + explicit per-location activation |

---

## 1. Prerequisites (agency-side, in GHL)

1. A GHL **Agency** account with sub-accounts (locations) for each contractor.
2. A **Marketplace app** (marketplace.gohighlevel.com) with:
   - Redirect URI exactly matching `GHL_REDIRECT_URI` (e.g. `https://your-domain/api/connections/ghl/callback`)
   - Minimum scopes requested (see §4)
   - Webhook target `https://your-domain/api/webhooks/ghl`
3. SaaS Mode enabled on your plan if you want productized billing (§7).

Record `GHL_CLIENT_ID` / `GHL_CLIENT_SECRET` / `GHL_WEBHOOK_SECRET` in your
secret manager — never in chat, source, or URLs.

## 2. Bind a location to RidgeLine

1. Sign in to RidgeLine as **agency admin** (`agency@ridgeline.demo` locally).
2. Agency → *New contractor* (or open an existing one) → **Open & manage**.
3. Settings → Connection status → **Authorize with GHL**. The OAuth state is
   bound to your admin session and the intended installation; after consent the
   location is stored (`ghlLocationId`) and tokens are encrypted with
   `TOKEN_ENCRYPTION_KEY`. Rotating refreshes are serialized per install; a
   revoked token flips the install to `REVOKED` with a visible reconnect path.
4. **Run connection check** — read-only first (location lookup). The checklist
   shows each item as *passed / failed / awaiting configuration*.

## 3. Sending ownership (one sender per channel per location)

GHL owns outbound SMS/email. In each location, choose **exactly one**:

- **SMS sender**: the LC Phone number / verified sender RidgeLine booking links
  and reminders come from. If the location has an existing number used by other
  workflows, pick a dedicated number to avoid double-texting.
- **Email sender**: one dedicated mailbox/domain for estimate follow-ups.

Check the box in RidgeLine only after both are picked (the prerequisite flips to
*met* on the next connection check). This prevents an overlapping calendar
notification, workflow trigger, and app retry from producing duplicate reminders
— RidgeLine additionally dedupes every message with a unique key.

## 4. Minimum scopes requested

Recorded at build time from the marketplace docs; verify at configuration time:

| Scope | Used for |
|---|---|
| `contacts.readonly` | resolve provider contact ids for conversations |
| `conversations.write` | send SMS/email (booking links, reminders, nudges) |
| `calendars.readonly` | availability sync (slot conflicts) |
| `estimates.write` | quote status sync (GHL owns estimates in v1) |

## 5. Website capture (WordPress)

**Gutenberg (Custom HTML block) or Elementor (HTML widget):**

```html
<!-- Hosted booking fallback: -->
<a href="https://your-domain/#/public/intake?slug=contractor-slug"
   class="ridgeline-cta">Get my free roof estimate</a>
```

For a native-looking form, embed the same page in an iframe (mobile-first,
loads under 1s locally). All secrets stay server-side; the embed contains no
keys. A tagged landing page (`?utm=spring-promo`) is recorded as a **Landing
page** first-known source; unattributed traffic stays **Unknown** — later
touchpoints (verified tracking number, staff-entered referral) are recorded
separately without overwriting the first source.

## 6. Playbook settings (per location, Settings → Playbooks)

| Playbook | Entry | Audience | Sender | Timing | Stops when |
|---|---|---|---|---|---|
| New inquiry booking link | website/landing inquiry | contacts with recorded SMS consent | SMS sender | ASAP, delivered inside the contact window | booking exists, opt-out, pause, no permission (→ office task) |
| Missed call callback | missed-call inquiry | office staff | n/a (task) | due in `callbackDueHours` | task done; repeat calls consolidate into the same task; auto-reply only with consent |
| Inspection reminder | booking confirmed | booked contact | SMS sender | `reminderHoursBefore` (default 24h) before visit | reschedule (re-scheduled for new time), cancel, completion, opt-out |
| No-show recovery | visit marked no-show | contact with consent | SMS sender | +30 min | rebook, opt-out, pause |
| Estimate chase | estimate sent | contact with consent | SMS sender | +1d, +3d, +7d (editable) | reply, acceptance, decline, invoice, pause, opt-out — rechecked immediately before each send |
| Morning digest | daily 08:00 local | office email | email sender | daily | never (operational) |

Consent: recorded with basis (web form / verified number / office entered),
wording version and timestamp. No reliable consent signal → no automated SMS —
the office-task path is used instead.

## 7. Billing (GHL SaaS Mode / snapshot)

- One **subscription billing owner per contractor** (the agency plan's SaaS
  configuration). Homeowner payments use a separate ledger in RidgeLine.
- Map subscription states to access: `trial`/`active` → full;
  `past_due` → reminders only; `canceled` → read-only until restored.
- Provisioning is idempotent (agency → contractor slug is unique).

## 8. Snapshot recipe (click-by-click)

Build this once in a scratch agency sub-account, then snapshot it for every new
contractor:

1. **Sub-account → Settings → Business Info** — name, address, timezone (must
   match RidgeLine's location timezone).
2. **Channels → Numbers** — dedicate one SMS number; note it as the sender.
3. **Emails (Settings → SMTP / dedicated sending)** — dedicate one sender.
4. **Calendars → Calendars → Create** — "Roof Inspection", 60 min, availability
   08:00–17:00 Mon–Fri, appointment distribution: round-robin estimators.
5. **Automations (Workflows)** — create ONE folder "RidgeLine-managed":
   - *New Estimate → Notify* (trigger: estimate status changed → sent) →
     Webhook action → `https://your-domain/api/webhooks/ghl` with the location
     id in payload. **Stop condition**: none (RidgeLine guards ordering).
   - Do **not** create competing reminder/chase workflows — the playbook above
     owns them. If you add native ones later, deactivate the RidgeLine playbook
     switch first (documented pause procedure: Settings → Playbooks toggle, then
     pause the workflow; the audit trail records who/when).
6. **Sites → Forms** — estimate request form: first/last name, phone, email,
   service address, ZIP, service type, SMS-consent checkbox (wording v1:
   source, time and version recorded by RidgeLine).
7. **Snapshot** → *Create snapshot* including: calendars, workflows folder,
   form, custom fields, pipelines (one pipeline "Estimates" with stages
   matching RidgeLine's inquiry stages).
8. Install the snapshot to each new location, then in RidgeLine run **Authorize
   → Connection check → Activate** for that location.

## 9. Verification checklist (per location)

| Check | How it's verified |
|---|---|
| OAuth token | read-only location lookup succeeds |
| Location mapping | `ghlLocationId` resolves to the contractor; unknown-location webhooks fail loudly |
| Calendar | slot conflict visible after a provider-side booking |
| Sender channels | one SMS + one email sender picked |
| Webhook | send a test event; it appears in Outbox & demo → provider events with `signature verified` |
| Estimate sync | mark an estimate viewed in GHL → RidgeLine shows `VIEWED (provider sync)` |

## 10. Disconnect / uninstall

Settings → Connection status → **Disconnect**: stops new connector work
immediately, cancels nothing already delivered, and this guide's §6 table tells
you exactly which native GHL workflows to deactivate. Tokens are wiped from the
install row; the audit trail records who disconnected.
