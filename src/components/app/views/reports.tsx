"use client";

import { useMemo, useState } from "react";
import { useApi, api } from "@/hooks/use-api";
import { useAppStore, roleAt } from "@/store/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SectionCard, EmptyState, SkeletonRows } from "@/components/app/ui-bits";
import { fmtMoney, fmtPct } from "@/lib/money";
import { fmtDate, fmtDateTimeTz } from "@/lib/time";
import { ESTIMATE_STATUS_LABELS, APPT_STATUS_LABELS } from "@/lib/constants";
import type { ReportsInfo, ExperimentResult, PaymentRow, InquiryRow } from "@/lib/client-types";
import { Download, Search, ArrowDownUp, FlaskConical, TriangleAlert, CircleHelp } from "lucide-react";

type DrillRow = Record<string, unknown> & { id: string };

function DrillDialog({ metric, label, days, contractorId, onMatch }: {
  metric: string; label: string; days: number; contractorId: string; onMatch?: (paymentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data, loading } = useApi<{ rows: DrillRow[] }>(open ? `/api/reports/drilldown?metric=${metric}&days=${days}&contractorId=${contractorId}` : null);
  const inquiriesQ = useApi<{ inquiries: InquiryRow[] }>(open && onMatch ? `/api/inquiries?contractorId=${contractorId}` : null);
  const [matchPayment, setMatchPayment] = useState<string | null>(null);

  const cell = (row: DrillRow, key: string): string => {
    const v = row[key];
    if (v === null || v === undefined) return "—";
    if (typeof v === "string" && /\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateTimeTz(new Date(v), "America/Chicago");
    if (typeof v === "boolean") return v ? "yes" : "no";
    return String(v);
  };

  const columns = data?.rows?.[0] ? Object.keys(data.rows[0]).filter((k) => k !== "id").slice(0, 7) : [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1"><Search className="h-3 w-3" /> Drill down</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label} — records behind the number</DialogTitle>
          <DialogDescription>Same filters as the screen: last {days} days, your location, test and duplicate inquiries excluded.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-y-auto scroll-area rounded-lg border">
          {loading ? <div className="p-4"><SkeletonRows rows={5} /></div> : !data?.rows?.length ? (
            <div className="p-4"><EmptyState title="No records in this period" /></div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>{columns.map((c) => <th key={c} className="px-2.5 py-2 text-left font-semibold">{c.replace(/([A-Z])/g, " $1").toLowerCase()}</th>)}
                  {onMatch && <th className="px-2.5 py-2">match</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.id ?? i} className="border-t hover:bg-accent/40">
                    {columns.map((c) => <td key={c} className="px-2.5 py-1.5 max-w-[220px] truncate">{cell(r, c)}</td>)}
                    {onMatch && (
                      <td className="px-2.5 py-1.5">
                        {matchPayment === r.id ? (
                          <Select onValueChange={async (inqId) => {
                            await api.post("/api/payments", { paymentId: r.id, inquiryId: inqId });
                            toast("Payment matched — recorded who confirmed it");
                            setMatchPayment(null);
                            setOpen(false);
                          }}>
                            <SelectTrigger className="h-6 w-[160px] text-[11px]"><SelectValue placeholder="Pick inquiry…" /></SelectTrigger>
                            <SelectContent>
                              {(inquiriesQ.data?.inquiries ?? []).slice(0, 50).map((iq) => (
                                <SelectItem key={iq.id} value={iq.id}>{iq.contact?.firstName} {iq.contact?.lastName} · {iq.stage}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => setMatchPayment(r.id)}>Match…</Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open(`/api/reports/export?metric=${metric === "unmatched" ? "payments" : metric}&days=${days}&contractorId=${contractorId}`, "_blank")}>
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ title, value, sub, tone, children }: {
  title: string; value: string; sub: string; tone?: "good" | "warn" | "neutral"; children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border bg-card p-4 ${tone === "good" ? "border-emerald-200 dark:border-emerald-900" : tone === "warn" ? "border-amber-200 dark:border-amber-900" : ""}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <p className="mt-1.5 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ExperimentPanel({ exp, contractorId, onChanged }: { exp: ExperimentResult; contractorId: string; onChanged: () => void }) {
  const route = async (arm: "A" | "B") => {
    await api.patch(`/api/experiments?id=${exp.id}`, { routeToArm: arm });
    toast(`Future contacts routed to message ${arm} — splitting stopped`);
    onChanged();
  };
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{exp.name}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">{exp.status}</span>
        {exp.inconclusive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900">
            <TriangleAlert className="h-3 w-3" /> inconclusive — small sample
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {(["A", "B"] as const).map((arm) => {
          const rate = arm === "A" ? exp.rateA : exp.rateB;
          const arms = exp.arms[arm];
          return (
            <div key={arm} className="rounded-lg border p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Message {arm}</div>
              <div className="mt-1 text-2xl font-bold">{rate !== null ? `${rate.toFixed(1)}%` : <CircleHelp className="h-5 w-5 text-muted-foreground" />}</div>
              <div className="text-[11px] text-muted-foreground">{arms.booked} booked / {arms.enrolled} enrolled</div>
              <div className="mt-2 h-1.5 rounded bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded" style={{ width: `${rate ?? 0}%` }} />
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground truncate">{arm === "A" ? exp.messageA : exp.messageB}</div>
            </div>
          );
        })}
        <div className="rounded-lg border border-dashed p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Observed difference</div>
          <div className="mt-1 text-2xl font-bold">{exp.diffPp !== null ? `${exp.diffPp > 0 ? "+" : ""}${exp.diffPp.toFixed(1)} pp` : "—"}</div>
          <div className="text-[11px] text-muted-foreground">bookings per enrolled inquiry, B vs A</div>
          {exp.status === "RUNNING" && (
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void route("A")}>Route to A</Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void route("B")}>Route to B</Button>
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Assignment is idempotent (one designated inquiry per contact). Results stay unavailable until assignments are verified; sample sizes are always visible.
      </p>
    </div>
  );
}

export function ReportsView() {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const role = roleAt(session, contractorId);
  const [days, setDays] = useState("30");
  const { data, loading, refresh } = useApi<ReportsInfo>(contractorId ? `/api/reports?days=${days}&contractorId=${contractorId}` : null);
  const paymentsQ = useApi<{ payments: PaymentRow[] }>(contractorId ? `/api/payments?contractorId=${contractorId}` : null);

  if (role === "ESTIMATOR") {
    return <EmptyState title="Reports are for office and owner roles" hint="Your estimator view focuses on assigned visits." />;
  }

  const unmatched = (paymentsQ.data?.payments ?? []).filter((p) => p.status === "UNMATCHED");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground">Same queries power the screen, the drill-down and the CSV export. Contractor-local timezone.</p>
        </div>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-[140px]" aria-label="Reporting period"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </header>

      {loading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              title="Booking rate" value={data.bookingRate.rate !== null ? `${data.bookingRate.rate.toFixed(1)}%` : "—"}
              sub={`${data.bookingRate.numerator} of ${data.bookingRate.denominator} mature eligible inquiries booked within 14 days`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">+{data.bookingRate.immatureCount} still in their 14-day window (shown separately)</span>
                <DrillDialog metric="booking" label="Booking rate" days={Number(days)} contractorId={contractorId!} />
              </div>
            </Kpi>
            <Kpi
              title="Attendance" value={data.attendance.showRate !== null ? `${data.attendance.showRate.toFixed(1)}%` : "—"}
              sub={`${data.attendance.held} held · ${data.attendance.noShow} no-show · ${data.attendance.canceled} canceled`}
              tone={data.attendance.unknownOutcomeCount > 0 ? "warn" : "good"}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {data.attendance.unknownOutcomeCount > 0 ? `⚠ ${data.attendance.unknownOutcomeCount} past visit(s) with unknown outcome` : "All past visits have recorded outcomes"}
                </span>
                <DrillDialog metric="attendance" label="Attendance" days={Number(days)} contractorId={contractorId!} />
              </div>
            </Kpi>
            <Kpi
              title="Estimate acceptance" value={data.acceptance.rate !== null ? `${data.acceptance.rate.toFixed(1)}%` : "—"}
              sub={`${data.acceptance.accepted} accepted of ${data.acceptance.sent} sent · ${data.acceptance.openCount} still open`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">Revisions count once · acceptance evidence survives invoicing</span>
                <DrillDialog metric="acceptance" label="Estimate acceptance" days={Number(days)} contractorId={contractorId!} />
              </div>
            </Kpi>
            <Kpi
              title="Collected revenue" value={fmtMoney(data.revenue.net)}
              sub={`${fmtMoney(data.revenue.receipts)} receipts − ${fmtMoney(data.revenue.refunds)} refunds · ${data.revenue.matchedCount} matched receipts`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {data.revenue.unmatchedCount > 0 ? <span className="font-semibold text-amber-700 dark:text-amber-300">{fmtMoney(data.revenue.unmatchedTotal)} unmatched — review queue</span> : "Confirmed zero when no payments exist"}
                </span>
                <DrillDialog metric="revenue" label="Collected revenue" days={Number(days)} contractorId={contractorId!} />
              </div>
            </Kpi>
          </div>

          {data.revenue.unmatchedCount > 0 && (
            <SectionCard title="Payment review queue" subtitle="ambiguous matches need a person — who confirmed the match is recorded" count={data.revenue.unmatchedCount}>
              <div className="space-y-2">
                {unmatched.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="font-semibold">{fmtMoney(p.amount, p.currency)}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{p.provider}</span>
                    <span className="text-xs text-muted-foreground">{p.providerTxnId} · {fmtDate(p.occurredAt, data.period.timezone)}</span>
                    <span className="ml-auto flex gap-1.5">
                      <DrillDialog metric="unmatched" label={`Match ${fmtMoney(p.amount)} (${p.provider})`} days={Number(days)} contractorId={contractorId!} onMatch={(paymentId) => { void paymentId; }} />
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">Unmatched revenue is shown separately and never counted in collected totals until a person confirms the match.</p>
              </div>
            </SectionCard>
          )}

          {data.experiments.map((exp) => (
            <ExperimentPanel key={exp.id} exp={exp} contractorId={contractorId!} onChanged={refresh} />
          ))}

          <SectionCard title="Definitions in plain English">
            <ul className="list-disc space-y-1.5 pl-5 text-xs text-muted-foreground">
              <li><strong className="text-foreground">Booking rate</strong> — for eligible inquiries created in the period, the share with a first confirmed inspection booked within 14 days. Test and duplicate inquiries are excluded; reschedules count once; a later cancellation does not erase the historical booking; immature cohorts (younger than 14 days) are shown separately.</li>
              <li><strong className="text-foreground">Attendance</strong> — held inspections, cancellations and no-shows shown separately; show rate = held ÷ (held + no-shows) for visits with a recorded outcome in the period. Past visits without an outcome are flagged.</li>
              <li><strong className="text-foreground">Estimate acceptance</strong> — distinct sent estimates in the cohort and the share accepted by the reporting cutoff. Revisions of the same quote count once; acceptance evidence survives later invoicing.</li>
              <li><strong className="text-foreground">Collected revenue</strong> — matched settled receipts minus refunds in their settlement period; each provider transaction counts once; unmatched receipts stay in the review queue. A confirmed zero is distinguished from missing payment data.</li>
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  );
}
