/**
 * Message templates. Every outbound SMS carries the opt-out line; bodies are concise,
 * operator-readable copy. The same builders are used in demo and live modes.
 */

type ContactLike = { firstName: string; lastName: string; phone?: string | null; email?: string | null };
type ContractorLike = { name: string; timezone: string };
type EstimateLike = { amount: string; currency: string; number: string };

const STOP = "Reply STOP to opt out.";

export function fmtMoneyInline(amount: string | number, currency = "USD"): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `$${n}`;
  }
}

export function bookingLinkBody(contact: ContactLike, service: string, contractor: ContractorLike, base: string, token: string): string {
  return `Hi ${contact.firstName}, thanks for requesting a ${service.toLowerCase().replace("_", " ")} estimate from ${contractor.name}. Book your free roof inspection here: ${base}/#/public/book/${token} ${STOP}`;
}

export function missedYouBody(contact: ContactLike, contractor: ContractorLike, base: string, token: string): string {
  return `Hi ${contact.firstName}, sorry we missed your call at ${contractor.name}. You can pick a time for your roof inspection here: ${base}/#/public/book/${token} ${STOP}`;
}

export function confirmationBody(contact: ContactLike, when: string, contractor: ContractorLike, address: string): string {
  return `You're booked, ${contact.firstName}. ${contractor.name} will inspect your roof at ${address} on ${when}. Need to change it? Use the link in your confirmation. ${STOP}`;
}

export function reminderBody(contact: ContactLike, when: string, contractor: ContractorLike, address: string): string {
  return `Reminder: your ${contractor.name} roof inspection is ${when} at ${address}. Reply R to reschedule. ${STOP}`;
}

export function rescheduleBody(contact: ContactLike, when: string, contractor: ContractorLike): string {
  return `Done, ${contact.firstName} — your ${contractor.name} inspection is moved to ${when}. ${STOP}`;
}

export function noShowBody(contact: ContactLike, contractor: ContractorLike, base: string, token: string): string {
  return `Hi ${contact.firstName}, we missed you for today's roof inspection. Pick another time that works: ${base}/#/public/book/${token} ${STOP}`;
}

export function followUpBody(contact: ContactLike, estimate: EstimateLike, contractor: ContractorLike, variant?: "A" | "B"): string {
  const money = fmtMoneyInline(estimate.amount, estimate.currency);
  if (variant === "B") {
    return `Hi ${contact.firstName}, your ${contractor.name} roof estimate (${estimate.number}, ${money}) is ready whenever you are. Any questions we can answer before you decide? ${STOP}`;
  }
  return `Hi ${contact.firstName}, checking in on your ${contractor.name} roof estimate ${estimate.number} (${money}). Reply anytime with questions. ${STOP}`;
}

export function digestBody(counts: { overdue: number; inspectionsToday: number; agingEstimates: number }, contractor: ContractorLike, date: string): string {
  return `Good morning, ${contractor.name} — ${date}. ${counts.overdue} callback${counts.overdue === 1 ? "" : "s"} overdue, ${counts.inspectionsToday} inspection${counts.inspectionsToday === 1 ? "" : "s"} today, ${counts.agingEstimates} open estimate${counts.agingEstimates === 1 ? "" : "s"} older than 3 days.`;
}
