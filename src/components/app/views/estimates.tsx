"use client";

import { useMemo } from "react";
import { useApi, api } from "@/hooks/use-api";
import { navigate, useAppStore, roleAt } from "@/store/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard, EmptyState, SkeletonRows, Row, EstimateStatusBadge } from "@/components/app/ui-bits";
import { fmtMoney } from "@/lib/money";
import { fmtDate, tzAbbr } from "@/lib/time";
import { SOURCE_LABELS } from "@/lib/constants";
import type { EstimateRow } from "@/lib/client-types";
import { ArrowRight, Send } from "lucide-react";

export function EstimatesView() {
  const session = useAppStore((s) => s.session);
  const contractorId = session?.currentContractorId ?? session?.contractors?.[0]?.id;
  const contractor = session?.contractors?.find((c) => c.id === contractorId);
  const tz = contractor?.timezone ?? "America/Chicago";
  const role = roleAt(session, contractorId);
  const canManage = role !== "ESTIMATOR";
  const { data, loading, refresh } = useApi<{ estimates: EstimateRow[]; now: string }>(
    contractorId ? `/api/estimates?contractorId=${contractorId}` : null
  );

  const estimates = data?.estimates ?? [];
  const now = useMemo(() => new Date(data?.now ?? Date.now()), [data?.now]);

  const groups = useMemo(() => {
    const open = estimates.filter((e) => e.status === "SENT" || e.status === "VIEWED");
    const drafts = estimates.filter((e) => e.status === "DRAFT");
    const decided = estimates.filter((e) => ["ACCEPTED", "DECLINED", "INVOICED"].includes(e.status));
    const byAge = (a: EstimateRow, b: EstimateRow) =>
      new Date(a.sentAt ?? a.createdAt).getTime() - new Date(b.sentAt ?? b.createdAt).getTime();
    return { drafts, open: open.sort(byAge), decided: decided.sort(byAge).reverse() };
  }, [estimates]);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const age = (e: EstimateRow) => Math.max(0, Math.floor((now.getTime() - new Date(e.sentAt ?? e.createdAt).getTime()) / 86400000));

  const RowItem = ({ e }: { e: EstimateRow }) => (
    <Row>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{e.number}</span>
          <EstimateStatusBadge status={e.status} />
          <span className="font-medium">{fmtMoney(e.amount, e.currency)}</span>
          <button className="text-sm hover:underline text-left" onClick={() => navigate(`/inquiries/${e.inquiryId}`)}>
            {e.inquiry?.contact ? `${e.inquiry.contact.firstName} ${e.inquiry.contact.lastName}` : "—"}
          </button>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground" suppressHydrationWarning>
          {age(e)}d old · {e.sentAt ? `sent ${fmtDate(e.sentAt, tz)} ${tzAbbr(new Date(e.sentAt), tz)}` : "draft"} · owner {e.ownerUserId ? "assigned" : "unassigned"}
          {e.inquiry?.firstSource ? ` · ${SOURCE_LABELS[e.inquiry.firstSource] ?? e.inquiry.firstSource}` : ""}
        </div>
      </div>
      <div className="text-xs text-muted-foreground max-w-[200px] text-right">
        {e.followUpPausedAt ? "Chase paused — staff owns follow-up" : e.status === "DRAFT" ? "Ready to send" : ["ACCEPTED", "DECLINED", "INVOICED"].includes(e.status) ? "Decided" : "Automated nudges scheduled"}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {e.status === "DRAFT" && canManage && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "SENT" }), "Sent — chase ladder scheduled")}>
            <Send className="h-3 w-3" /> Send
          </Button>
        )}
        {e.status === "SENT" && canManage && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "VIEWED" }), "Marked viewed")}>Viewed</Button>
        )}
        {(e.status === "SENT" || e.status === "VIEWED") && canManage && (
          <>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "ACCEPTED" }), "Accepted")}>Accept</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "DECLINED", reason: "Declined" }), "Declined")}>Decline</Button>
          </>
        )}
        {e.status === "ACCEPTED" && canManage && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(() => api.patch(`/api/estimates?id=${e.id}`, { status: "INVOICED" }), "Invoiced — acceptance evidence preserved")}>Invoice</Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => navigate(`/inquiries/${e.inquiryId}`)}>Open <ArrowRight className="h-3 w-3" /></Button>
      </div>
    </Row>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold tracking-tight">Estimates</h1>
        <p className="text-sm text-muted-foreground">Amount, age, status, owner and the next action — draft → sent → viewed → accepted / declined → invoiced.</p>
      </header>

      <SectionCard title="Awaiting reply" subtitle="oldest first" count={groups.open.length}>
        {loading ? <SkeletonRows rows={3} /> : groups.open.length === 0 ? (
          <EmptyState title="No open estimates" hint="Send a draft to start the follow-up ladder." />
        ) : (
          <div className="space-y-2">{groups.open.map((e) => <RowItem key={e.id} e={e} />)}</div>
        )}
      </SectionCard>

      <SectionCard title="Drafts" count={groups.drafts.length}>
        {loading ? <SkeletonRows rows={1} /> : groups.drafts.length === 0 ? (
          <EmptyState title="No drafts" hint="Create one from an inspected inquiry's detail page." />
        ) : (
          <div className="space-y-2">{groups.drafts.map((e) => <RowItem key={e.id} e={e} />)}</div>
        )}
      </SectionCard>

      <SectionCard title="Decided" subtitle="accepted / declined / invoiced" count={groups.decided.length}>
        {loading ? <SkeletonRows rows={1} /> : groups.decided.length === 0 ? (
          <EmptyState title="Nothing decided yet" />
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto scroll-area">{groups.decided.map((e) => <RowItem key={e.id} e={e} />)}</div>
        )}
      </SectionCard>
    </div>
  );
}
