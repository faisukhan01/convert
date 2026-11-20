"use client";

import { useState } from "react";
import { useApi, api } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/app/ui-bits";
import { SectionCard, EmptyState, SkeletonRows } from "@/components/app/ui-bits";
import { fmtDateTimeTz, fmtDate } from "@/lib/time";
import type { OutboxRow, ProviderEventRow } from "@/lib/client-types";
import { FastForward, PlayCircle, RotateCcw, RefreshCcw, GitBranch, Repeat2, ShieldOff, Clock, WifiOff, HelpCircle } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  SENT: "text-emerald-700 dark:text-emerald-300",
  SCHEDULED: "text-sky-700 dark:text-sky-300",
  CANCELED: "text-stone-500",
  FAILED: "text-red-700 dark:text-red-300",
};

const EVENT_STYLES: Record<string, string> = {
  PROCESSED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  FAILED: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  SKIPPED_DUPLICATE: "bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300",
  SKIPPED_OUT_OF_ORDER: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
};

export function OutboxView() {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const { data, loading, refresh } = useApi<{ messages: OutboxRow[]; counts: { scheduled: number; sent: number; canceled: number; failed: number }; now: string }>(
    contractorId ? `/api/outbox?contractorId=${contractorId}` : null
  );
  const demoQ = useApi<{ runMode: string; clockOffsetMs: number; demoNow: string }>(contractorId ? `/api/demo?contractorId=${contractorId}` : null);
  const eventsQ = useApi<{ events: ProviderEventRow[] }>(contractorId ? `/api/provider-events?contractorId=${contractorId}` : null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const tz = session?.contractors?.find((c) => c.id === contractorId)?.timezone ?? "America/Chicago";
  const offsetHours = Math.round((demoQ.data?.clockOffsetMs ?? 0) / 3600000);
  const offsetLabel = offsetHours === 0 ? "no shift" : offsetHours % 24 === 0 ? `+${offsetHours / 24}d` : `+${offsetHours}h`;

  const run = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      await api.post("/api/demo", { contractorId, ...body });
      toast(msg);
      refresh();
      eventsQ.refresh();
      demoQ.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const simulateEvent = (variant: string) =>
    run({ action: "simulate-provider-event", variant }, `Provider event "${variant}" delivered to the webhook receiver`);

  const messages = data?.messages ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold tracking-tight">Outbox &amp; demo controls</h1>
        <p className="text-sm text-muted-foreground">
          Every scheduled message is visible with its stop rules. Demo identity and reset controls exist only in demo mode.
        </p>
      </header>

      {/* Demo clock + engine */}
      <SectionCard title="Demo clock & engine" subtitle="advance multi-day follow-up in seconds; every dispatch rechecks eligibility immediately before sending">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-xs font-semibold">
            <Clock className="h-3.5 w-3.5" /> demo time: {demoQ.data ? fmtDateTimeTz(new Date(demoQ.data.demoNow), tz) : "…"} <span className="text-muted-foreground">({offsetLabel})</span>
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "advance-clock", hours: 1 }, "Clock +1h")}>+1h</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "advance-clock", hours: 24 }, "Clock +1d — follow-ups mature")}>+1d</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run({ action: "advance-clock", days: 7 }, "Clock +7d")}>+7d</Button>
          <Button size="sm" variant="ghost" disabled={busy} className="gap-1" onClick={() => void run({ action: "reset-clock" }, "Clock reset")}><RotateCcw className="h-3.5 w-3.5" /> Reset clock</Button>
          <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void run({ action: "run-engine" }, "Engine tick complete")}><PlayCircle className="h-4 w-4" /> Run engine now</Button>
          <Button size="sm" variant="ghost" disabled={busy} className="gap-1" onClick={() => { refresh(); eventsQ.refresh(); }}><RefreshCcw className="h-3.5 w-3.5" /> Refresh</Button>
          <div className="ml-auto">
            <ConfirmDialog
              trigger={<Button size="sm" variant="destructive" className="gap-1"><FastForward className="h-3.5 w-3.5" /> Reset demo data</Button>}
              title="Reset all demo data?" description="Wipes every change and reinstalls the deterministic fixtures (reporting numbers return to contract values)."
              confirmLabel="Reset demo" destructive
              onConfirm={async () => { await run({ action: "reset-demo" }, "Demo data reset to deterministic fixtures"); }}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{data?.counts.scheduled ?? 0} scheduled</span>·<span>{data?.counts.sent ?? 0} sent</span>·
          <span>{data?.counts.canceled ?? 0} stopped</span>·<span>{data?.counts.failed ?? 0} failed</span>
          <span className="hidden sm:inline">— engine ticks automatically every 15s</span>
        </div>
      </SectionCard>

      {/* Outbox */}
      <SectionCard title="Simulated provider outbox" count={messages.length}>
        {loading ? <SkeletonRows rows={6} /> : messages.length === 0 ? (
          <EmptyState title="No messages yet" hint="Create an inquiry or book an inspection and the playbooks schedule messages here." />
        ) : (
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto scroll-area">
            {messages.map((m) => (
              <div key={m.id} className="rounded-lg border px-3 py-2">
                <button className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{m.templateKey.replace(/_/g, " ")}</span>
                  <span className={`text-[10px] font-bold uppercase ${STATUS_STYLES[m.status] ?? ""}`}>{m.status}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.channel} → {m.contact ? `${m.contact.firstName} ${m.contact.lastName}` : "office digest"}
                  </span>
                  <span suppressHydrationWarning className="ml-auto text-[11px] text-muted-foreground">
                    {m.sentAt ? `sent ${fmtDateTimeTz(new Date(m.sentAt), tz)}` : `for ${fmtDateTimeTz(new Date(m.scheduledFor), tz)}`}
                  </span>
                </button>
                {m.stoppedReason && <div className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">Stop rule: {m.stoppedReason}</div>}
                {expanded === m.id && (
                  <div className="mt-2 rounded bg-muted/60 p-2.5 text-xs whitespace-pre-wrap">{m.body}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Connector recovery */}
      <SectionCard title="Connector recovery drills" subtitle="duplicate webhook · out-of-order status · rate limit · revocation · unknown location · ambiguous timeout">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => void simulateEvent("duplicate")}><Repeat2 className="h-3.5 w-3.5" /> Duplicate webhook</Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => void simulateEvent("out-of-order")}><GitBranch className="h-3.5 w-3.5" /> Out-of-order status</Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => void simulateEvent("rate-limit")}><Clock className="h-3.5 w-3.5" /> Rate limit burst</Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => void simulateEvent("revocation")}><ShieldOff className="h-3.5 w-3.5" /> Revoke install</Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => void simulateEvent("unknown-location")}><HelpCircle className="h-3.5 w-3.5" /> Unknown location</Button>
          <Button size="sm" variant="outline" className="gap-1" disabled={busy} onClick={() => void simulateEvent("timeout")}><WifiOff className="h-3.5 w-3.5" /> Ambiguous timeout</Button>
        </div>

        <div className="mt-4 max-h-80 overflow-y-auto scroll-area rounded-lg border">
          {eventsQ.loading ? <div className="p-3"><SkeletonRows rows={4} /></div> : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2.5 py-2 text-left font-semibold">event</th>
                  <th className="px-2.5 py-2 text-left font-semibold">state</th>
                  <th className="px-2.5 py-2 text-left font-semibold">detail</th>
                  <th className="px-2.5 py-2 text-left font-semibold">received</th>
                  <th className="px-2.5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {(eventsQ.data?.events ?? []).map((ev) => (
                  <tr key={ev.id} className="border-t">
                    <td className="px-2.5 py-1.5 font-medium">{ev.eventType}<span className="block text-[10px] text-muted-foreground">{ev.externalId}</span></td>
                    <td className="px-2.5 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${EVENT_STYLES[ev.status] ?? "bg-muted"}`}>{ev.status.replace(/_/g, " ")}</span></td>
                    <td className="px-2.5 py-1.5 max-w-[280px] truncate text-muted-foreground" title={ev.processError ?? ""}>{ev.processError ?? (ev.signatureValid ? "signature verified" : "signature invalid")}</td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap" suppressHydrationWarning>{fmtDate(ev.receivedAt, tz)}</td>
                    <td className="px-2.5 py-1.5">
                      {(ev.status === "FAILED" || ev.status === "PENDING") && (
                        <Button size="sm" variant="outline" className="h-6 text-[11px]" disabled={busy}
                          onClick={() => void run({ action: "replay-event", eventId: ev.id }, "Event replayed")}>
                          Replay
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Duplicate external ids are skipped; a late “sent” never re-opens an accepted estimate; rate-limited and ambiguous events park in PENDING with a safe replay; unknown locations fail loudly with the operator recovery path.
        </p>
      </SectionCard>
    </div>
  );
}
