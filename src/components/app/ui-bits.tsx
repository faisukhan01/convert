"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { STAGE_LABELS, ESTIMATE_STATUS_LABELS, APPT_STATUS_LABELS } from "@/lib/constants";
import { fmtDateTimeTz, relativeDue } from "@/lib/time";

export function StageBadge({ stage }: { stage: string }) {
  const styles: Record<string, string> = {
    NEW: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-900",
    RESPONDING: "bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-900 dark:text-stone-200 dark:border-stone-800",
    BOOKED: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-200 dark:border-sky-900",
    INSPECTED: "bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-950 dark:text-teal-200 dark:border-teal-900",
    QUOTED: "bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-900",
    WON: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-900",
    LOST: "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-900",
    PAUSED: "bg-stone-200 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", styles[stage] ?? "bg-muted")}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}

export function EstimateStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: "bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-900 dark:text-stone-200",
    SENT: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-200",
    VIEWED: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200",
    ACCEPTED: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200",
    DECLINED: "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200",
    INVOICED: "bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-950 dark:text-teal-200",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", styles[status] ?? "bg-muted")}>
      {ESTIMATE_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function ApptStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    BOOKED: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950 dark:text-sky-200",
    COMPLETED: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200",
    NO_SHOW: "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-200",
    CANCELED: "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900 dark:text-stone-300",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", styles[status] ?? "bg-muted")}>
      {APPT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function DueChip({ dueAt, now }: { dueAt: string; now: string }) {
  const due = new Date(dueAt).getTime();
  const n = new Date(now).getTime();
  const overdue = due < n;
  const diffH = Math.abs(due - n) / 3600000;
  const label = overdue
    ? `overdue ${diffH < 1 ? `${Math.round(Math.abs(due - n) / 60000)}m` : diffH < 48 ? `${Math.round(diffH)}h` : `${Math.round(diffH / 24)}d`}`
    : diffH < 1 ? `due in ${Math.round(Math.abs(due - n) / 60000)}m` : diffH < 48 ? `due in ${Math.round(diffH)}h` : `due in ${Math.round(diffH / 24)}d`;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
      overdue ? "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200 dark:border-red-900" : "bg-stone-100 text-stone-700 border-stone-300 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700")}>
      {overdue && <span aria-hidden>●</span>}{label}
    </span>
  );
}

export function ActorChip({ type }: { type: string }) {
  const styles: Record<string, string> = {
    STAFF: "bg-stone-200/70 text-stone-800 dark:bg-stone-800 dark:text-stone-200",
    AUTOMATION: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
    PROVIDER: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
    CUSTOMER: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    SYSTEM: "bg-stone-100 text-stone-600 dark:bg-stone-900 dark:text-stone-300",
  };
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", styles[type] ?? "bg-muted")}>
      {type.toLowerCase()}
    </span>
  );
}

export function SectionCard({ title, subtitle, count, action, children, className }: {
  title: string; subtitle?: string; count?: number; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">{count}</span>
        )}
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        {action && <div className="ml-auto flex items-center gap-2">{action}</div>}
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {hint && <p className="max-w-sm text-xs text-muted-foreground">{hint}</p>}
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

/** Data table-ish row used across list views. */
export function Row({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
        onClick && "hover:bg-accent/60 cursor-pointer focus-visible:ring-2 focus-visible:ring-ring w-full",
        className
      )}
    >
      {children}
    </Comp>
  );
}

export function Def({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function TzTime({ iso, tz, long = false }: { iso: string; tz: string; long?: boolean }) {
  const date = new Date(iso);
  return <span suppressHydrationWarning>{long ? fmtDateTimeTz(date, tz) : fmtDateTimeTz(date, tz)}<span className="sr-only"> ({tz})</span></span>;
}

export function ConfirmDialog({ trigger, title, description, onConfirm, confirmLabel = "Confirm", destructive = false }: {
  trigger: React.ReactNode; title: string; description: string; onConfirm: () => void | Promise<void>;
  confirmLabel?: string; destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function relative(iso: string, now: string): string {
  return relativeDue(iso, new Date(now));
}
