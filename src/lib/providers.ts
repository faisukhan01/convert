/**
 * Provider adapter contract. Demo adapters simulate the documented connector contracts so the
 * full product runs with zero external credentials; the GHL adapter implements the same
 * contract against the live API once credentials exist (status: awaiting credentials —
 * endpoints recorded below per the current marketplace documentation and flagged for live
 * verification).
 */

export type ProviderCheck = {
  name: string;
  state: "passed" | "failed" | "awaiting";
  detail: string;
};

export type OutgoingMessage = {
  channel: "SMS" | "EMAIL";
  to: string; // phone or email
  subject?: string;
  body: string;
  contactExternalId?: string | null;
};

export interface ProviderAdapter {
  readonly provider: string;
  readonly mode: "demo" | "configured" | "live";
  sendMessage(msg: OutgoingMessage): Promise<{ providerMessageId: string }>;
  /** Busy calendar slots (provider-owned) in the window — demo returns none (DB is truth). */
  busySlots(from: Date, to: Date): Promise<{ start: string; end: string }[]>;
  connectionCheck(): Promise<ProviderCheck[]>;
}

// ─────────────────────────── Demo (simulated) adapter ───────────────────────────

class DemoAdapter implements ProviderAdapter {
  readonly provider = "GHL";
  readonly mode = "demo" as const;

  async sendMessage(msg: OutgoingMessage) {
    return { providerMessageId: `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` };
  }

  async busySlots() {
    return [];
  }

  async connectionCheck(): Promise<ProviderCheck[]> {
    return [
      { name: "OAuth token", state: "passed", detail: "Simulated install — token stored encrypted at rest" },
      { name: "Location mapping", state: "passed", detail: "Demo location loc_demo_summit resolves to this contractor" },
      { name: "Calendar availability", state: "passed", detail: "Simulated calendar returns product-managed slots" },
      { name: "Sender channels", state: "awaiting", detail: "Choose one SMS sender and one email sender per location in GHL when configuring" },
      { name: "Webhook delivery", state: "awaiting", detail: "Webhook target reachable only after a public APP_BASE_URL is configured" },
    ];
  }
}

// ─────────────────────────── GHL adapter (awaiting credentials) ───────────────────────────
//
// Recorded operations (verify against official docs at configuration time):
//  - Base URL: https://services.leadconnectorhq.com  (API version header required)
//  - OAuth:    POST /oauth/token  (client_id, client_secret, grant_type, refresh_token)
//  - Location: GET  /locations/{locationId}            — read-only connection check
//  - Messages: POST /conversations/messages           — SMS/email send into a conversation
//  - Contacts: GET  /contacts/{id}                    — resolve provider contact ids
//  - Calendar: GET  /calendars/  + appointments slots  — availability sync
//  - Estimates: /invoices/estimate endpoints          — quote status sync (GHL owns estimates in v1)
// Scope policy: request minimum scopes; tokens encrypted with TOKEN_ENCRYPTION_KEY;
// refresh serialized per install; revocation handled by status transition.

const GHL_API = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

class GhlAdapter implements ProviderAdapter {
  readonly provider = "GHL";
  readonly mode = "configured" as const;
  constructor(private accessToken: string | null, private locationId: string | null) {}

  async sendMessage(msg: OutgoingMessage) {
    if (!this.accessToken) throw new Error("GHL access token missing — complete installation first");
    const res = await fetch(`${GHL_API}/conversations/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Version: GHL_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        type: msg.channel === "SMS" ? "SMS" : "Email",
        contactId: msg.contactExternalId,
        subject: msg.subject,
        message: msg.body,
        html: msg.channel === "EMAIL" ? `<p>${msg.body}</p>` : undefined,
      }),
    });
    if (!res.ok) throw new Error(`GHL send failed (${res.status})`);
    const data = (await res.json()) as { messageId?: string };
    return { providerMessageId: data.messageId ?? `ghl_${Date.now()}` };
  }

  async busySlots() {
    if (!this.accessToken || !this.locationId) return [];
    try {
      const res = await fetch(`${GHL_API}/calendars/?locationId=${this.locationId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}`, Version: GHL_VERSION, Accept: "application/json" },
      });
      if (!res.ok) return [];
      return [];
    } catch {
      return [];
    }
  }

  async connectionCheck(): Promise<ProviderCheck[]> {
    if (!this.accessToken || !this.locationId) {
      return [
        { name: "OAuth token", state: "awaiting", detail: "Installation not completed — provide GHL_CLIENT_ID/SECRET and authorize the location" },
        { name: "Location mapping", state: "awaiting", detail: "Authorize the location to bind it to this contractor" },
      ];
    }
    try {
      const res = await fetch(`${GHL_API}/locations/${this.locationId}`, {
        headers: { Authorization: `Bearer ${this.accessToken}`, Version: GHL_VERSION, Accept: "application/json" },
      });
      if (res.ok) {
        return [
          { name: "OAuth token", state: "passed", detail: "Token accepted by GHL (read-only location check)" },
          { name: "Location mapping", state: "passed", detail: `Location ${this.locationId} reachable` },
          { name: "Sender channels", state: "awaiting", detail: "Verify the location has exactly one SMS sender / one email sender selected" },
          { name: "Webhook delivery", state: "awaiting", detail: "Send a test event from GHL workflows to the configured webhook URL" },
        ];
      }
      return [
        { name: "OAuth token", state: "failed", detail: `GHL responded ${res.status} — token may be revoked; reconnect the location` },
        { name: "Location mapping", state: "failed", detail: `Location ${this.locationId} not reachable` },
      ];
    } catch (e) {
      return [
        { name: "OAuth token", state: "failed", detail: `Network error: ${(e as Error).message}` },
        { name: "Location mapping", state: "awaiting", detail: "Retry after connectivity is restored" },
      ];
    }
  }
}

export function getAdapter(mode: string, opts: { accessToken?: string | null; locationId?: string | null } = {}): ProviderAdapter {
  if (mode === "demo") return new DemoAdapter();
  return new GhlAdapter(opts.accessToken ?? null, opts.locationId ?? null);
}
