"use client";

import { useEffect, useMemo, useState } from "react";
import { api, useApi } from "@/hooks/use-api";
import { navigate } from "@/store/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkeletonRows, ApptStatusBadge, EstimateStatusBadge } from "@/components/app/ui-bits";
import { fmtDateTimeTz, fmtDateLong, tzAbbr } from "@/lib/time";
import { fmtMoney } from "@/lib/money";
import { SERVICE_TYPE_LABELS } from "@/lib/constants";
import type { Slot } from "@/lib/client-types";
import { ArrowLeft, CalendarCheck2, MapPin, PartyPopper } from "lucide-react";

/* ─────────────────────────── Public shell ─────────────────────────── */

function PublicShell({ business, children, onBack }: { business?: string; children: React.ReactNode; onBack?: () => void }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b bg-sidebar sticky top-0 z-30">
        <div className="mx-auto max-w-md px-4 h-14 flex items-center gap-3">
          {onBack && <Button variant="ghost" size="icon" aria-label="Back" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>}
          <span className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--primary)" /><path d="M6 20 16 9l10 11" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="text-sm font-bold">{business ?? "RidgeLine"}</span>
          </span>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-md px-4 py-6">{children}</main>
      <footer className="mt-auto border-t bg-sidebar">
        <div className="mx-auto max-w-md px-4 py-3 text-center text-[11px] text-muted-foreground">
          Powered by RidgeLine · reply STOP to any text to opt out · your consent records include source, time and wording version
        </div>
      </footer>
    </div>
  );
}

/* ─────────────────────────── Intake ─────────────────────────── */

export function PublicIntakeView({ slug }: { slug?: string }) {
  const { data } = useApi<{ contractor: { name: string; slug: string; city?: string | null; state?: string | null } }>(`/api/public/intake?slug=${slug ?? "summit"}`);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", addressLine1: "", city: "", zip: "", serviceType: "REPLACEMENT", contactPreference: "sms", smsConsent: false });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ token: string; existing: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<{ publicToken: string; existing: boolean }>("/api/public/intake", {
        ...form, contractorSlug: slug ?? "summit",
        source: new URLSearchParams(window.location.search).get("utm") === "spring-promo" ? "LANDING_PAGE" : "WEBSITE",
      });
      setDone({ token: res.publicToken, existing: res.existing });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <PublicShell business={data?.contractor.name} onBack={() => setDone(null)}>
        <div className="rounded-xl border bg-card p-6 text-center space-y-3">
          <PartyPopper className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-lg font-bold">You&apos;re on the schedule path, {form.firstName}!</h1>
          <p className="text-sm text-muted-foreground">
            {done.existing
              ? "We found your open request — no duplicate created. Pick your inspection time below."
              : data?.contractor.name + " will text you a booking link during business hours. You can also book right now:"}
          </p>
          <Button className="w-full gap-2 min-h-[44px]" onClick={() => (window.location.hash = `#/public/book/${done.token}`)}>
            <CalendarCheck2 className="h-4 w-4" /> Choose an inspection time
          </Button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell business={data?.contractor.name}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-xl border bg-card p-5">
          <h1 className="text-lg font-bold">Request your free roof estimate</h1>
          <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
            {data?.contractor.name}{data?.contractor.city ? ` · ${data.contractor.city}, ${data.contractor.state}` : ""} — takes about a minute. Texts come only during business hours.
          </p>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="pi-first">First name *</Label><Input id="pi-first" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="pi-last">Last name</Label><Input id="pi-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label htmlFor="pi-phone">Mobile phone *</Label><Input id="pi-phone" required type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 512 555 0100" /></div>
            <div className="space-y-1"><Label htmlFor="pi-email">Email</Label><Input id="pi-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor="pi-addr">Service address *</Label><Input id="pi-addr" required value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label htmlFor="pi-city">City</Label><Input id="pi-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="pi-zip">ZIP *</Label><Input id="pi-zip" required inputMode="numeric" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
            </div>
            <div className="space-y-1">
              <Label>What do you need?</Label>
              <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v })}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Best way to reach you</Label>
              <Select value={form.contactPreference} onValueChange={(v) => setForm({ ...form, contactPreference: v })}>
                <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">Text message</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone call</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3">
              <Checkbox id="pi-consent" checked={form.smsConsent} onCheckedChange={(v) => setForm({ ...form, smsConsent: v === true })} className="mt-0.5" />
              <label htmlFor="pi-consent" className="text-xs leading-relaxed text-muted-foreground">
                I agree to receive texts from {data?.contractor.name ?? "the contractor"} about my estimate and inspection, including reminders. Reply STOP anytime to opt out. Consent wording v1 — we record the source, time and version of this permission.
              </label>
            </div>
            <Button type="submit" className="w-full min-h-[44px]" disabled={busy}>{busy ? "Sending…" : "Request my estimate"}</Button>
          </div>
        </div>
      </form>
    </PublicShell>
  );
}

