import { db } from "@/lib/db";
import { demoNow } from "@/lib/democlock";
import { withinWindow, nextWindowStart, tzParts, wallToUtc, localDayKey, type WorkHours } from "@/lib/time";
import { getAdapter } from "@/lib/providers";
import {
  bookingLinkBody, missedYouBody, confirmationBody, reminderBody, rescheduleBody, noShowBody, followUpBody, digestBody,
} from "@/lib/templates";

/**
 * Automation engine. In this deployment the worker runs in-process (a Postgres-backed queue
 * such as River replaces the interval when the Go/worker split is enabled — see README).
 * Every send re-checks eligibility immediately before dispatch, so a reply, opt-out, manual
 * pause or decision that arrives before the send wins the race. Unique dedupe keys make
 * overlapping triggers (calendar notification + workflow + retry) produce exactly one message.
 */

type TickResult = { sent: number; canceled: number; deferred: number; digests: number };

function parseHours(json: string): WorkHours {
  try {
    const parsed = JSON.parse(json) as WorkHours;
    if (parsed && typeof parsed === "object") return parsed;
  } catch { /* fallthrough */ }
  return { mon: ["08:00", "17:00"], tue: ["08:00", "17:00"], wed: ["08:00", "17:00"], thu: ["08:00", "17:00"], fri: ["08:00", "17:00"], sat: null, sun: null };
}

function serviceLabel(t: string): string {
  return t === "REPAIR" ? "roof repair" : t === "INSPECTION" ? "roof inspection" : "roof replacement";
}

function base(): string {
  return process.env.APP_BASE_URL || "http://localhost:3000";
}

async function officeUserId(contractorId: string): Promise<string | null> {
  const m = await db.membership.findFirst({
    where: { contractorId, isActive: true, role: { in: ["OWNER", "OFFICE"] } },
    orderBy: { role: "asc" },
  });
  return m?.userId ?? null;
}

// ─────────────────────────── dispatch + stop rules ───────────────────────────

