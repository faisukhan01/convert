"use client";

import { useMemo, useState } from "react";
import { useApi, api } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { navigate } from "@/store/app";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  SectionCard, EmptyState, SkeletonRows, Row, DueChip, ApptStatusBadge, EstimateStatusBadge, ConfirmDialog,
} from "@/components/app/ui-bits";
import { fmtDateLong, fmtTime, tzAbbr } from "@/lib/time";
import { fmtMoney } from "@/lib/money";
import { TASK_KIND_LABELS } from "@/lib/constants";
import type { TaskRow, AppointmentRow, EstimateRow } from "@/lib/client-types";
import { ArrowRight, Check, AlarmClockOff, UserPlus, PauseCircle, CalendarCheck2 } from "lucide-react";

export function AssignDialog({ task, onDone }: { task: TaskRow; onDone: () => void }) {
  const { data } = useApi<{ team: { userId: string; name: string; role: string }[] }>(`/api/contractors/${useAppStore((s) => s.session?.currentContractorId ?? "")}`);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(task.assignedUserId ?? "");
  if (!data) return null;
  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      value={value || undefined}
      onValueChange={async (v) => {
        setValue(v);
        setOpen(false);
        await api.patch(`/api/tasks?id=${task.id}`, { assignedUserId: v });
        toast("Task assigned");
        onDone();
      }}
    >
      <SelectTrigger size="sm" className="h-7 w-[110px] text-xs" aria-label="Assign task">
        <UserPlus className="h-3.5 w-3.5 mr-1 opacity-60" />
        <SelectValue placeholder="Assign" />
      </SelectTrigger>
      <SelectContent>
        {data.team.map((m) => (
          <SelectItem key={m.userId} value={m.userId}>{m.name} · {m.role.toLowerCase()}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TaskRowItem({ task, now, onChanged }: { task: TaskRow; now: string; onChanged: () => void }) {
  const contact = task.inquiry?.contact;
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast(msg);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Row>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium truncate max-w-[260px]">{contact ? `${contact.firstName} ${contact.lastName}`.trim() : "—"}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{TASK_KIND_LABELS[task.kind] ?? task.kind}</span>
          <DueChip dueAt={task.dueAt} now={now} />
          {task.createdBy === "AUTOMATION" && <span className="text-[10px] uppercase tracking-wide text-sky-700 dark:text-sky-300">automation</span>}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground truncate">{task.detail ?? task.title}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <AssignDialog task={task} onDone={onChanged} />
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={busy}
          onClick={() => void act(() => api.patch(`/api/tasks?id=${task.id}`, { complete: true }), "Marked done")}>
          <Check className="h-3 w-3" /> Done
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" disabled={busy}
          onClick={() => void act(() => api.patch(`/api/tasks?id=${task.id}`, { snoozeUntil: new Date(new Date(now).getTime() + 86400000).toISOString() }), "Snoozed until tomorrow")}>
          <AlarmClockOff className="h-3 w-3" /> Snooze
        </Button>
        {task.inquiryId && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => navigate(`/inquiries/${task.inquiryId}`)}>
            Open <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </Row>
  );
}

export function TodayView() {
  const store = useAppStore();
  const contractorId = store.session?.currentContractorId ?? store.session?.contractors?.[0]?.id;
  const contractorTz = store.session?.contractors?.find((c) => c.id === contractorId)?.timezone ?? "America/Chicago";

  const tasksQ = useApi<{ tasks: TaskRow[]; now: string }>(contractorId ? `/api/tasks?view=today&contractorId=${contractorId}` : null);
  const apptsQ = useApi<{ appointments: AppointmentRow[]; now: string }>(contractorId ? `/api/appointments?contractorId=${contractorId}` : null);
  const estimatesQ = useApi<{ estimates: EstimateRow[]; now: string }>(contractorId ? `/api/estimates?contractorId=${contractorId}` : null);

  const nowIso = tasksQ.data?.now ?? new Date().toISOString();
  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const todayAppts = useMemo(() => {
    const appts = apptsQ.data?.appointments ?? [];
    return appts.filter((a) => {
      const localDay = new Intl.DateTimeFormat("en-CA", { timeZone: contractorTz }).format(new Date(a.startAt));
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: contractorTz }).format(now);
      return localDay === today && a.status === "BOOKED";
    });
  }, [apptsQ.data, contractorTz, now]);

  const openEstimates = useMemo(() => {
    const ests = estimatesQ.data?.estimates ?? [];
    return ests.filter((e) => e.status === "SENT" || e.status === "VIEWED");
  }, [estimatesQ.data]);

  const changed = () => {
    tasksQ.refresh();
    apptsQ.refresh();
    estimatesQ.refresh();
  };

  const tasks = tasksQ.data?.tasks ?? [];
  const overdue = tasks.filter((t) => new Date(t.dueAt) < now);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Today</h1>
          <p suppressHydrationWarning className="text-sm text-muted-foreground">
            {fmtDateLong(now, contractorTz)} · {tzAbbr(now, contractorTz)} — everything that needs a response, a visit, or a decision.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full border bg-red-50 px-2.5 py-1 font-semibold text-red-800 dark:bg-red-950 dark:text-red-200 border-red-200 dark:border-red-900">{overdue.length} overdue</span>
          <span className="rounded-full border bg-sky-50 px-2.5 py-1 font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-200 border-sky-200 dark:border-sky-900">{todayAppts.length} inspections</span>
          <span className="rounded-full border bg-amber-50 px-2.5 py-1 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200 border-amber-200 dark:border-amber-900">{openEstimates.length} estimates open</span>
        </div>
      </header>

      <SectionCard title="Needs a response" subtitle="Overdue first — callbacks, replies, review queues" count={tasks.length}
        action={<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate("/inquiries")}>All inquiries</Button>}>
        {tasksQ.loading ? <SkeletonRows rows={4} /> : tasks.length === 0 ? (
          <EmptyState title="Nothing needs a response" hint="New inquiries land here automatically — office-entered, website forms and missed calls." />
        ) : (
          <div className="space-y-2">
            {[...tasks].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()).map((t) => (
              <TaskRowItem key={t.id} task={t} now={nowIso} onChanged={changed} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Inspections today" subtitle="Mark outcomes when the estimator finishes" count={todayAppts.length}>
        {apptsQ.loading ? <SkeletonRows rows={2} /> : todayAppts.length === 0 ? (
          <EmptyState title="No inspections scheduled today" hint="Bookings made by homeowners or the office appear here on the day of the visit." />
        ) : (
          <div className="space-y-2">
            {todayAppts.map((a) => (
              <Row key={a.id}>
                <div className="w-16 shrink-0 text-center">
                  <div className="text-sm font-bold" suppressHydrationWarning>{fmtTime(a.startAt, contractorTz)}</div>
                  <div className="text-[10px] text-muted-foreground">{tzAbbr(new Date(a.startAt), contractorTz)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button className="font-medium hover:underline text-left" onClick={() => navigate(`/inquiries/${a.inquiryId}`)}>
                      {a.inquiry?.contact ? `${a.inquiry.contact.firstName} ${a.inquiry.contact.lastName}` : "—"}
                    </button>
                    <ApptStatusBadge status={a.status} />
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {a.inquiry?.contact?.addressLine1 ?? "Address on file"} · {a.inquiry?.serviceType.replace("_", " ").toLowerCase()} · estimator: {a.estimatorId ? "assigned" : "unassigned"}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="outline" className="h-7 text-xs gap-1"><CalendarCheck2 className="h-3 w-3" /> Complete</Button>}
                    title="Mark visit complete?"
                    description="The inquiry moves to Inspected and the office gets a task to prepare the quote."
                    confirmLabel="Mark complete"
                    onConfirm={async () => {
                      await api.patch(`/api/appointments/${a.id}`, { status: "COMPLETED" });
                      toast("Visit completed — office handed the next step");
                      changed();
                    }}
                  />
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="ghost" className="h-7 text-xs">No-show</Button>}
                    title="Mark as no-show?"
                    description="Creates a recovery task; a rebooking text is scheduled if the customer has SMS permission."
                    confirmLabel="Mark no-show"
                    destructive
                    onConfirm={async () => {
                      await api.patch(`/api/appointments/${a.id}`, { status: "NO_SHOW" });
                      toast("Marked as no-show");
                      changed();
                    }}
                  />
                </div>
              </Row>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Estimates awaiting a reply" subtitle="Oldest first — chase automation runs on schedule" count={openEstimates.length}
        action={<Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate("/estimates")}>All estimates</Button>}>
        {estimatesQ.loading ? <SkeletonRows rows={2} /> : openEstimates.length === 0 ? (
          <EmptyState title="No open estimates" hint="Send a draft from an inspected inquiry and the follow-up ladder starts automatically." />
        ) : (
          <div className="space-y-2">
            {[...openEstimates].sort((a, b) => new Date(a.sentAt ?? a.createdAt).getTime() - new Date(b.sentAt ?? b.createdAt).getTime()).map((e) => {
              const ageDays = Math.floor((now.getTime() - new Date(e.sentAt ?? e.createdAt).getTime()) / 86400000);
              return (
                <Row key={e.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="font-medium hover:underline text-left" onClick={() => navigate(`/inquiries/${e.inquiryId}`)}>
                        {e.inquiry?.contact ? `${e.inquiry.contact.firstName} ${e.inquiry.contact.lastName}` : e.number}
                      </button>
                      <EstimateStatusBadge status={e.status} />
                      <span className="text-xs text-muted-foreground">{e.number} · {fmtMoney(e.amount, e.currency)} · sent {ageDays}d ago</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.followUpPausedAt ? "Automated chase paused — staff owns the next touch" : "Next automated nudge is scheduled (see outbox)"}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {!e.followUpPausedAt && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                        onClick={async () => {
                          await api.patch(`/api/estimates?id=${e.id}`, { pauseChase: true });
                          toast("Chase paused — staff owns follow-up");
                          changed();
                        }}>
                        <PauseCircle className="h-3 w-3" /> Pause chase
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(`/inquiries/${e.inquiryId}`)}>Open estimate</Button>
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
