import { db } from "@/lib/db";
import { json, route, ApiError, requireAccess } from "@/lib/api";
import { ensureBootstrap } from "@/lib/bootstrap";
import { computeSlots } from "@/app/api/appointments/route";

/** GET /api/availability?inquiryId= — fresh bookable slots (optionally scoped to an inquiry's reschedule) */
export const GET = route(async (req) => {
  await ensureBootstrap();
  const url = new URL(req.url);
  const inquiryId = url.searchParams.get("inquiryId");
  const { contractor } = await requireAccess(url.searchParams.get("contractorId"));
  let excludeInquiryId: string | undefined;
  if (inquiryId) {
    const inq = await db.inquiry.findFirst({ where: { id: inquiryId, contractorId: contractor.id } });
    if (!inq) throw new ApiError(404, "Inquiry not found");
    excludeInquiryId = inq.id;
  }
  const slots = await computeSlots(contractor.id, { excludeInquiryId });
  return json({ slots });
});