async function dispatchMessage(msgId: string, now: Date): Promise<"sent" | "canceled" | "deferred" | "skip"> {
  const msg = await db.outboxMessage.findUnique({
    where: { id: msgId },
    include: { contact: true, inquiry: { include: { appointments: { orderBy: { createdAt: "desc" } } } }, contractor: true },
  });
  if (!msg || msg.status !== "SCHEDULED") return "skip";
  const contractor = msg.contractor;
  const hours = parseHours(contractor.workingHours);

  const cancel = async (reason: string) => {
    await db.outboxMessage.update({ where: { id: msg.id }, data: { status: "CANCELED", stoppedReason: reason } });
    if (msg.inquiryId) {
      await db.activity.create({
        data: {
          contractorId: contractor.id, inquiryId: msg.inquiryId,
          actorType: "AUTOMATION", actorLabel: "Playbook",
          kind: "MESSAGE",
          message: `Stopped "${msg.templateKey.replace(/_/g, " ").toLowerCase()}": ${reason}`,
        },
      });
    }
    return "canceled" as const;
  };

  if (msg.templateKey !== "DIGEST") {
    const contact = msg.contact;
    if (!contact) return cancel("Contact missing");
    if (contact.optedOut) return cancel("Contact opted out");
    if (msg.channel === "SMS" && !contact.smsConsent) {
      // No permission to message → route to the office instead.
      await db.task.create({
        data: {
          contractorId: contractor.id, inquiryId: msg.inquiryId,
          kind: "RESPOND", title: `Contact ${contact.firstName} ${contact.lastName} — no SMS permission`,
          detail: "Automated message suppressed; reach out manually.", dueAt: new Date(now.getTime() + 2 * 3600_000),
          createdBy: "AUTOMATION", assignedUserId: await officeUserId(contractor.id),
        },
      });
      return cancel("No SMS permission — routed to office");
    }
    if (msg.channel === "EMAIL" && msg.templateKey !== "DIGEST" && !contact.emailConsent) return cancel("No email permission");
    if (msg.inquiry?.automationPaused) return cancel("Automation paused by staff");

    const inquiry = msg.inquiry;
    const appt = inquiry?.appointments?.[0];

    if (msg.templateKey === "BOOKING_LINK") {
      if (appt && appt.status !== "CANCELED") return cancel("Appointment already booked");
      if (inquiry && ["BOOKED", "INSPECTED", "QUOTED", "WON", "LOST"].includes(inquiry.stage)) {
        return cancel("Inquiry moved past booking");
      }
    }
    if (msg.templateKey === "REMINDER") {
      if (!appt || appt.status !== "BOOKED") return cancel("Appointment no longer active");
    }
    if (msg.templateKey === "NO_SHOW_FOLLOW_UP") {
      if (!appt || appt.status !== "NO_SHOW") return cancel("Appointment state changed");
    }
    if (msg.templateKey === "FOLLOW_UP" && inquiry) {
      const est = await db.estimate.findFirst({ where: { inquiryId: inquiry.id, status: { not: "DRAFT" } }, orderBy: { sentAt: "desc" } });
      if (est) {
        if (["ACCEPTED", "DECLINED", "INVOICED"].includes(est.status)) return cancel("Estimate decided");
        if (est.followUpPausedAt) return cancel("Chase paused by staff");
      }
      const reply = await db.touchpoint.findFirst({ where: { inquiryId: inquiry.id, kind: "REPLY", occurredAt: { gt: msg.createdAt } } });
      if (reply) return cancel("Customer replied");
    }
    // Contact window: defer to the next window instead of sending outside hours.
    if (!withinWindow(now, contractor.timezone, hours)) {
      const next = nextWindowStart(now, contractor.timezone, hours);
      await db.outboxMessage.update({ where: { id: msg.id }, data: { scheduledFor: next, attempts: { increment: 1 } } });
      return "deferred";
    }
  }

  // Deliver via the provider adapter (simulated in demo mode).
  try {
    const install = await db.providerInstall.findUnique({
      where: { contractorId_provider: { contractorId: contractor.id, provider: "GHL" } },
    });
    const adapter = getAdapter(contractor.runMode, { accessToken: install?.accessTokenEnc, locationId: install?.locationId });
    const to = msg.channel === "SMS" ? msg.contact?.phone ?? "" : msg.contact?.email ?? (msg.templateKey === "DIGEST" ? "office@local" : "");
    const { providerMessageId } = await adapter.sendMessage({ channel: msg.channel as "SMS" | "EMAIL", to, subject: msg.subject ?? undefined, body: msg.body });
    await db.outboxMessage.update({
      where: { id: msg.id },
      data: { status: "SENT", sentAt: now, providerMessageId },
    });
    if (msg.inquiryId) {
      await db.activity.create({
        data: {
          contractorId: contractor.id, inquiryId: msg.inquiryId,
          actorType: "AUTOMATION", actorLabel: msg.channel === "SMS" ? "SMS" : "Email",
          kind: "MESSAGE",
          message: `Sent ${msg.channel === "SMS" ? "text" : "email"} (${msg.templateKey.replace(/_/g, " ").toLowerCase()}) to ${msg.contact?.firstName ?? "office"}`,
          meta: JSON.stringify({ preview: msg.body.slice(0, 120) }),
        },
      });
    }
    return "sent";
  } catch (e) {
    const attempts = msg.attempts + 1;
    if (attempts >= 5) {
      await db.outboxMessage.update({ where: { id: msg.id }, data: { status: "FAILED", attempts, stoppedReason: (e as Error).message } });
      return "canceled";
    }
    await db.outboxMessage.update({
      where: { id: msg.id },
      data: { attempts, scheduledFor: new Date(now.getTime() + 5 * 60_000) },
    });
    return "deferred";
  }
}

// ─────────────────────────── morning digest ───────────────────────────

