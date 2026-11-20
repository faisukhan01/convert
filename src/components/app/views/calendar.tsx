"use client";

import { useMemo, useState } from "react";
import { useApi, api } from "@/hooks/use-api";
import { navigate, useAppStore, roleAt } from "@/store/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard, EmptyState, SkeletonRows, Row, ApptStatusBadge } from "@/components/app/ui-bits";
import { fmtTime, fmtDateLong, tzAbbr, tzParts, wallToUtc } from "@/lib/time";
import { SERVICE_TYPE_LABELS } from "@/lib/constants";
import type { AppointmentRow } from "@/lib/client-types";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

export function CalendarView() {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const contractor = session?.contractors?.find((c) => c.id === contractorId);
  const tz = contractor?.timezone ?? "America/Chicago";
  const role = roleAt(session, contractorId);
  const isEstimator = role === "ESTIMATOR";
  const [weekOffset, setWeekOffset] = useState(0);
  const [estimatorFilter, setEstimatorFilter] = useState<string>("all");

  const { data, loading } = useApi<{ appointments: AppointmentRow[]; now: string; team?: { userId: string; name: string; role: string }[] }>(
    contractorId ? `/api/appointments?contractorId=${contractorId}` : null
  );
  const teamQ = useApi<{ team: { userId: string; name: string; role: string }[] }>(contractorId && !isEstimator ? `/api/contractors/${contractorId}` : null);

  const nowIso = data?.now ?? new Date().toISOString();
  const now = new Date(nowIso);

  // week window (Mon–Sun) around weekOffset, in contractor-local days
  const weekDays = (() => {
    const p = tzParts(now, tz);
    const todayLocal = wallToUtc(tz, p.year, p.month, p.day, 12, 0);
    const dow = p.dow === "sun" ? 7 : { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 }[p.dow];
    const monday = new Date(todayLocal.getTime() - (dow - 1) * 86400000 + weekOffset * 7 * 86400000);
    return Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000));
  })();

  const appts = (() => {
    const rows = data?.appointments ?? [];
    if (isEstimator) return rows.filter((a) => a.estimatorId === session?.user?.id);
    if (estimatorFilter !== "all") return rows.filter((a) => a.estimatorId === estimatorFilter);
    return rows;
  })();

  const byDay = (() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const a of appts) {
      const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(a.startAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  })();

  const changed = () => toast("Appointment updated");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Calendar</h1>
          <p suppressHydrationWarning className="text-sm text-muted-foreground">{fmtDateLong(weekDays[0], tz)} — {fmtDateLong(weekDays[6], tz)} · {tzAbbr(now, tz)}</p>
        </div>
        <div className="flex items-center gap-2">
          {!isEstimator && teamQ.data && (
            <Select value={estimatorFilter} onValueChange={setEstimatorFilter}>
              <SelectTrigger className="w-[160px]" aria-label="Filter by estimator"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All estimators</SelectItem>
                {teamQ.data.team.filter((t) => t.role === "ESTIMATOR").map((t) => <SelectItem key={t.userId} value={t.userId}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeekOffset((w) => w - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>This week</Button>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setWeekOffset((w) => w + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </header>

      {isEstimator && (
        <div className="rounded-lg border bg-sky-50 dark:bg-sky-950 border-sky-200 dark:border-sky-900 px-3 py-2 text-xs text-sky-900 dark:text-sky-200">
          Phone agenda — only your assigned visits. Mark an outcome when the visit ends; the office takes it from there.
        </div>
      )}

      {loading ? <SkeletonRows rows={6} /> : (
        <div className="grid gap-3 md:grid-cols-7">
          {weekDays.map((day) => {
            const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(day);
            const dayAppts = (byDay.get(key) ?? []).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
            const isToday = key === new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
            return (
              <section key={key} className={`rounded-xl border bg-card min-h-[120px] ${isToday ? "ring-2 ring-primary/40" : ""}`}>
                <header className={`border-b px-2.5 py-2 text-xs ${isToday ? "font-bold" : "font-semibold"}`}>
                  <span suppressHydrationWarning className="uppercase tracking-wide text-muted-foreground">{new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(day)}</span>{" "}
                  <span suppressHydrationWarning>{new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(day)}</span>
                  {isToday && <span className="ml-1 rounded bg-primary px-1 py-0.5 text-[9px] font-bold text-primary-foreground">TODAY</span>}
                </header>
                <div className="space-y-1.5 p-2">
                  {dayAppts.length === 0 ? (
                    <p className="px-1 py-2 text-[11px] text-muted-foreground">No visits</p>
                  ) : dayAppts.map((a) => (
                    <button
                      key={a.id}
                      suppressHydrationWarning
                      onClick={() => navigate(`/inquiries/${a.inquiryId}`)}
                      className="w-full rounded-md border px-2 py-1.5 text-left text-[11px] hover:bg-accent/60 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold">{fmtTime(a.startAt, tz)}</span>
                        <ApptStatusBadge status={a.status} />
                      </div>
                      <div className="mt-0.5 font-medium truncate">{a.inquiry?.contact ? `${a.inquiry.contact.firstName} ${a.inquiry.contact.lastName}` : "—"}</div>
                      <div className="flex items-center gap-0.5 text-muted-foreground truncate"><MapPin className="h-2.5 w-2.5" />{a.inquiry?.contact?.zip ?? ""} · {SERVICE_TYPE_LABELS[a.inquiry?.serviceType ?? ""]?.replace("Roof ", "") ?? ""}</div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!isEstimator && (
        <SectionCard title="Past visits awaiting an outcome" subtitle="Flagged until someone records completed / no-show" count={appts.filter((a) => a.status === "BOOKED" && new Date(a.startAt) < now).length}>
          {appts.filter((a) => a.status === "BOOKED" && new Date(a.startAt) < now).length === 0 ? (
            <EmptyState title="No stale outcomes" hint="Every past visit has a recorded result." />
          ) : (
            <div className="space-y-2">
              {appts.filter((a) => a.status === "BOOKED" && new Date(a.startAt) < now).map((a) => (
                <Row key={a.id}>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{a.inquiry?.contact?.firstName} {a.inquiry?.contact?.lastName}</span>
                    <span suppressHydrationWarning className="ml-2 text-xs text-muted-foreground">{fmtDateLong(a.startAt, tz)} · {fmtTime(a.startAt, tz)}</span>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void api.patch(`/api/appointments/${a.id}`, { status: "COMPLETED" }).then(changed)}>Held</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void api.patch(`/api/appointments/${a.id}`, { status: "NO_SHOW" }).then(changed)}>No-show</Button>
                  </div>
                </Row>
              ))}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
