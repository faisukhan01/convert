"use client";

import { useEffect, useState } from "react";
import { useApi, api } from "@/hooks/use-api";
import { useAppStore, roleAt } from "@/store/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SkeletonRows, EmptyState } from "@/components/app/ui-bits";
import { PLAYBOOKS, BILLING_STATUSES } from "@/lib/constants";
import { Save, PlugZap, Unplug, ShieldCheck, ShieldAlert } from "lucide-react";

type SettingsData = {
  contractor: {
    id: string; name: string; slug: string; timezone: string; addressLine1?: string | null; city?: string | null; state?: string | null;
    serviceZips: string; billingStatus: string; runMode: string; activatedAt: string | null;
    calendarStartHour: number; calendarEndHour: number; slotMinutes: number; bookingLeadHours: number; bookingWindowDays: number;
    estimateFollowUpDays: string; callbackDueHours: number; reminderHoursBefore: number;
    pbNewInquiry: boolean; pbMissedCall: boolean; pbReminder: boolean; pbNoShow: boolean; pbEstimateFollowUp: boolean; pbMorningDigest: boolean;
    workingHours: string;
  };
  team: { userId: string; name: string; email: string; role: string }[];
  ghlInstall: { status: string; locationId?: string | null; scopes?: string | null; lastCheckedAt?: string | null } | null;
  myRole: string;
};