async function generateDueDigests(now: Date): Promise<number> {
  const contractors = await db.contractor.findMany({ where: { pbMorningDigest: true, activatedAt: { not: null } } });
  let count = 0;
  for (const c of contractors) {
    const p = tzParts(now, c.timezone);
    const todayOpen = wallToUtc(c.timezone, p.year, p.month, p.day, 8, 0);
    if (now < todayOpen) continue;
    const key = `digest:${c.id}:${localDayKey(now, c.timezone)}`;
    const exists = await db.outboxMessage.findUnique({ where: { dedupeKey: key } });
    if (exists) continue;
    const overdue = await db.task.count({ where: { contractorId: c.id, status: "OPEN", dueAt: { lt: now } } });
    const dayStart = wallToUtc(c.timezone, p.year, p.month, p.day, 0, 0);
    const dayEnd = wallToUtc(c.timezone, p.year, p.month, p.day, 23, 59);
    const inspectionsToday = await db.appointment.count({ where: { contractorId: c.id, status: "BOOKED", startAt: { gte: dayStart, lte: dayEnd } } });
    const aging = await db.estimate.count({ where: { contractorId: c.id, status: { in: ["SENT", "VIEWED"] }, sentAt: { lt: new Date(now.getTime() - 3 * 86400000) } } });
    await db.outboxMessage.create({
      data: {
        contractorId: c.id, channel: "EMAIL", templateKey: "DIGEST",
        subject: `Morning digest — ${overdue} overdue, ${inspectionsToday} inspections today`,
        body: digestBody({ overdue, inspectionsToday, agingEstimates: aging }, c, localDayKey(now, c.timezone)),
        scheduledFor: now, status: "SCHEDULED", dedupeKey: key,
      },
    });
    await dispatchMessage((await db.outboxMessage.findUnique({ where: { dedupeKey: key } }))!.id, now);
    count++;
  }
  return count;
}

// ─────────────────────────── tick + scheduler ───────────────────────────

export async function runEngineTick(): Promise<TickResult> {
  const now = await demoNow();
  const due = await db.outboxMessage.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });
  let sent = 0, canceled = 0, deferred = 0;
  for (const m of due) {
    const r = await dispatchMessage(m.id, now);
    if (r === "sent") sent++;
    else if (r === "canceled") canceled++;
    else if (r === "deferred") deferred++;
  }
  const digests = await generateDueDigests(now);
  return { sent, canceled, deferred, digests };
}

const g = globalThis as unknown as { __rl_engine?: NodeJS.Timeout };

export function ensureEngine(): void {
  if (g.__rl_engine) return;
  g.__rl_engine = setInterval(() => {
    runEngineTick().catch((e) => console.error("[engine] tick failed", e));
  }, 15000);
}

// ─────────────────────────── event hooks (called from API routes) ───────────────────────────

export async function scheduleExperimentEnrollment(contractorId: string, contactId: string, inquiryId: string | null, isTest: boolean): Promise<void> {
  const exp = await db.experiment.findFirst({ where: { contractorId, status: "RUNNING" } });
  if (!exp || isTest) return;
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact?.smsConsent || contact.optedOut) return;
  const existing = await db.experimentAssignment.findUnique({
    where: { experimentId_contactId: { experimentId: exp.id, contactId } },
  });
  if (existing) {
    if (!existing.inquiryId && inquiryId) {
      await db.experimentAssignment.update({ where: { id: existing.id }, data: { inquiryId } });
    }
    return; // idempotent: one designated inquiry per contact
  }
  // deterministic arm: hash(experimentId + contactId)
  const { createHash } = await import("node:crypto");
  const h = createHash("sha256").update(`${exp.id}:${contactId}`).digest();
  const arm = h[0] % 2 === 0 ? "A" : "B";
  await db.experimentAssignment.create({
    data: { experimentId: exp.id, contactId, inquiryId, arm, enrolledAt: await demoNow() },
  });
}

