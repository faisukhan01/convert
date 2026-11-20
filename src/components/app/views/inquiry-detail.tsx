"use client";

import { useState } from "react";
import { useApi, api } from "@/hooks/use-api";
import { navigate, useAppStore, roleAt } from "@/store/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SkeletonRows, Row, StageBadge, ActorChip, EstimateStatusBadge, ApptStatusBadge, ConfirmDialog, Def, EmptyState } from "@/components/app/ui-bits";
import { fmtDateTimeTz, fmtTime, fmtDate, tzAbbr, relativeDue } from "@/lib/time";
import { fmtMoney } from "@/lib/money";
import { SOURCE_LABELS, SERVICE_TYPE_LABELS, TASK_KIND_LABELS } from "@/lib/constants";
import type { InquiryRow, Slot } from "@/lib/client-types";
import { ArrowLeft, PauseCircle, PlayCircle, MessageSquare, Ban, CalendarClock, Send, FilePlus2 } from "lucide-react";

type Detail = { inquiry: InquiryRow & {
  contact: InquiryRow["contact"] & { consent?: { id: string; channel: string; granted: boolean; basis: string; wordingVersion: string; sourceLabel: string; recordedAt: string }[] };
  appointments: { id: string; startAt: string; endAt: string; status: string; estimatorId?: string | null; manageToken: string; bookedBy: string; outcomeNote?: string | null; timezone: string }[];
  estimates: { id: string; number: string; amount: string; currency: string; status: string; sentAt?: string | null; acceptedAt?: string | null; followUpPausedAt?: string | null; createdAt: string }[];
  tasks: { id: string; kind: string; title: string; detail?: string | null; dueAt: string; status: string; assignedUserId?: string | null }[];
  activities: { id: string; actorType: string; actorLabel: string; kind: string; message: string; createdAt: string }[];
  touchpoints: { id: string; kind: string; label: string; occurredAt: string }[];
  outbox: { id: string; templateKey: string; channel: string; status: string; scheduledFor: string; sentAt?: string | null; stoppedReason?: string | null; body: string }[];
  payments: { id: string; amount: string; currency: string; kind: string; provider: string; status: string; providerTxnId: string }[];
}};

