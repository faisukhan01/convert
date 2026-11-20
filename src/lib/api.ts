import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readSession, type SessionPayload } from "@/lib/session";
import { canManage } from "@/lib/constants";
import type { Contractor, Membership, User } from "@prisma/client";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data as Record<string, unknown>, { status });
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }
  console.error("[api] unhandled", e);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}

/** Wrap a route handler with error mapping. */
export function route<H extends (req: Request, seg: { params: Promise<Record<string, string>> }) => Promise<NextResponse>>(h: H): H {
  return (async (req: Request, seg: { params: Promise<Record<string, string>> }) => {
    try {
      return await h(req, seg);
    } catch (e) {
      return errorResponse(e);
    }
  }) as H;
}

export async function requireSession(): Promise<SessionPayload> {
  const s = await readSession();
  if (!s) throw new ApiError(401, "Sign in required");
  return s;
}

export type AccessCtx = {
  session: SessionPayload;
  user: User;
  contractor: Contractor;
  role: string; // effective role at this contractor: AGENCY_ADMIN | OWNER | OFFICE | ESTIMATOR
  membership: Membership | null;
};

/**
 * Resolve the caller's tenant context. `contractorId` must be an explicit location the caller
 * is authorized for (agency admin) or a member of — this is the server-side tenant check
 * applied to every read, write, search, export and job.
 */
export async function requireAccess(contractorId?: string | null): Promise<AccessCtx> {
  const session = await requireSession();
  const user = await db.user.findUnique({ where: { id: session.uid } });
  if (!user) throw new ApiError(401, "Session user no longer exists");

  let contractor: Contractor | null = null;
  let membership: Membership | null = null;

  if (user.role === "AGENCY_ADMIN") {
    const targetId = contractorId || session.cid;
    if (targetId) {
      contractor = await db.contractor.findFirst({ where: { id: targetId, agencyId: user.agencyId! } });
      if (!contractor) throw new ApiError(403, "Contractor not in your agency");
      membership = await db.membership.findUnique({
        where: { userId_contractorId: { userId: user.id, contractorId: contractor.id } },
      });
    } else {
      // agency admin without a switched location: return agency context
      return { session, user, contractor: null as unknown as Contractor, role: "AGENCY_ADMIN", membership: null };
    }
    return { session, user, contractor, role: membership?.role ?? "AGENCY_ADMIN", membership };
  }

  const targetId = contractorId || session.cid;
  if (!targetId) throw new ApiError(403, "No location selected");
  contractor = await db.contractor.findUnique({ where: { id: targetId } });
  if (!contractor) throw new ApiError(404, "Contractor not found");
  membership = await db.membership.findUnique({
    where: { userId_contractorId: { userId: user.id, contractorId: contractor.id } },
  });
  if (!membership || !membership.isActive) throw new ApiError(403, "You are not a member of this location");
  return { session, user, contractor, role: membership.role, membership };
}

export function assertManage(role: string): void {
  if (!canManage(role)) throw new ApiError(403, "Requires office or owner role");
}

/** Estimators see only their assigned work; this clause is ANDed into every staff query. */
export function estimatorScope(role: string, userId: string) {
  if (role !== "ESTIMATOR") return undefined;
  return {
    OR: [
      { ownerUserId: userId },
      { appointments: { some: { estimatorId: userId } } },
    ],
  };
}
