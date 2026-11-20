"use client";

import { useState, useEffect } from "react";
import { parseHash, navigate, roleAt, useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  LayoutDashboard, ClipboardList, CalendarDays, FileText, BarChart3, Inbox, Settings,
  Building2, Home, Menu, ChevronDown, Moon, Sun, LogOut, ExternalLink, Clock, Globe,
} from "lucide-react";
import { useTheme } from "next-themes";

const NAV = [
  { key: "today", label: "Today", icon: LayoutDashboard },
  { key: "inquiries", label: "Inquiries", icon: Inbox },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "estimates", label: "Estimates", icon: FileText },
  { key: "reports", label: "Reports", icon: BarChart3 },
];

const NAV_MORE = [
  { key: "outbox", label: "Outbox & demo", icon: Clock, demoOnly: true },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "agency", label: "Agency", icon: Building2, adminOnly: true },
];

/**
 * RidgeLine brand mark — the official house-and-growth logo on a crisp
 * white tile (reads cleanly over footage, glass and light surfaces).
 * Used in the app sidebar, the marketing navbar, the sign-in header,
 * the footer and the favicon (kept in sync manually).
 */
export function Logo({
  compact = false,
  tagline = true,
  tone = "dark",
}: {
  compact?: boolean;
  tagline?: boolean;
  tone?: "dark" | "light";
}) {
  const word = tone === "light" ? "text-white" : "text-foreground";
  const sub = tone === "light" ? "text-white/60" : "text-muted-foreground";
  return (
    <span className="flex select-none items-center gap-2.5">
      <span
        className={`block shrink-0 overflow-hidden rounded-[10px] bg-white ${
          tone === "light"
            ? "ring-1 ring-white/30 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.55)]"
            : "ring-1 ring-black/[0.06] shadow-[0_4px_14px_-6px_rgba(15,23,42,0.35)]"
        }`}
      >
        <img
          src="/img/ridgeline-logo.png"
          alt="RidgeLine logo"
          width={compact ? 28 : 34}
          height={compact ? 28 : 34}
          className={`block object-cover ${compact ? "h-7 w-7" : "h-[34px] w-[34px]"}`}
        />
      </span>
      {!compact && (
        <span className={`text-[15.5px] font-bold leading-none tracking-tight ${word}`}>
          RidgeLine
          {tagline && (
            <span className={`mt-1 block text-[9px] font-semibold uppercase tracking-[0.14em] ${sub}`}>
              Estimate desk for roofers
            </span>
          )}
        </span>
      )}
    </span>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const toggle = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle dark mode" onClick={toggle}>
      <Sun className="hidden dark:block h-4 w-4" />
      <Moon className="block dark:hidden h-4 w-4" />
    </Button>
  );
}

type ShellProps = {
  route: { path: string; segments: string[]; query: URLSearchParams };
  children: React.ReactNode;
};

