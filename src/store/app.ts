"use client";

import { create } from "zustand";
import { api, setStoredToken } from "@/hooks/use-api";
import type { SessionInfo } from "@/lib/client-types";

type AppState = {
  session: SessionInfo | null;
  sessionLoading: boolean;
  loadSession: () => Promise<SessionInfo | null>;
  switchContractor: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAppStore = create<AppState>((set, get) => ({
  session: null,
  sessionLoading: true,
  loadSession: async () => {
    set({ sessionLoading: true });
    try {
      const s = await api.get<SessionInfo>("/api/session");
      set({ session: s, sessionLoading: false });
      return s;
    } catch {
      set({ session: null, sessionLoading: false });
      return null;
    }
  },
  switchContractor: async (id: string) => {
    await api.patch("/api/session", { contractorId: id });
    await get().loadSession();
  },
  signOut: async () => {
    await api.del("/api/session");
    setStoredToken(null);
    set({ session: null });
  },
}));

/** Effective role of the signed-in user at a given contractor (server enforces the same rule). */
export function roleAt(session: SessionInfo | null, contractorId: string | null | undefined): string {
  if (!session?.user) return "GUEST";
  if (session.user.role === "AGENCY_ADMIN") return "AGENCY_ADMIN";
  return session.memberships.find((m) => m.contractorId === contractorId)?.role ?? session.user.role;
}

/** Hash router: #/view/segments?query */
export function parseHash(): { path: string; segments: string[]; query: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  return { path: "/" + segments.join("/"), segments, query: new URLSearchParams(queryPart ?? "") };
}

export function navigate(to: string): void {
  if (!to.startsWith("#")) to = "#" + (to.startsWith("/") ? to : "/" + to);
  window.location.hash = to;
}