export async function onInquiryCreated(inquiryId: string): Promise<void> {
  const inquiry = await db.inquiry.findUnique({ where: { id: inquiryId }, include: { contact: true, contractor: true } });
  if (!inquiry) return;
  const now = await demoNow();
  const c = inquiry.contractor;
  const contact = inquiry.contact;
  const hours = parseHours(c.workingHours);

  await db.touchpoint.create({
    data: {
      contractorId: c.id, inquiryId: inquiry.id, kind: "SOURCE",
      label: `First known source: ${inquiry.firstSource.replace(/_/g, " ").toLowerCase()}`,
      occurredAt: inquiry.createdAt,
    },
  });
  if (contact.smsConsent) {
    await db.touchpoint.create({
      data: {
        contractorId: c.id, inquiryId: inquiry.id, kind: "CONSENT",
        label: "SMS permission recorded (web form, wording v1)",
        occurredAt: inquiry.createdAt,
      },
    });
  }

  const svc = serviceLabel(inquiry.serviceType);

  if (inquiry.source === "PHONE_MISSED" && c.pbMissedCall) {
    const dueAt = new Date(now.getTime() + c.callbackDueHours * 3600_000);
    const existingTask = await db.task.findFirst({ where: { contractorId: c.id, inquiryId: inquiry.id, kind: "CALLBACK", status: "OPEN", dedupeKey: `callback:${inquiry.id}` } });
    if (!existingTask) {
      await db.task.create({
        data: {
          contractorId: c.id, inquiryId: inquiry.id, kind: "CALLBACK",
          title: `Call ${contact.firstName} ${contact.lastName} — missed call`,
          detail: `${svc} request, ZIP ${inquiry.serviceZip}.`,
          dueAt, createdBy: "AUTOMATION", assignedUserId: await officeUserId(c.id),
          dedupeKey: `callback:${inquiry.id}`,
        },
      });
    }
    if (contact.smsConsent && !contact.optedOut) {
      await db.outboxMessage.create({
        data: {
          contractorId: c.id, inquiryId: inquiry.id, contactId: contact.id,
          channel: "SMS", templateKey: "MISSED_YOU",
          body: missedYouBody(contact, c, base(), inquiry.publicToken),
          scheduledFor: new Date(now.getTime() + 60_000),
          status: "SCHEDULED", dedupeKey: `missedyou:${inquiry.id}`,
        },
      });
    }
    return;
  }

  if (c.pbNewInquiry && contact.smsConsent && !contact.optedOut) {
    const scheduledFor = new Date(now.getTime() + 2 * 60_000);
    await db.outboxMessage.create({
      data: {
        contractorId: c.id, inquiryId: inquiry.id, contactId: contact.id,
        channel: "SMS", templateKey: "BOOKING_LINK",
        body: bookingLinkBody(contact, inquiry.serviceType, c, base(), inquiry.publicToken),
        scheduledFor, status: "SCHEDULED",
        dedupeKey: `booklink:${inquiry.id}`,
      },
    });
    await db.activity.create({
      data: {
        contractorId: c.id, inquiryId: inquiry.id,
        actorType: "AUTOMATION", actorLabel: "Playbook", kind: "MESSAGE",
        message: `Booking link scheduled (next contact window: ${withinWindow(scheduledFor, c.timezone, hours) ? "now" : "next opening"})`,
      },
    });
  } else {
    await db.task.create({
      data: {
        contractorId: c.id, inquiryId: inquiry.id, kind: "RESPOND",
        title: `Respond to ${contact.firstName} ${contact.lastName} — ${svc}`,
        detail: contact.smsConsent ? "Auto booking link unavailable." : "No SMS permission on file — call the customer.",
        dueAt: new Date(now.getTime() + c.callbackDueHours * 3600_000),
        createdBy: "AUTOMATION", assignedUserId: await officeUserId(c.id),
        dedupeKey: `respond:${inquiry.id}`,
      },
    });
  }

  await scheduleExperimentEnrollment(c.id, contact.id, inquiry.id, inquiry.isTest);
}

