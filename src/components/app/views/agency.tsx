"use client";

import { useState } from "react";
import { useApi, api } from "@/hooks/use-api";
import { useAppStore, navigate } from "@/store/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard, SkeletonRows } from "@/components/app/ui-bits";
import { Plus, ArrowRightCircle } from "lucide-react";

type AgencyData = {
  contractors: {
    id: string; name: string; slug: string; timezone: string; billingStatus: string; runMode: string;
    activatedAt: string | null; ghlLocationId?: string | null; ghlStatus: string;
    members: { name: string; email: string; role: string }[];
  }[];
};

export function AgencyView() {
  const { session, switchContractor } = useAppStore();
  const { data, loading, refresh } = useApi<AgencyData>("/api/contractors");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", timezone: "America/Chicago", city: "", state: "", billingStatus: "trial" });
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      await api.post("/api/contractors", form);
      toast(`${form.name} provisioned — onboarding checklist ready`);
      setOpen(false);
      setForm({ name: "", timezone: "America/Chicago", city: "", state: "", billingStatus: "trial" });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Provisioning failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Agency — locations</h1>
          <p className="text-sm text-muted-foreground">
            {session?.user?.agency?.name ?? "Agency"} · provision contractors, verify connections, manage subscriptions. Switch explicitly between authorized locations.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New contractor</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Provision a contractor location</DialogTitle>
              <DialogDescription>Creates the tenant with its own team, playbooks and connector state. Onboarding runs per location.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1"><Label htmlFor="ag-name">Business name *</Label><Input id="ag-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1">
                <Label htmlFor="ag-tz">Timezone</Label>
                <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                  <SelectTrigger id="ag-tz"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["America/Chicago", "America/New_York", "America/Denver", "America/Phoenix", "America/Los_Angeles"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1"><Label htmlFor="ag-city">City</Label><Input id="ag-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div className="w-20 space-y-1"><Label htmlFor="ag-st">State</Label><Input id="ag-st" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              </div>
              <div className="space-y-1">
                <Label>Subscription</Label>
                <Select value={form.billingStatus} onValueChange={(v) => setForm({ ...form, billingStatus: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">trial</SelectItem>
                    <SelectItem value="active">active</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => void create()} disabled={busy || !form.name}>{busy ? "Provisioning…" : "Provision"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      {loading ? <SkeletonRows rows={3} /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {(data?.contractors ?? []).map((c) => (
            <SectionCard key={c.id} title={c.name} subtitle={`${c.timezone} · /${c.slug}`}>
              <div className="space-y-2.5 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-semibold">{c.billingStatus.replace("_", " ")}</span>
                  <span className="rounded-full border bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase">{c.runMode} mode</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.ghlStatus === "CONNECTED" ? "bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900" : "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700"}`}>
                    GHL: {c.ghlStatus.toLowerCase()}
                  </span>
                  {c.activatedAt && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">activated</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Members: {c.members.map((m) => `${m.name} (${m.role.toLowerCase()})`).join(", ") || "none yet"}
                </div>
                <Button size="sm" variant="outline" className="gap-1.5"
                  onClick={() => void switchContractor(c.id).then(() => { toast(`Switched to ${c.name}`); navigate("/settings"); })}>
                  <ArrowRightCircle className="h-3.5 w-3.5" /> Open &amp; manage
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <SectionCard title="Onboarding checklist (per location)">
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Collect business profile, timezone, hours, service ZIPs, estimator assignments, preferred channels and calendar.</li>
          <li>Install the GHL app for the location (OAuth binds the location to this tenant — state-bound, minimum scopes).</li>
          <li>Map provider assets: one SMS sender, one email sender, one calendar per location.</li>
          <li>Run the connection check on Settings → Connection status until every prerequisite passes.</li>
          <li>Activate the location deliberately (blocked until prerequisites pass) and start with read-only provider checks.</li>
          <li>Publish the WordPress embed or the hosted booking link; verify one end-to-end booking.</li>
        </ol>
      </SectionCard>
    </div>
  );
}