type ConnectionsData = {
  runMode: string; activatedAt: string | null;
  installs: { provider: string; status: string; locationId?: string | null; scopes?: string | null; lastCheckedAt?: string | null }[];
  checks: { name: string; state: string; detail: string }[];
  prerequisites: { key: string; label: string; met: boolean }[];
  allPrerequisitesMet: boolean;
};

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function SettingsView() {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const role = roleAt(session, contractorId);
  const { data, loading, refresh } = useApi<SettingsData>(contractorId ? `/api/contractors/${contractorId}` : null);
  const connQ = useApi<ConnectionsData>(contractorId ? `/api/connections?contractorId=${contractorId}` : null);
  const [form, setForm] = useState<SettingsData["contractor"] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.contractor && !form) setForm(data.contractor);
  }, [data, form]);

  if (role === "ESTIMATOR") {
    return <EmptyState title="Settings are for office, owner and agency roles" hint="Estimators see their phone agenda under Calendar." />;
  }
  if (loading || !data || !form) return <div className="mt-6"><SkeletonRows rows={6} /></div>;

  const save = async (patch: Partial<SettingsData["contractor"]>, msg = "Settings saved") => {
    setBusy(true);
    try {
      await api.patch(`/api/contractors/${contractorId}`, patch);
      toast(msg);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const working = (() => {
    try { return JSON.parse(form.workingHours) as Record<string, [string, string] | null>; } catch { return {}; }
  })();

  const conn = connQ.data;
  const isDemo = data.contractor.runMode === "demo";

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Business profile, hours, playbooks, connection status, team and billing. Only settings your role can operate are revealed.</p>
      </header>

      {/* Business */}
      <SectionCard title="Business profile" action={
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void save({ name: form.name, timezone: form.timezone, addressLine1: form.addressLine1, city: form.city, state: form.state, serviceZips: form.serviceZips })}>
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      }>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="st-name">Business name</Label><Input id="st-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1">
            <Label htmlFor="st-tz">Timezone (IANA)</Label>
            <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
              <SelectTrigger id="st-tz"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["America/Chicago", "America/New_York", "America/Denver", "America/Phoenix", "America/Los_Angeles"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label htmlFor="st-addr">Street address</Label><Input id="st-addr" value={form.addressLine1 ?? ""} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="st-city">City / State</Label>
            <div className="flex gap-2">
              <Input id="st-city" value={form.city ?? ""} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <Input value={form.state ?? ""} className="w-16" aria-label="State" onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label htmlFor="st-zips">Service ZIP codes (comma-separated)</Label><Input id="st-zips" value={form.serviceZips} onChange={(e) => setForm({ ...form, serviceZips: e.target.value })} /></div>
        </div>
      </SectionCard>

      {/* Hours & calendar */}
      <SectionCard title="Hours & booking calendar" subtitle="contact windows govern automated sends; the calendar governs bookable visits" action={
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void save({ workingHours: form.workingHours, calendarStartHour: form.calendarStartHour, calendarEndHour: form.calendarEndHour, slotMinutes: form.slotMinutes, bookingLeadHours: form.bookingLeadHours, bookingWindowDays: form.bookingWindowDays, reminderHoursBefore: form.reminderHoursBefore, callbackDueHours: form.callbackDueHours })}>
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      }>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DAYS.map((d) => (
            <div key={d} className="flex items-center gap-2 rounded-lg border px-2.5 py-2">
              <span className="w-8 text-xs font-semibold uppercase">{d}</span>
              {working[d] ? (
                <>
                  <Input className="h-7 w-16 text-xs" defaultValue={working[d]![0]} aria-label={`${d} start`}
                    onChange={(e) => { working[d] = [e.target.value, working[d]![1]]; setForm({ ...form, workingHours: JSON.stringify(working) }); }} />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input className="h-7 w-16 text-xs" defaultValue={working[d]![1]} aria-label={`${d} end`}
                    onChange={(e) => { working[d] = [working[d]![0], e.target.value]; setForm({ ...form, workingHours: JSON.stringify(working) }); }} />
                  <button className="ml-auto text-muted-foreground" aria-label={`Close ${d}`} onClick={() => { const w = { ...working }; w[d] = null; setForm({ ...form, workingHours: JSON.stringify(w) }); }}>✕</button>
                </>
              ) : (
                <button className="ml-auto text-xs text-primary underline-offset-2 hover:underline" onClick={() => { const w = { ...working }; w[d] = ["08:00", "17:00"]; setForm({ ...form, workingHours: JSON.stringify(w) }); }}>Set hours</button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {([
            ["calendarStartHour", "Calendar starts", 6, 12],
            ["calendarEndHour", "Calendar ends", 14, 20],
            ["slotMinutes", "Slot length (min)", 15, 120],
            ["bookingLeadHours", "Min booking notice (h)", 0, 72],
            ["bookingWindowDays", "Booking window (days)", 7, 60],
          ] as const).map(([key, label, min, max]) => (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{label}</Label>
              <Input type="number" min={min} max={max} className="h-9" value={String(form[key])}
                onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value, 10) || min })} />
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs">Estimate follow-up ladder (days)</Label>
            <Input className="h-9" value={form.estimateFollowUpDays} onChange={(e) => setForm({ ...form, estimateFollowUpDays: e.target.value })} placeholder="1,3,7" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Callback due (hours)</Label>
            <Input type="number" min={1} max={24} className="h-9" value={String(form.callbackDueHours)} onChange={(e) => setForm({ ...form, callbackDueHours: parseInt(e.target.value, 10) || 2 })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reminder lead (hours before visit)</Label>
            <Input type="number" min={1} max={72} className="h-9" value={String(form.reminderHoursBefore)} onChange={(e) => setForm({ ...form, reminderHoursBefore: parseInt(e.target.value, 10) || 24 })} />
          </div>
        </div>
      </SectionCard>

      {/* Playbooks */}
      <SectionCard title="Playbooks" subtitle="entry, audience, sender, timing, stop rules — see docs for the full playbook recipes" action={
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void save({ pbNewInquiry: form.pbNewInquiry, pbMissedCall: form.pbMissedCall, pbReminder: form.pbReminder, pbNoShow: form.pbNoShow, pbEstimateFollowUp: form.pbEstimateFollowUp, pbMorningDigest: form.pbMorningDigest }, "Playbooks saved")}>
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
      }>
        <div className="space-y-3">
          {PLAYBOOKS.map((p) => (
            <div key={p.key} className="flex items-start justify-between gap-4 rounded-lg border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground">{p.desc}</div>
              </div>
              <Switch
                checked={Boolean(form[p.key as keyof SettingsData["contractor"]])}
                onCheckedChange={(v) => setForm({ ...form, [p.key]: v })}
                aria-label={p.label}
              />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Connection status */}
      <SectionCard title="Connection status" subtitle="the distinction between local demo, configured, and verified-live is always visible here">
        {!conn ? <SkeletonRows rows={2} /> : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border bg-muted px-3 py-1 text-xs font-semibold uppercase">{conn.runMode}</span>
              {conn.activatedAt && <span className="rounded-full bg-emerald-100 border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900">activated</span>}
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busy}
                onClick={async () => { await api.post("/api/connections", { action: "check", contractorId }); toast("Connection check complete"); connQ.refresh(); }}>
                <PlugZap className="h-3.5 w-3.5" /> Run connection check
              </Button>
              {isDemo && !conn.installs.some((i) => i.status === "CONNECTED") && (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={busy}
                  onClick={async () => { await api.post("/api/connections", { action: "simulate-install", contractorId }); toast("Simulated GHL install connected"); connQ.refresh(); }}>
                  <PlugZap className="h-3.5 w-3.5" /> Simulate GHL install
                </Button>
              )}
              {isDemo && conn.installs.some((i) => i.status === "CONNECTED") && (
                <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy}
                  onClick={async () => { await api.post("/api/connections", { action: "disconnect", contractorId }); toast("Disconnected — new connector work stopped; deactivate native GHL workflows (docs)"); connQ.refresh(); }}>
                  <Unplug className="h-3.5 w-3.5" /> Disconnect
                </Button>
              )}
            </div>
            <ol className="grid gap-1.5 sm:grid-cols-2">
              {conn.prerequisites.map((p) => (
                <li key={p.key} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  {p.met ? <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                  <span>{p.label}</span>
                  <span className={`ml-auto text-[10px] font-bold uppercase ${p.met ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{p.met ? "met" : "awaiting"}</span>
                </li>
              ))}
            </ol>
            {conn.checks.length > 0 && (
              <div className="rounded-lg border divide-y">
                {conn.checks.map((c) => (
                  <div key={c.name} className="flex items-start gap-2 px-3 py-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${c.state === "passed" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : c.state === "failed" ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}>{c.state}</span>
                    <div><span className="font-semibold">{c.name}</span> — {c.detail}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Live activation is blocked until every prerequisite passes. When you provide Neon + GHL credentials later, this screen walks the same checklist against the real provider.
            </p>
          </div>
        )}
      </SectionCard>

      {/* Team */}
      <SectionCard title="Team" subtitle="per-location roles — estimators see only their assigned work">
        {data.team.map((m) => (
          <div key={m.userId} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">{m.email}</div>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">{m.role}</span>
          </div>
        ))}
        <p className="mt-2 text-[11px] text-muted-foreground">Role invitations via email land here when OIDC is configured (awaiting credentials).</p>
      </SectionCard>

      {/* Billing */}
      <SectionCard title="Subscription & billing" subtitle="one subscription billing owner per contractor; homeowner payments use a separate ledger">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={form.billingStatus} onValueChange={(v) => void save({ billingStatus: v }, "Billing status updated")}>
            <SelectTrigger className="w-[160px]" aria-label="Billing status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BILLING_STATUSES.map((b) => <SelectItem key={b} value={b}>{b.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            trial / active → full access · past_due → reminders only · canceled → read-only until restored. In production this maps to GHL SaaS Mode (awaiting credentials).
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