export async function onAppointmentBooked(apptId: string): Promise<void> {
  const appt = await db.appointment.findUnique({ where: { id: apptId }, include: { inquiry: { include: { contact: true, contractor: true } } } });
  if (!appt) return;
  const now = await demoNow();
  const c = appt.inquiry.contractor;
  const contact = appt.inquiry.contact;

  // Any booking (customer or office) stops lead-to-book outreach.
  await db.outboxMessage.updateMany({
    where: { inquiryId: appt.inquiryId, status: "SCHEDULED", templateKey: { in: ["BOOKING_LINK", "MISSED_YOU", "NO_SHOW_FOLLOW_UP"] } },
    data: { status: "CANCELED", stoppedReason: "Appointment booked" },
  });
  if (["NEW", "RESPONDING"].includes(appt.inquiry.stage)) {
    await db.inquiry.update({ where: { id: appt.inquiryId }, data: { stage: "BOOKED" } });
    await db.activity.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId,
        actorType: appt.bookedBy === "CUSTOMER" ? "CUSTOMER" : "STAFF",
        actorLabel: appt.bookedBy === "CUSTOMER" ? `${contact.firstName} (self-booking)` : "Office",
        kind: "APPOINTMENT",
        message: `Inspection booked for ${appt.startAt.toISOString()}`,
      },
    });
  }
  // tasks created for this inquiry are handled by the booking
  await db.task.updateMany({ where: { inquiryId: appt.inquiryId, kind: { in: ["CALLBACK", "RESPOND"] }, status: "OPEN" }, data: { status: "DONE", completedAt: now } });

  if (contact.smsConsent && !contact.optedOut) {
    await db.outboxMessage.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId, contactId: contact.id,
        channel: "SMS", templateKey: "CONFIRMATION",
        body: confirmationBody(contact, `${fmtWhen(appt.startAt, c.timezone)}`, c, appt.inquiry.contact.addressLine1 ?? "your address"),
        scheduledFor: new Date(now.getTime() + 30_000),
        status: "SCHEDULED", dedupeKey: `confirm:${appt.id}`,
      },
    });
  }
  await scheduleReminder(appt.id);
}

export async function scheduleReminder(apptId: string): Promise<void> {
  const appt = await db.appointment.findUnique({ where: { id: apptId }, include: { inquiry: { include: { contact: true, contractor: true } } } });
  if (!appt || appt.status !== "BOOKED") return;
  const c = appt.inquiry.contractor;
  if (!c.pbReminder) return;
  const now = await demoNow();
  // exactly one active reminder per appointment: cancel previous, schedule the new one
  await db.outboxMessage.updateMany({
    where: { inquiryId: appt.inquiryId, status: "SCHEDULED", templateKey: "REMINDER" },
    data: { status: "CANCELED", stoppedReason: "Appointment changed — reminder recalculated" },
  });
  const reminderAt = new Date(appt.startAt.getTime() - c.reminderHoursBefore * 3600_000);
  if (reminderAt <= now) return;
  await db.outboxMessage.create({
    data: {
      contractorId: c.id, inquiryId: appt.inquiryId, contactId: appt.inquiry.contact.id,
      channel: "SMS", templateKey: "REMINDER",
      body: reminderBody(appt.inquiry.contact, `${fmtWhen(appt.startAt, c.timezone)}`, c, appt.inquiry.contact.addressLine1 ?? "your address"),
      scheduledFor: reminderAt,
      status: "SCHEDULED",
      dedupeKey: `rem:${appt.id}`,
    },
  });
}

export async function onAppointmentRescheduled(apptId: string): Promise<void> {
  const appt = await db.appointment.findUnique({ where: { id: apptId }, include: { inquiry: { include: { contact: true, contractor: true } } } });
  if (!appt) return;
  const now = await demoNow();
  const c = appt.inquiry.contractor;
  await scheduleReminder(apptId);
  const contact = appt.inquiry.contact;
  if (contact.smsConsent && !contact.optedOut) {
    await db.outboxMessage.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId, contactId: contact.id,
        channel: "SMS", templateKey: "RESCHEDULE_CONFIRM",
        body: rescheduleBody(contact, `${fmtWhen(appt.startAt, c.timezone)}`, c),
        scheduledFor: new Date(now.getTime() + 30_000),
        status: "SCHEDULED", dedupeKey: `resched:${appt.id}:${appt.startAt.getTime()}`,
      },
    });
  }
  await db.activity.create({
    data: {
      contractorId: c.id, inquiryId: appt.inquiryId,
      actorType: "CUSTOMER", actorLabel: `${contact.firstName} (self-serve)`,
      kind: "APPOINTMENT", message: `Rescheduled to ${fmtWhen(appt.startAt, c.timezone)}`,
    },
  });
}

