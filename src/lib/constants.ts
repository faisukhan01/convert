/**
 * Shared constants — importable from both server and client code (no server-only imports).
 */

export const ROLES = ["AGENCY_ADMIN", "OWNER", "OFFICE", "ESTIMATOR"] as const;
export type Role = (typeof ROLES)[number];
export const MANAGE_ROLES: Role[] = ["AGENCY_ADMIN", "OWNER", "OFFICE"];
export const canManage = (r: string) => MANAGE_ROLES.includes(r as Role);
export const isAgencyAdmin = (r: string) => r === "AGENCY_ADMIN";

export const STAGES = [
  "NEW", "RESPONDING", "BOOKED", "INSPECTED", "QUOTED", "WON", "LOST", "PAUSED",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  NEW: "New",
  RESPONDING: "Responding",
  BOOKED: "Booked",
  INSPECTED: "Inspected",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  PAUSED: "Paused",
};

export const SERVICE_TYPES = ["REPAIR", "REPLACEMENT", "INSPECTION"] as const;
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  REPAIR: "Roof repair",
  REPLACEMENT: "Roof replacement",
  INSPECTION: "Inspection only",
};

export const SOURCES = ["WEBSITE", "PHONE_MISSED", "OFFICE", "REFERRAL", "LANDING_PAGE", "UNKNOWN"] as const;
export const SOURCE_LABELS: Record<string, string> = {
  WEBSITE: "Website form",
  PHONE_MISSED: "Missed call",
  OFFICE: "Office entered",
  REFERRAL: "Referral",
  LANDING_PAGE: "Landing page tag",
  UNKNOWN: "Unknown",
};

export const APPT_STATUSES = ["BOOKED", "COMPLETED", "NO_SHOW", "CANCELED"] as const;
export const APPT_STATUS_LABELS: Record<string, string> = {
  BOOKED: "Booked",
  COMPLETED: "Held",
  NO_SHOW: "No-show",
  CANCELED: "Canceled",
};

export const ESTIMATE_STATUSES = ["DRAFT", "SENT", "VIEWED", "ACCEPTED", "DECLINED", "INVOICED"] as const;
export const ESTIMATE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  INVOICED: "Invoiced",
};

export const TASK_KINDS = ["CALLBACK", "RESPOND", "FOLLOW_UP", "REVIEW_MATCH", "PREPARE_QUOTE", "OTHER"] as const;
export const TASK_KIND_LABELS: Record<string, string> = {
  CALLBACK: "Callback",
  RESPOND: "Respond",
  FOLLOW_UP: "Follow up",
  REVIEW_MATCH: "Review match",
  PREPARE_QUOTE: "Prepare quote",
  OTHER: "Other",
};

export const BILLING_STATUSES = ["trial", "active", "past_due", "canceled"] as const;

export const RUN_MODES = ["demo", "configured", "live"] as const;
export const RUN_MODE_LABELS: Record<string, string> = {
  demo: "Local demo (simulated provider)",
  configured: "Configured — awaiting verification",
  live: "Live (verified connection)",
};

export const ACTOR_LABELS: Record<string, string> = {
  STAFF: "Staff",
  AUTOMATION: "Automation",
  PROVIDER: "Provider sync",
  CUSTOMER: "Customer",
  SYSTEM: "System",
};

export const PLAYBOOKS = [
  { key: "pbNewInquiry", label: "New inquiry — send booking link", desc: "On a website or landing-page inquiry with SMS permission, text a booking link inside the contact window. Without permission, create an office respond task." },
  { key: "pbMissedCall", label: "Missed call — callback task", desc: "One callback task per open inquiry; repeat missed calls consolidate instead of stacking. Auto-reply only with recorded SMS permission." },
  { key: "pbReminder", label: "Inspection reminder", desc: "One active reminder per appointment. Recalculated on every reschedule; stopped by cancellation or completion." },
  { key: "pbNoShow", label: "No-show recovery", desc: "Office task plus a rebooking message when permission allows." },
  { key: "pbEstimateFollowUp", label: "Open estimate chase", desc: "Editable nudge ladder (e.g. +1d, +3d, +7d). A reply, opt-out, manual pause or decision stops the sequence; eligibility is rechecked immediately before every send." },
  { key: "pbMorningDigest", label: "Morning callback digest", desc: "8:00 AM local digest to the office: overdue callbacks, today's inspections, aging estimates." },
] as const;

export const DEFAULT_WORKING_HOURS: Record<string, [string, string] | null> = {
  mon: ["08:00", "17:00"],
  tue: ["08:00", "17:00"],
  wed: ["08:00", "17:00"],
  thu: ["08:00", "17:00"],
  fri: ["08:00", "17:00"],
  sat: null,
  sun: null,
};

export const DEMO_PASSWORD = "demo";
