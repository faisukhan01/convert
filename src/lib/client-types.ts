/** Shared client-side types mirroring the API payloads. */
import type { Role } from "@/lib/constants";

export type ContractorInfo = {
  id: string; name: string; slug: string; timezone: string;
  runMode: string; billingStatus: string;
};

export type SessionInfo = {
  user: { id: string; name: string; email: string; role: Role | string; agency?: { id: string; name: string } | null } | null;
  memberships: { contractorId: string; role: string }[];
  contractors: ContractorInfo[];
  currentContractorId: string | null;
};

export type Contact = {
  id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null;
  addressLine1?: string | null; city?: string | null; state?: string | null; zip?: string | null;
  preferredChannel?: string | null; smsConsent: boolean; emailConsent: boolean; optedOut: boolean;
};

export type InquiryRow = {
  id: string; contractorId: string; contactId: string; serviceType: string; serviceZip: string;
  source: string; firstSource: string; stage: string; ownerUserId?: string | null;
  publicToken: string; isTest: boolean; isDuplicate: boolean;
  automationPaused?: boolean; quotedValue?: string | null; acceptedValue?: string | null;
  lostReason?: string | null; createdAt: string; updatedAt: string;
  contact?: Contact;
  appointments?: AppointmentRow[];
  estimates?: EstimateRow[];
  tasks?: TaskRow[];
  activities?: ActivityRow[];
  touchpoints?: TouchpointRow[];
  outbox?: OutboxRow[];
  payments?: PaymentRow[];
};

export type TaskRow = {
  id: string; contractorId: string; inquiryId?: string | null; kind: string; title: string;
  detail?: string | null; dueAt: string; status: string; assignedUserId?: string | null;
  createdBy: string; snoozedUntil?: string | null; dedupeKey?: string | null;
  completedAt?: string | null; createdAt: string;
  inquiry?: InquiryRow & { contact?: Contact };
};

export type AppointmentRow = {
  id: string; contractorId: string; inquiryId: string;
  startAt: string; endAt: string; timezone: string; estimatorId?: string | null;
  status: string; ghlAppointmentId?: string | null; bookedBy: string;
  manageToken: string; manageExpiresAt: string; outcomeNote?: string | null;
  createdAt: string;
  inquiry?: InquiryRow & { contact?: Contact };
};

export type EstimateRow = {
  id: string; contractorId: string; inquiryId: string; number: string;
  amount: string; currency: string; status: string; revision?: number;
  sentAt?: string | null; viewedAt?: string | null; acceptedAt?: string | null;
  decidedAt?: string | null; invoicedAt?: string | null;
  followUpPausedAt?: string | null; ownerUserId?: string | null; createdAt: string;
  inquiry?: InquiryRow & { contact?: Contact };
};

export type ActivityRow = {
  id: string; inquiryId: string; actorType: string; actorLabel: string;
  kind: string; message: string; meta?: string | null; createdAt: string;
};

export type TouchpointRow = {
  id: string; inquiryId: string; kind: string; label: string; meta?: string | null; occurredAt: string;
};

export type OutboxRow = {
  id: string; contractorId: string; inquiryId?: string | null; contactId?: string | null;
  channel: string; templateKey: string; subject?: string | null; body: string;
  scheduledFor: string; sentAt?: string | null; status: string;
  dedupeKey?: string | null; stoppedReason?: string | null; attempts?: number;
  createdAt: string;
  contact?: { firstName: string; lastName: string; phone?: string | null; email?: string | null } | null;
  inquiry?: { id: string; publicToken: string } | null;
};

export type PaymentRow = {
  id: string; contractorId: string; inquiryId?: string | null;
  provider: string; providerTxnId: string; amount: string; currency: string;
  kind: string; status: string; matchedByUserId?: string | null; matchedAt?: string | null;
  occurredAt: string; note?: string | null;
  inquiry?: { contact?: { firstName: string; lastName: string } } | null;
};

export type ProviderEventRow = {
  id: string; contractorId?: string | null; provider: string; eventType: string;
  externalId?: string | null; payload: string; signatureValid: boolean; status: string;
  processError?: string | null; attempts: number; receivedAt: string; processedAt?: string | null;
};

export type CheckResult = { name: string; state: "passed" | "failed" | "awaiting"; detail: string };

export type ConnectionsInfo = {
  runMode: string;
  activatedAt: string | null;
  installs: { provider: string; status: string; locationId?: string | null; scopes?: string | null; lastCheckedAt?: string | null; lastError?: string | null; installedAt: string }[];
  checks: CheckResult[];
  prerequisites: { key: string; label: string; met: boolean }[];
  allPrerequisitesMet: boolean;
};

export type ReportsInfo = {
  period: { days: number; start: string; end: string; timezone: string };
  bookingRate: { numerator: number; denominator: number; rate: number | null; immatureCount: number };
  attendance: { held: number; noShow: number; canceled: number; showRate: number | null; unknownOutcomeCount: number };
  acceptance: { sent: number; accepted: number; rate: number | null; openCount: number };
  revenue: {
    receipts: number; refunds: number; net: number; currencies: string[];
    bySource: Record<string, number>; unmatchedCount: number; unmatchedTotal: number; matchedCount: number;
  };
  experiments: ExperimentResult[];
};

export type ExperimentResult = {
  id: string; name: string; status: string; routeToArm?: string | null;
  messageA?: string; messageB?: string;
  minSample: number; windowDays: number;
  arms: Record<string, { enrolled: number; booked: number }>;
  rateA: number | null; rateB: number | null; diffPp: number | null;
  inconclusive: boolean;
};

export type Slot = { start: string; end: string; estimatorId?: string | null };
