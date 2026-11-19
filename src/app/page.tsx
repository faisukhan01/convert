"use client";

import { useEffect, useState } from "react";
import { parseHash, navigate, useAppStore, roleAt } from "@/store/app";
import { AppShell } from "@/components/app/shell";
import { SignInView } from "@/components/app/views/signin";
import { TodayView } from "@/components/app/views/today";
import { InquiriesView } from "@/components/app/views/inquiries";
import { InquiryDetailView } from "@/components/app/views/inquiry-detail";
import { CalendarView } from "@/components/app/views/calendar";
import { EstimatesView } from "@/components/app/views/estimates";
import { ReportsView } from "@/components/app/views/reports";
import { OutboxView } from "@/components/app/views/outbox";
import { SettingsView } from "@/components/app/views/settings";
import { AgencyView } from "@/components/app/views/agency";
import { PublicRouter } from "@/components/app/views/public";
import { SkeletonRows } from "@/components/app/ui-bits";

/**
 * RidgeLine SPA — single user-visible route with hash-based navigation (so filters, scroll
 * state and deep links like #/public/manage/:token survive refreshes). The REST API lives
 * under /api/* and enforces tenancy + roles server-side for every request.
 */
export default function Page() {
  const { session, sessionLoading, loadSession } = useAppStore();
  const [route, setRoute] = useState(() => typeof window !== "undefined" ? parseHash() : { path: "/", segments: [] as string[], query: new URLSearchParams() });

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Redirect logic once the session resolves
  useEffect(() => {
    if (sessionLoading) return;
    const segments = route.segments;
    const isPublic = segments[0] === "public" || segments[0] === "signin";
    if (!session?.user && !isPublic) {
      navigate("/signin");
      return;
    }
    if (session?.user && (segments.length === 0 || (segments[0] === "signin"))) {
      navigate("/today");
    }
  }, [session, sessionLoading, route]);

  if (route.segments[0] === "public") {
    return <PublicRouter segments={route.segments} />;
  }

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="w-full max-w-md"><SkeletonRows rows={4} /></div>
      </div>
    );
  }

  if (!session?.user) {
    return <SignInView />;
  }

  const view = route.segments[0] ?? "today";

  const content = (() => {
    switch (view) {
      case "today":
        return <TodayView />;
      case "inquiries":
        return route.segments[1]
          ? <InquiryDetailView id={route.segments[1]} />
          : <InquiriesView query={route.query} />;
      case "calendar":
        return <CalendarView />;
      case "estimates":
        return <EstimatesView />;
      case "reports":
        return <ReportsView />;
      case "outbox":
        return <OutboxView />;
      case "settings":
        return <SettingsView />;
      case "agency":
        return roleAt(session, session.currentContractorId) === "AGENCY_ADMIN"
          ? <AgencyView />
          : <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Agency tools are for agency admins.</div>;
      default:
        return <TodayView />;
    }
  })();

  return <AppShell route={route}>{content}</AppShell>;
}