function fmtWhen(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

export async function onAppointmentStatusChanged(apptId: string, status: string, note?: string): Promise<void> {
  const appt = await db.appointment.findUnique({ where: { id: apptId }, include: { inquiry: { include: { contact: true, contractor: true } } } });
  if (!appt) return;
  const now = await demoNow();
  const c = appt.inquiry.contractor;
  const contact = appt.inquiry.contact;

  await db.outboxMessage.updateMany({
    where: { inquiryId: appt.inquiryId, status: "SCHEDULED", templateKey: "REMINDER" },
    data: { status: "CANCELED", stoppedReason: "Appointment no longer active" },
  });

  if (status === "COMPLETED") {
    await db.inquiry.update({ where: { id: appt.inquiryId }, data: { stage: "INSPECTED" } });
    await db.task.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId, kind: "PREPARE_QUOTE",
        title: `Prepare & send estimate — ${contact.firstName} ${contact.lastName}`,
        detail: note ? `Visit notes: ${note}` : "Visit completed; prepare the quote.",
        dueAt: nextWindowStart(new Date(now.getTime() + 86400000), c.timezone, parseHours(c.workingHours)),
        createdBy: "AUTOMATION", assignedUserId: await officeUserId(c.id),
        dedupeKey: `prepquote:${appt.id}`,
      },
    });
    await db.activity.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId, actorType: "STAFF", actorLabel: "Estimator",
        kind: "APPOINTMENT", message: `Visit completed${note ? ` — ${note}` : ""}. Hand-off: office sends the quote.`,
      },
    });
  }
  if (status === "NO_SHOW") {
    await db.task.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId, kind: "FOLLOW_UP",
        title: `No-show recovery — ${contact.firstName} ${contact.lastName}`,
        detail: "Customer missed the inspection; rebook or close out.",
        dueAt: new Date(now.getTime() + 4 * 3600_000),
        createdBy: "AUTOMATION", assignedUserId: await officeUserId(c.id),
        dedupeKey: `noshow:${appt.id}`,
      },
    });
    if (c.pbNoShow && contact.smsConsent && !contact.optedOut) {
      await db.outboxMessage.create({
        data: {
          contractorId: c.id, inquiryId: appt.inquiryId, contactId: contact.id,
          channel: "SMS", templateKey: "NO_SHOW_FOLLOW_UP",
          body: noShowBody(contact, c, base(), appt.inquiry.publicToken),
          scheduledFor: new Date(now.getTime() + 30 * 60_000),
          status: "SCHEDULED", dedupeKey: `noshowmsg:${appt.id}`,
        },
      });
    }
    await db.activity.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId, actorType: "STAFF", actorLabel: "Estimator",
        kind: "APPOINTMENT", message: "Marked as no-show",
      },
    });
  }
  if (status === "CANCELED") {
    await db.inquiry.update({ where: { id: appt.inquiryId }, data: { stage: "RESPONDING" } });
    await db.task.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId, kind: "RESPOND",
        title: `Inspection canceled — rebook ${contact.firstName} ${contact.lastName}`,
        detail: "Offer fresh times or close out the inquiry.",
        dueAt: new Date(now.getTime() + 4 * 3600_000),
        createdBy: "AUTOMATION", assignedUserId: await officeUserId(c.id),
      },
    });
    await db.activity.create({
      data: {
        contractorId: c.id, inquiryId: appt.inquiryId, actorType: "CUSTOMER", actorLabel: "Customer",
        kind: "APPOINTMENT", message: "Inspection canceled via self-serve link",
      },
    });
  }
}