function RescheduleDialog({ apptId, currentTz, onDone }: { apptId: string; currentTz: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { data, loading } = useApi<{ slots: Slot[] }>(open ? `/api/availability?inquiryId=${apptId ? "" : ""}` : null);
  void data; void loading;
  // availability is fetched by the appointment reschedule flow below via slots endpoint scoped to inquiry
  return null;
}

export function InquiryDetailView({ id }: { id: string }) {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const tz = session?.contractors?.find((c) => c.id === contractorId)?.timezone ?? "America/Chicago";
  const role = roleAt(session, contractorId);
  const canManage = role !== "ESTIMATOR";
  const isDemo = session?.contractors?.find((c) => c.id === contractorId)?.runMode === "demo";
  const { data, loading, error, refresh } = useApi<Detail>(`/api/inquiries/${id}`);
  const [note, setNote] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [newEstAmount, setNewEstAmount] = useState("");

  if (loading) return <div className="mt-6"><SkeletonRows rows={8} /></div>;
  if (error || !data) return <EmptyState title="Inquiry unavailable" hint={error ?? "Not found"} action={<Button variant="outline" onClick={() => navigate("/inquiries")}>Back</Button>} />;

  const inq = data.inquiry;
  const contact = inq.contact;
  const activeAppt = inq.appointments.find((a) => a.status === "BOOKED");
  const latestEst = inq.estimates[0];
  const name = `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim();
  const nowIso = new Date().toISOString();

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const fetchSlots = async () => {
    const res = await api.get<{ slots: Slot[] }>(`/api/availability?inquiryId=${inq.id}`);
    setSlots(res.slots);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => navigate("/inquiries")}><ArrowLeft className="h-4 w-4" /> Inquiries</Button>
        <h1 className="text-xl font-bold tracking-tight">{name}</h1>
        <StageBadge stage={inq.automationPaused ? "PAUSED" : inq.stage} />
        {inq.isDuplicate && <span className="text-xs uppercase text-muted-foreground">duplicate</span>}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {canManage && (
            <Select
              value={inq.ownerUserId || "none"}
              onValueChange={(v) => void act(async () => {
                await api.patch(`/api/inquiries?id=${inq.id}`, { ownerUserId: v === "none" ? null : v });
              }, "Owner updated")}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Assign owner"><SelectValue placeholder="Owner" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                <TeamOptions />
              </SelectContent>
            </Select>
          )}
          {canManage && (
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                  {inq.automationPaused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
                  {inq.automationPaused ? "Resume automation" : "Pause automation"}
                </Button>
              }
              title={inq.automationPaused ? "Resume automation?" : "Pause automation?"}
              description={inq.automationPaused
                ? "Scheduled messages resume under the playbooks; staff-taken state is kept."
                : "Scheduled outbound messages stop immediately and the conversation is owned by staff. Changes are recorded in the activity trail."}
              confirmLabel={inq.automationPaused ? "Resume" : "Pause"}
              onConfirm={async () => {
                await api.patch(`/api/inquiries?id=${inq.id}`, { paused: !inq.automationPaused });
                toast(inq.automationPaused ? "Automation resumed" : "Automation paused — scheduled sends stopped");
                refresh();
              }}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Appointment */}
          <section className="rounded-xl border bg-card">
            <header className="flex items-center gap-2 border-b px-4 py-3"><CalendarClock className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Inspection</h2></header>
            <div className="p-4 space-y-3">
              {inq.appointments.length === 0 ? (
                <EmptyState
                  title="No inspection booked yet"
                  hint={contact?.smsConsent ? "The booking link went out via text; the customer self-books." : "No SMS permission — call the customer and book from here."}
                  action={canManage && (
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void fetchSlots()}><CalendarClock className="h-3.5 w-3.5" /> Show available times</Button>
                  )}
                />
              ) : (
                <Row>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span suppressHydrationWarning className="font-medium">{fmtDateTimeTz(new Date(inq.appointments[0].startAt), inq.appointments[0].timezone || tz)}</span>
                      <ApptStatusBadge status={inq.appointments[0].status} />
                      <span className="text-[10px] uppercase text-muted-foreground">{inq.appointments[0].bookedBy === "CUSTOMER" ? "self-booked" : "office-booked"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {contact?.addressLine1 ?? "address on file"} · {contact?.city}, {contact?.state} {contact?.zip}
                      {inq.appointments[0].outcomeNote ? ` · ${inq.appointments[0].outcomeNote}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => window.open(`${window.location.origin}/#/public/manage/${inq.appointments[0].manageToken}`, "_blank")}>
                      Customer link
                    </Button>
                    {inq.appointments[0].status === "BOOKED" && canManage && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void fetchSlots()}>Reschedule…</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/appointments/${inq.appointments[0].id}`, { status: "COMPLETED" }), "Visit completed — office notified")}>Complete</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/appointments/${inq.appointments[0].id}`, { status: "NO_SHOW" }), "Marked no-show")}>No-show</Button>
                        <ConfirmDialog
                          trigger={<Button size="sm" variant="ghost" className="h-7 text-xs gap-1"><Ban className="h-3 w-3" /> Cancel</Button>}
                          title="Cancel this inspection?" description="The reminder stops and the office gets a rebook task." confirmLabel="Cancel inspection" destructive
                          onConfirm={async () => { await api.patch(`/api/appointments/${inq.appointments[0].id}`, { status: "CANCELED" }); toast("Inspection canceled"); refresh(); }}
                        />
                      </>
                    )}
                  </div>
                </Row>
              )}
              {slots && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold">Available times ({tzAbbr(new Date(), tz)})</span>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSlots(null)}>Close</Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {slots.slice(0, 12).map((s) => (
                      <button key={s.start} suppressHydrationWarning
                        className="rounded-md border px-2 py-1.5 text-xs hover:bg-primary hover:text-primary-foreground transition-colors min-h-[36px]"
                        onClick={() => {
                          const target = activeAppt ? activeAppt.id : null;
                          setSlots(null);
                          if (target) {
                            void act(() => api.patch(`/api/appointments/${target}`, { startAt: s.start }), "Rescheduled — reminder recalculated");
                          } else {
                            void act(() => api.post("/api/appointments", { inquiryId: inq.id, startAt: s.start }), "Inspection booked");
                          }
                        }}
                      >
                        {fmtDateTimeTz(new Date(s.start), tz)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Estimates */}
          <section className="rounded-xl border bg-card">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Estimates</h2>
              {inq.quotedValue && <span className="text-xs text-muted-foreground">quoted {fmtMoney(inq.quotedValue)}</span>}
              {inq.acceptedValue && <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">accepted {fmtMoney(inq.acceptedValue)}</span>}
            </header>
            <div className="p-4 space-y-3">
              {inq.estimates.length === 0 ? (
                <EmptyState title="No estimate yet" hint="After the visit, prepare a quote here. Sending it starts the follow-up ladder." />
              ) : (
                <div className="space-y-2">
                  {inq.estimates.map((e) => (
                    <Row key={e.id}>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{e.number}</span>
                          <EstimateStatusBadge status={e.status} />
                          <span className="font-medium">{fmtMoney(e.amount, e.currency)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
                          {e.sentAt ? `sent ${fmtDate(e.sentAt, tz)}` : "not sent yet"}
                          {e.acceptedAt ? ` · accepted ${fmtDate(e.acceptedAt, tz)}` : ""}
                          {e.followUpPausedAt ? " · chase paused" : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {e.status === "DRAFT" && canManage && (
                          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "SENT" }), "Estimate sent — follow-up ladder scheduled")}>
                            <Send className="h-3 w-3" /> Send
                          </Button>
                        )}
                        {e.status === "SENT" && canManage && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "VIEWED" }), "Marked viewed")}>Mark viewed</Button>
                        )}
                        {(e.status === "SENT" || e.status === "VIEWED") && canManage && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "ACCEPTED" }), "Accepted — inquiry won, chase stopped")}>Accept</Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "DECLINED", reason: "Declined by customer" }), "Declined")}>Decline</Button>
                          </>
                        )}
                        {(e.status === "ACCEPTED" || e.status === "VIEWED" || e.status === "SENT") && canManage && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "INVOICED" }), "Invoiced — acceptance evidence kept")}>Invoice</Button>
                        )}
                      </div>
                    </Row>
                  ))}
                </div>
              )}
              {canManage && latestEst?.status === "DRAFT" && (
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="est-amt" className="text-xs">Adjust draft amount ({latestEst.currency})</Label>
                    <Input id="est-amt" type="number" min="0" className="w-40" value={newEstAmount} onChange={(e) => setNewEstAmount(e.target.value)} placeholder={latestEst.amount} />
                  </div>
                  <Button size="sm" variant="outline" disabled={!newEstAmount}
                    onClick={() => void act(() => api.patch(`/api/estimates?id=${latestEst.id}`, { amount: parseFloat(newEstAmount) }), "Amount updated")}>
                    Update
                  </Button>
                </div>
              )}
              {canManage && inq.estimates.length === 0 && (inq.stage === "INSPECTED" || inq.stage === "BOOKED") && (
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="new-est" className="text-xs">New draft estimate (USD)</Label>
                    <Input id="new-est" type="number" min="0" className="w-40" value={newEstAmount} onChange={(e) => setNewEstAmount(e.target.value)} placeholder="9800" />
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={!newEstAmount}
                    onClick={() => void act(() => api.post("/api/estimates", { inquiryId: inq.id, amount: parseFloat(newEstAmount) }), "Draft created")}>
                    <FilePlus2 className="h-3.5 w-3.5" /> Create draft
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Activity timeline */}
          <section className="rounded-xl border bg-card">
            <header className="flex items-center gap-2 border-b px-4 py-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Activity</h2>
              <span className="text-xs text-muted-foreground">every entry is labelled staff, automation, provider or customer</span>
            </header>
            <div className="p-4">
              {inq.activities.length === 0 ? (
                <EmptyState title="No activity yet" />
              ) : (
                <ol className="relative space-y-3 border-l pl-4 ml-1.5">
                  {[...inq.activities].map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary/60" aria-hidden />
                      <div className="flex flex-wrap items-center gap-2">
                        <ActorChip type={a.actorType} />
                        <span className="text-xs font-medium">{a.actorLabel}</span>
                        <span suppressHydrationWarning className="text-[11px] text-muted-foreground">{fmtDateTimeTz(new Date(a.createdAt), tz)}</span>
                      </div>
                      <p className="mt-0.5 text-sm">{a.message}</p>
                    </li>
                  ))}
                </ol>
              )}
              {canManage && (
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!note.trim()) return;
                    void act(() => api.patch(`/api/inquiries?id=${inq.id}`, { note: note.trim() }), "Note added").then(() => setNote(""));
                  }}
                >
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team…" className="min-h-[44px]" aria-label="Add note" />
                  <Button type="submit" size="sm" disabled={!note.trim()}>Add</Button>
                </form>
              )}
            </div>
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Contact</h2>
            <dl className="grid grid-cols-1 gap-2.5">
              <Def label="Phone">{contact?.phone ?? "—"}</Def>
              <Def label="Email">{contact?.email ?? "—"}</Def>
              <Def label="Service address">{[contact?.addressLine1, contact?.city, contact?.state].filter(Boolean).join(", ") || "—"}</Def>
              <Def label="Service / ZIP">{SERVICE_TYPE_LABELS[inq.serviceType] ?? inq.serviceType} · {inq.serviceZip}</Def>
              <Def label="Preferred channel">{contact?.preferredChannel ?? "—"}</Def>
              <Def label="First known source">{SOURCE_LABELS[inq.firstSource] ?? inq.firstSource}</Def>
            </dl>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Communication permissions</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>SMS</span>
                {contact?.optedOut
                  ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">OPTED OUT</span>
                  : contact?.smsConsent
                    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">PERMITTED</span>
                    : <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300">NO CONSENT — office route</span>}
              </div>
              {contact?.consent?.map((c) => (
                <div key={c.id} suppressHydrationWarning className="text-[11px] text-muted-foreground">
                  {c.granted ? "Granted" : "Revoked"} · {c.channel} · basis {c.basis.toLowerCase().replace("_", " ")} · wording {c.wordingVersion} · {c.sourceLabel} · {fmtDate(c.recordedAt, tz)}
                </div>
              ))}
              {isDemo && canManage && contact && !contact.optedOut && (
                <ConfirmDialog
                  trigger={<Button size="sm" variant="outline" className="h-7 text-xs w-full">Demo: customer replies STOP</Button>}
                  title="Simulate opt-out?" description="Revokes SMS permission, cancels every scheduled message and creates a staff task."
                  confirmLabel="Opt out" destructive
                  onConfirm={async () => { await api.post("/api/demo", { action: "simulate-optout", contactId: contact.id }); toast("Opt-out processed — scheduled sends stopped"); refresh(); }}
                />
              )}
            </div>
          </section>

          {inq.tasks.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-semibold mb-3">Open tasks</h2>
              <div className="space-y-2">
                {inq.tasks.filter((t) => t.status === "OPEN").map((t) => (
                  <Row key={t.id}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-[11px] text-muted-foreground">{TASK_KIND_LABELS[t.kind]} · <span suppressHydrationWarning>due {relativeDue(t.dueAt, new Date(nowIso))} ({fmtTime(t.dueAt, tz)} {tzAbbr(new Date(t.dueAt), tz)})</span></div>
                    </div>
                    {canManage && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/tasks?id=${t.id}`, { complete: true }), "Task completed")}>Done</Button>}
                  </Row>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold mb-3">Automation queue <span className="text-xs font-normal text-muted-foreground">(provider-synced)</span></h2>
            {inq.outbox.length === 0 ? (
              <p className="text-xs text-muted-foreground">No scheduled or sent messages for this inquiry.</p>
            ) : (
              <div className="space-y-1.5">
                {inq.outbox.slice(0, 8).map((m) => (
                  <div key={m.id} className="rounded-md border px-2.5 py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">{m.templateKey.replace(/_/g, " ").toLowerCase()}</span>
                      <span className={`text-[10px] font-semibold uppercase ${m.status === "SENT" ? "text-emerald-700 dark:text-emerald-300" : m.status === "CANCELED" ? "text-stone-500" : "text-sky-700 dark:text-sky-300"}`}>
                        {m.status.toLowerCase()}
                      </span>
                      <span suppressHydrationWarning className="text-[11px] text-muted-foreground">{m.sentAt ? fmtDateTimeTz(new Date(m.sentAt), tz) : `for ${fmtDateTimeTz(new Date(m.scheduledFor), tz)}`}</span>
                    </div>
                    {m.stoppedReason && <div className="text-[11px] text-muted-foreground mt-0.5">Stopped: {m.stoppedReason}</div>}
                  </div>
                ))}
                {inq.payments.length > 0 && (
                  <div className="pt-2 text-xs text-muted-foreground">
                    Payments: {inq.payments.map((p) => `${p.kind === "REFUND" ? "−" : "+"}$${p.amount} ${p.provider}`).join(", ")}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function TeamOptions() {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const { data } = useApi<{ team: { userId: string; name: string; role: string }[] }>(contractorId ? `/api/contractors/${contractorId}` : null);
  return <>{data?.team.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.name} · {m.role.toLowerCase()}</SelectItem>)}</>;
}