export function AppShell({ route, children }: ShellProps) {
  const { session, switchContractor, signOut } = useAppStore();
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id ?? null;
  const contractor = session?.contractors?.find((c) => c.id === contractorId);
  const role = roleAt(session, contractorId);
  const current = route.segments[0] ?? "today";

  const visibleNav = NAV;
  const visibleMore = NAV_MORE.filter((n) => (n.demoOnly ? contractor?.runMode === "demo" : true) && (n.adminOnly ? role === "AGENCY_ADMIN" : true));

  const NavButton = ({ item }: { item: { key: string; label: string; icon: React.ElementType } }) => (
    <button
      onClick={() => navigate(`/${item.key}`)}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors min-h-[40px] w-full",
        current === item.key || (item.key === "inquiries" && current === "inquiries")
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {item.label}
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:flex flex-col w-56 shrink-0 border-r bg-sidebar px-3 py-4 gap-1 sticky top-0 h-screen">
          <div className="px-2 pb-4"><Logo /></div>
          {visibleNav.map((item) => <NavButton key={item.key} item={item} />)}
          <div className="my-2 border-t" />
          {visibleMore.map((item) => <NavButton key={item.key} item={item} />)}
          <div className="my-2 border-t" />
          <button
            onClick={() => navigate("/landing")}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground min-h-[40px] w-full"
          >
            <Globe className="h-4 w-4 shrink-0" /> Marketing site
          </button>
          <div className="mt-auto px-2 pt-4 text-[11px] leading-relaxed text-muted-foreground">
            <div className="font-medium text-foreground/80">{session?.user?.name}</div>
            <div>{role.replace("_", " ").toLowerCase()}</div>
            {contractor?.runMode === "demo" && (
              <div className="mt-2 rounded-md border border-dashed px-2 py-1.5 text-[10px]">
                Demo mode — provider simulated. Data survives restarts; reset lives in Outbox &amp; demo.
              </div>
            )}
          </div>
        </aside>

        {/* Main column */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex items-center gap-2 px-3 sm:px-4 h-14">
              {/* Mobile nav */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="md:hidden" aria-label="Open navigation">
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-3">
                  <SheetTitle className="px-2 pb-3"><Logo /></SheetTitle>
                  <div className="flex flex-col gap-1">
                    {[...visibleNav, ...visibleMore].map((item) => (
                      <NavButton key={item.key} item={item} />
                    ))}
                    <div className="my-2 border-t" />
                    <button
                      onClick={() => navigate("/public/intake")}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent min-h-[40px] w-full"
                    >
                      <Home className="h-4 w-4" /> Homeowner view
                    </button>
                    <button
                      onClick={() => navigate("/landing")}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent min-h-[40px] w-full"
                    >
                      <Globe className="h-4 w-4" /> Marketing site
                    </button>
                    <button
                      onClick={() => void signOut().then(() => navigate("/signin"))}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent min-h-[40px] w-full"
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                </SheetContent>
              </Sheet>

              <div className="md:hidden"><Logo compact /></div>

              {/* Location switcher */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="ml-1 gap-2 max-w-[220px]" aria-label="Switch location">
                    <span className="truncate">{contractor?.name ?? "No location"}</span>
                    {(role === "AGENCY_ADMIN") && <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>Locations</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {session?.contractors?.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => void switchContractor(c.id).then(() => toast(`Switched to ${c.name}`))}>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">{c.runMode}</span>
                    </DropdownMenuItem>
                  ))}
                  {role === "AGENCY_ADMIN" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => navigate("/agency")}><Building2 className="h-4 w-4 mr-2" />Manage locations</DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {contractor && (
                <span className="hidden lg:inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {contractor.runMode === "demo" ? "demo data" : contractor.runMode}
                </span>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="hidden sm:inline-flex gap-2" onClick={() => navigate("/public/intake")}>
                  <ExternalLink className="h-3.5 w-3.5" /> Homeowner view
                </Button>
                <ThemeToggle />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2" aria-label="Account menu">
                      <span className="hidden sm:inline">{session?.user?.name?.split(" ")[0]}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>
                      <div>{session?.user?.name}</div>
                      <div className="text-xs font-normal text-muted-foreground">{session?.user?.email}</div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => void signOut().then(() => navigate("/signin"))}>
                      <LogOut className="h-4 w-4 mr-2" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </header>

          <main className="flex-1 px-3 sm:px-5 py-4 sm:py-6 max-w-6xl w-full mx-auto">{children}</main>

          {/* Sticky footer: mt-auto pushes it to the viewport bottom on short pages */}
          <footer className="mt-auto border-t bg-sidebar">
            <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>RidgeLine — estimate desk for roofing teams. Demo data is synthetic; no live provider configured.</span>
              <span className="flex items-center gap-3">
                <button className="hover:text-foreground underline-offset-2 hover:underline" onClick={() => navigate("/landing")}>Marketing site</button>
                <span aria-hidden>·</span>
                <button className="hover:text-foreground underline-offset-2 hover:underline" onClick={() => navigate("/public/intake")}>Homeowner booking</button>
                <span aria-hidden>·</span>
                <span>Postgres-ready · GHL connector simulated in demo mode</span>
              </span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