export async function onEstimateSent(estimateId: string): Promise<void> {
  const est = await db.estimate.findUnique({ where: { id: estimateId }, include: { inquiry: { include: { contact: true, contractor: true } } } });
  if (!est || !est.sentAt) return;
  const c = est.inquiry.contractor;
  if (!c.pbEstimateFollowUp) return;
  const days = c.estimateFollowUpDays.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
  // experiment arm decides which message variant this contact receives
  const assignment = await db.experimentAssignment.findFirst({ where: { contactId: est.inquiry.contactId } });
  const variant = (assignment?.arm as "A" | "B" | undefined) ?? undefined;
  for (const d of days) {
    await db.outboxMessage.create({
      data: {
        contractorId: c.id, inquiryId: est.inquiryId, contactId: est.inquiry.contact.id,
        channel: "SMS", templateKey: "FOLLOW_UP",
        body: followUpBody(est.inquiry.contact, { amount: est.amount.toString(), currency: est.currency, number: est.number }, c, variant),
        scheduledFor: new Date(est.sentAt!.getTime() + d * 86400000),
        status: "SCHEDULED",
        dedupeKey: `estnudge:${est.id}:${d}`,
      },
    });
  }
  await db.activity.create({
    data: {
      contractorId: c.id, inquiryId: est.inquiryId,
      actorType: "AUTOMATION", actorLabel: "Playbook", kind: "ESTIMATE",
      message: `Follow-up ladder scheduled: +${days.join("d, +")}d${variant ? ` (experiment arm ${variant})` : ""}`,
    },
  });
}

export async function cancelEstimateNudges(inquiryId: string, reason: string): Promise<void> {
  await db.outboxMessage.updateMany({
    where: { inquiryId, status: "SCHEDULED", templateKey: "FOLLOW_UP" },
    data: { status: "CANCELED", stoppedReason: reason },
  });
}

export async function onEstimateStatusChanged(estimateId: string, newStatus: string, reason?: string): Promise<void> {
  const est = await db.estimate.findUnique({ where: { id: estimateId }, include: { inquiry: { include: { contact: true, contractor: true } } } });
  if (!est) return;
  const now = await demoNow();
  const c = est.inquiry.contractor;
  if (newStatus === "ACCEPTED") {
    await cancelEstimateNudges(est.inquiryId, "Estimate accepted");
    await db.inquiry.update({ where: { id: est.inquiryId }, data: { stage: "WON", acceptedValue: est.amount } });
    await db.activity.create({
      data: {
        contractorId: c.id, inquiryId: est.inquiryId, actorType: "CUSTOMER", actorLabel: "Customer",
        kind: "ESTIMATE", message: `Estimate ${est.number} accepted (${est.amount} ${est.currency})`,
      },
    });
  }
  if (newStatus === "DECLINED") {
    await cancelEstimateNudges(est.inquiryId, "Estimate declined");
    await db.inquiry.update({ where: { id: est.inquiryId }, data: { stage: "LOST", lostReason: reason ?? "Declined" } });
    await db.activity.create({
      data: {
        contractorId: c.id, inquiryId: est.inquiryId, actorType: "CUSTOMER", actorLabel: "Customer",
        kind: "ESTIMATE", message: `Estimate ${est.number} declined${reason ? ` — ${reason}` : ""}`,
      },
    });
  }
  if (newStatus === "INVOICED") {
    // acceptedAt is preserved — acceptance evidence survives invoicing
    await db.activity.create({
      data: {
        contractorId: c.id, inquiryId: est.inquiryId, actorType: "STAFF", actorLabel: "Office",
        kind: "ESTIMATE", message: `Estimate ${est.number} invoiced`,
      },
    });
  }
}

