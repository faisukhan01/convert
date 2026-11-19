"use client";

import { useMemo, useState } from "react";
import { useApi } from "@/hooks/use-api";
import { navigate, useAppStore } from "@/store/app";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { api } from "@/hooks/use-api";
import { toast } from "sonner";
import { SectionCard, SkeletonRows, Row, StageBadge, EmptyState } from "@/components/app/ui-bits";
import { fmtDate, tzAbbr } from "@/lib/time";
import { SERVICE_TYPE_LABELS, SOURCE_LABELS, STAGES, STAGE_LABELS, SOURCES } from "@/lib/constants";
import type { InquiryRow, TaskRow } from "@/lib/client-types";
import { Search, Plus, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type ListResponse = { inquiries: (InquiryRow & { tasks: TaskRow[] })[] };

export function NewLeadDialog() {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", addressLine1: "", zip: "", serviceType: "REPLACEMENT", smsConsent: false, isMissedCall: false, note: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ inquiry: InquiryRow; existing: boolean }>("/api/inquiries", { ...form, contractorId });
      toast(res.existing ? "Found an open inquiry for this contact" : "Inquiry created — playbook rules applied");
      setOpen(false);
      navigate(`/inquiries/${res.inquiry.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5"><Plus className="h-3.5 w-3.5" /> New lead</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Office-entered lead or missed call</DialogTitle>
          <DialogDescription>Same phone number keeps one contact; a new property creates a separate inquiry.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label htmlFor="nl-first">First name *</Label><Input id="nl-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="nl-last">Last name</Label><Input id="nl-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="nl-phone">Phone *</Label><Input id="nl-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 512 555 0100" /></div>
          <div className="space-y-1"><Label htmlFor="nl-email">Email</Label><Input id="nl-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="nl-addr">Service address</Label><Input id="nl-addr" value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="nl-zip">ZIP</Label><Input id="nl-zip" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
          <div className="space-y-1 col-span-2">
            <Label htmlFor="nl-service">Service</Label>
            <Select value={form.serviceType} onValueChange={(v) => setForm({ ...form, serviceType: v })}>
              <SelectTrigger id="nl-service"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(SERVICE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={form.smsConsent} onChange={(e) => setForm({ ...form, smsConsent: e.target.checked })} />
            Customer agreed to receive texts (consent recorded with source + wording version)
          </label>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={form.isMissedCall} onChange={(e) => setForm({ ...form, isMissedCall: e.target.checked })} />
            Log as missed call (creates a consolidated callback task)
          </label>
          <div className="space-y-1 col-span-2"><Label htmlFor="nl-note">Note</Label><Input id="nl-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Anything the office should know" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || !form.firstName || !form.phone}>{busy ? "Saving…" : "Create inquiry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InquiriesView({ query }: { query: URLSearchParams }) {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const [q, setQ] = useState(query.get("q") ?? "");
  const [stage, setStage] = useState(query.get("stage") ?? "all");
  const [source, setSource] = useState(query.get("source") ?? "all");
  const [debouncedQ, setDebouncedQ] = useState(q);

  useMemo(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  // keep filters in the hash so returning preserves state
  useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage !== "all") params.set("stage", stage);
    if (source !== "all") params.set("source", source);
    const next = `#/inquiries${params.toString() ? `?${params.toString()}` : ""}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
  }, [q, stage, source]);

  const { data, loading, error } = useApi<ListResponse>(
    contractorId ? `/api/inquiries?contractorId=${contractorId}&stage=${stage}&source=${source}&q=${encodeURIComponent(debouncedQ)}` : null
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Inquiries</h1>
          <p className="text-sm text-muted-foreground">Website requests, missed calls and office leads — each with a first known source.</p>
        </div>
        <NewLeadDialog />
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, address…" className="pl-8" aria-label="Search inquiries" />
          {q && (
            <button className="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Clear search" onClick={() => setQ("")}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        <Select value={stage} onValueChange={setStage}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by stage"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            {STAGES.map((s) => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-[160px]" aria-label="Filter by source"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <SectionCard title="Inquiries" count={data?.inquiries?.length}>
        {loading ? <SkeletonRows rows={6} /> : error ? (
          <EmptyState title="Couldn't load inquiries" hint={error} />
        ) : (data?.inquiries?.length ?? 0) === 0 ? (
          <EmptyState title="No inquiries match" hint="Try clearing filters, or create a lead with the button above." />
        ) : (
          <div className="space-y-2">
            {data!.inquiries.map((inq) => {
              const openTask = inq.tasks?.[0];
              return (
                <Row key={inq.id} onClick={() => navigate(`/inquiries/${inq.id}`)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{inq.contact ? `${inq.contact.firstName} ${inq.contact.lastName}`.trim() : "—"}</span>
                      <StageBadge stage={inq.stage} />
                      {inq.isDuplicate && <span className="text-[10px] uppercase text-muted-foreground">duplicate</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {SERVICE_TYPE_LABELS[inq.serviceType] ?? inq.serviceType} · ZIP {inq.serviceZip} · {SOURCE_LABELS[inq.source] ?? inq.source}
                      {inq.contact?.addressLine1 ? ` · ${inq.contact.addressLine1}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs text-muted-foreground" suppressHydrationWarning>{fmtDate(inq.createdAt, session?.contractors?.find((c) => c.id === contractorId)?.timezone ?? "UTC")} {tzAbbr(new Date(inq.createdAt), session?.contractors?.find((c) => c.id === contractorId)?.timezone ?? "UTC")}</span>
                    {openTask && <span className="text-[11px] text-muted-foreground truncate max-w-[220px]">{openTask.title}</span>}
                  </div>
                </Row>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