/* ─────────────────────────── Booking ─────────────────────────── */

type BookingContext = {
  contractor: { name: string; timezone: string; city?: string | null };
  contact: { firstName: string };
  serviceType: string;
  alreadyBooked: boolean;
  appointment?: { id: string; startAt: string; manageToken: string; status: string } | null;
  slots: Slot[];
};

export function PublicBookingView({ token }: { token: string }) {
  const { data, loading, refresh } = useApi<BookingContext>(`/api/public/booking?token=${token}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ startAt: string; manageToken: string } | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);

  const tz = data?.contractor.timezone ?? "America/Chicago";
  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of data?.slots ?? []) {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(s.start));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries());
  }, [data, tz]);

  const book = async (slot: Slot) => {
    setBusy(slot.start);
    setConflict(null);
    try {
      const res = await api.post<{ appointment: { startAt: string; manageToken: string } }>("/api/public/booking", { token, startAt: slot.start });
      setConfirm({ startAt: res.appointment.startAt, manageToken: res.appointment.manageToken });
      refresh();
    } catch (e) {
      if (e instanceof Error && "payload" in e) {
        const payload = (e as unknown as { payload?: { error?: string } }).payload;
        if (payload?.error) setConflict(payload.error);
      } else {
        setConflict(e instanceof Error ? e.message : "Booking failed");
      }
      refresh();
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <PublicShell><SkeletonRows rows={4} /></PublicShell>;
  if (!data) return <PublicShell><div className="rounded-xl border bg-card p-6 text-center text-sm">This booking link is not valid. Please contact the office.</div></PublicShell>;

  if (confirm) {
    return (
      <PublicShell business={data.contractor.name}>
        <div className="rounded-xl border bg-card p-6 text-center space-y-3">
          <CalendarCheck2 className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-lg font-bold">Booked!</h1>
          <p suppressHydrationWarning className="text-sm text-muted-foreground">{fmtDateTimeTz(new Date(confirm.startAt), tz)} — a reminder arrives 24h before. Use this link to reschedule or cancel; the reminder follows your appointment.</p>
          <Button className="w-full min-h-[44px]" onClick={() => (window.location.hash = `#/public/manage/${confirm.manageToken}`)}>
            Manage my appointment
          </Button>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell business={data.contractor.name} onBack={() => (window.location.hash = "#/public/intake")}>
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <h1 className="text-lg font-bold">Pick your inspection time</h1>
          <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
            {data.contractor.name} · {SERVICE_TYPE_LABELS[data.serviceType] ?? data.serviceType} for {data.contact.firstName} · times shown in {tzAbbr(new Date(), tz)} ({tz})
          </p>
        </div>
        {conflict && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-900 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
            {conflict}
          </div>
        )}
        {data.alreadyBooked && data.appointment ? (
          <div className="rounded-xl border bg-card p-4 text-sm space-y-2">
            <div className="flex items-center gap-2"><ApptStatusBadge status={data.appointment.status} /><span suppressHydrationWarning className="font-medium">{fmtDateTimeTz(new Date(data.appointment.startAt), tz)}</span></div>
            <Button className="w-full min-h-[44px]" onClick={() => (window.location.hash = `#/public/manage/${data.appointment!.manageToken}`)}>Reschedule or cancel</Button>
          </div>
        ) : loading || byDay.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">No open times right now — the office will text you fresh options.</div>
        ) : (
          byDay.map(([day, slots]) => (
            <div key={day} className="rounded-xl border bg-card p-4">
              <h2 suppressHydrationWarning className="text-sm font-semibold">{fmtDateLong(new Date(slots[0].start), tz)}</h2>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {slots.map((s) => (
                  <button key={s.start} suppressHydrationWarning
                    className="rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors min-h-[44px] disabled:opacity-50"
                    disabled={busy === s.start}
                    onClick={() => void book(s)}
                  >
                    {fmtDateTimeTz(new Date(s.start), tz).split(" · ")[1]} {busy === s.start ? "…" : ""}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
        <p className="text-[11px] text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> The estimator comes to your service address; you&apos;ll get an exact-arrival text the day before.</p>
      </div>
    </PublicShell>
  );
}

/* ─────────────────────────── Manage (reschedule / cancel) ─────────────────────────── */

type ManageContext = {
  appointment: { id: string; startAt: string; status: string; timezone: string };
  contractor: { name: string; timezone: string };
  contact: { firstName: string };
  serviceType: string;
  slots: Slot[];
  estimate?: { number: string; amount: string; currency: string; status: string } | null;
};

export function PublicManageView({ token }: { token: string }) {
  const { data, loading, refresh } = useApi<ManageContext>(`/api/public/manage?token=${token}`);
  const [showSlots, setShowSlots] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const tz = data?.contractor.timezone ?? "America/Chicago";

  const reschedule = async (slot: Slot) => {
    setBusy(slot.start);
    setConflict(null);
    try {
      await api.post("/api/public/manage", { token, action: "reschedule", startAt: slot.start });
      toast("Rescheduled — your reminder moved with it");
      setShowSlots(false);
      refresh();
    } catch (e) {
      const payload = (e as unknown as { payload?: { error?: string; slots?: Slot[] } }).payload;
      setConflict(payload?.error ?? (e instanceof Error ? e.message : "Failed"));
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      await api.post("/api/public/manage", { token, action: "cancel" });
      setCanceled(true);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <PublicShell><SkeletonRows rows={3} /></PublicShell>;
  if (!data) return <PublicShell><div className="rounded-xl border bg-card p-6 text-center text-sm">This management link is not valid or has expired — contact the office.</div></PublicShell>;

  return (
    <PublicShell business={data.contractor.name}>
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <h1 className="text-lg font-bold">Your roof inspection</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <ApptStatusBadge status={data.appointment.status} />
            <span suppressHydrationWarning className="font-medium">{fmtDateTimeTz(new Date(data.appointment.startAt), tz)} {tzAbbr(new Date(data.appointment.startAt), tz)}</span>
          </div>
          <p suppressHydrationWarning className="mt-1 text-xs text-muted-foreground">
            {SERVICE_TYPE_LABELS[data.serviceType] ?? data.serviceType} for {data.contact.firstName} · {data.contractor.name}
          </p>
          {data.estimate && (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm flex flex-wrap items-center gap-2">
              <span className="font-semibold">{data.estimate.number}</span>
              <EstimateStatusBadge status={data.estimate.status} />
              <span>{fmtMoney(data.estimate.amount, data.estimate.currency)}</span>
            </div>
          )}
        </div>

        {canceled ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Your inspection is canceled. Request a new estimate anytime from the website.</div>
        ) : (
          <>
            {conflict && (
              <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-900 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
                {conflict}
              </div>
            )}
            {showSlots && (
              <div className="rounded-xl border bg-card p-4">
                <h2 className="text-sm font-semibold mb-2">Pick a new time ({tzAbbr(new Date(), tz)})</h2>
                {(data.slots ?? []).length === 0 ? (
                  <p className="text-sm text-center text-muted-foreground py-3">No fresh times open — the office will text you options.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {data.slots.slice(0, 10).map((s) => (
                      <button key={s.start} suppressHydrationWarning
                        className="rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-primary hover:text-primary-foreground min-h-[44px]"
                        disabled={busy === s.start} onClick={() => void reschedule(s)}>
                        {fmtDateTimeTz(new Date(s.start), tz)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {data.appointment.status === "BOOKED" && !showSlots && (
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-h-[44px]" onClick={() => setShowSlots(true)}>Reschedule</Button>
                <Button variant="outline" className="min-h-[44px]" disabled={busy === "cancel"} onClick={() => void cancel()}>Cancel visit</Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Changing the time cancels the old reminder and schedules exactly one reminder for the new time — including across daylight-saving changes.</p>
          </>
        )}
      </div>
    </PublicShell>
  );
}

export function PublicRouter({ segments }: { segments: string[] }) {
  // #/public/intake | #/public/book/:token | #/public/manage/:token
  const sub = segments[1];
  if (sub === "book" && segments[2]) return <PublicBookingView token={segments[2]} />;
  if (sub === "manage" && segments[2]) return <PublicManageView token={segments[2]} />;
  return <PublicIntakeView />;
}

export { navigate };