export async function onCustomerReply(inquiryId: string, text: string): Promise<void> {
  const inquiry = await db.inquiry.findUnique({ where: { id: inquiryId }, include: { contact: true, contractor: true } });
  if (!inquiry) return;
  const now = await demoNow();
  const c = inquiry.contractor;
  await db.touchpoint.create({
    data: { contractorId: c.id, inquiryId, kind: "REPLY", label: `Customer reply: "${text.slice(0, 140)}"`, occurredAt: now },
  });
  // reply pauses automated quote chasing + creates a staff task
  await cancelEstimateNudges(inquiryId, "Customer replied");
  await db.estimate.updateMany({ where: { inquiryId, status: { in: ["SENT", "VIEWED"] } }, data: { followUpPausedAt: now } });
  await db.task.create({
    data: {
      contractorId: c.id, inquiryId, kind: "RESPOND",
      title: `Reply to ${inquiry.contact.firstName} ${inquiry.contact.lastName}`,
      detail: `Customer replied: "${text.slice(0, 200)}"`,
      dueAt: new Date(now.getTime() + 30 * 60_000),
      createdBy: "AUTOMATION", assignedUserId: await officeUserId(c.id),
    },
  });
  await db.activity.create({
    data: {
      contractorId: c.id, inquiryId, actorType: "CUSTOMER", actorLabel: inquiry.contact.firstName,
      kind: "MESSAGE", message: `Replied: "${text.slice(0, 140)}" — automated chase paused, staff task created`,
    },
  });
}

export async function onOptOut(contactId: string): Promise<void> {
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return;
  const now = await demoNow();
  await db.contact.update({ where: { id: contactId }, data: { optedOut: true, smsConsent: false } });
  await db.consentEvent.create({
    data: {
      contractorId: contact.contractorId, contactId,
      channel: "SMS", granted: false, basis: "OPT_OUT",
      wordingVersion: "v1", sourceLabel: "Customer replied STOP", recordedAt: now,
    },
  });
  const canceled = await db.outboxMessage.updateMany({
    where: { contactId, status: "SCHEDULED" },
    data: { status: "CANCELED", stoppedReason: "Contact opted out" },
  });
  const inquiries = await db.inquiry.findMany({ where: { contactId, stage: { in: ["NEW", "RESPONDING", "BOOKED", "INSPECTED", "QUOTED"] } } });
  for (const inq of inquiries) {
    await db.activity.create({
      data: {
        contractorId: inq.contractorId, inquiryId: inq.id,
        actorType: "CUSTOMER", actorLabel: contact.firstName,
        kind: "CONSENT", message: `Opted out of texts — ${canceled.count} scheduled message(s) stopped`,
      },
    });
    await db.task.create({
      data: {
        contractorId: inq.contractorId, inquiryId: inq.id, kind: "RESPOND",
        title: `Opt-out follow-up — ${contact.firstName} ${contact.lastName}`,
        detail: "Customer opted out; only staff contact allowed.",
        dueAt: new Date(now.getTime() + 3600_000),
        createdBy: "AUTOMATION",
        assignedUserId: await officeUserId(inq.contractorId),
      },
    });
  }
}

export async function setAutomationPaused(inquiryId: string, paused: boolean, byUser: string): Promise<void> {
  const inquiry = await db.inquiry.findUnique({ where: { id: inquiryId }, include: { contractor: true } });
  if (!inquiry) return;
  await db.inquiry.update({
    where: { id: inquiryId },
    data: { automationPaused: paused, pausedAt: paused ? await demoNow() : null, stage: paused ? "PAUSED" : "RESPONDING" },
  });
  if (paused) {
    await db.outboxMessage.updateMany({
      where: { inquiryId, status: "SCHEDULED" },
      data: { status: "CANCELED", stoppedReason: "Paused by staff" },
    });
  }
  await db.activity.create({
    data: {
      contractorId: inquiry.contractorId, inquiryId,
      actorType: "STAFF", actorLabel: byUser, kind: "STAGE",
      message: paused ? "Automation paused — staff took over the conversation" : "Automation resumed",
    },
  });
}
