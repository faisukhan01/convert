"use client";

import { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, useApi } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { toast } from "sonner";
import { Logo, LogoMark } from "@/components/app/shell";
import {
  ArrowRight, BrainCircuit, CalendarCheck, DatabaseZap, Eye, EyeOff, Home,
  Loader2, Lock, Mail, ReceiptText, ShieldCheck,
} from "lucide-react";

/**
 * Staff sign-in — premium split-screen layout.
 *   Left  : the live-action job-site footage under a deep cinematic scrim with the
 *           brand story (headline, capability list, benchmark strip). Desktop only.
 *   Right : a solid, crisp form surface — labeled fields, one primary action, the
 *           one-click demo roles as tidy rows, homeowner escape hatch, security note.
 * Auth behavior (Bearer token + cookie session) is unchanged.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

const riseWrap: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const riseItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const DEMO_ACCOUNTS = [
  { email: "owner@ridgeline.demo", name: "Priya Shah", role: "Owner" },
  { email: "office@ridgeline.demo", name: "Marcus Lee", role: "Office" },
  { email: "estimator@ridgeline.demo", name: "Alex Rivera", role: "Estimator" },
  { email: "agency@ridgeline.demo", name: "Dana Whitfield", role: "Agency admin" },
];

const CAPABILITIES = [
  { icon: BrainCircuit, title: "AI lead qualification", desc: "Every inquiry scored HOT / WARM / COLD in seconds — no lead left waiting." },
  { icon: CalendarCheck, title: "Booked inspections", desc: "Self-serve scheduling that respects contact windows and consent rules." },
  { icon: ReceiptText, title: "Estimates to cash", desc: "Automated follow-up ladders and payment reconciliation on autopilot." },
];

const BENCHMARKS = [
  { value: "58.3%", label: "Booking rate" },
  { value: "83.3%", label: "Show rate" },
  { value: "50%", label: "Estimate accept" },
];

type DemoCensus = { empty: boolean; counts: { inquiries: number; contractors: number } };

export function SignInView() {
  const { loadSession } = useAppStore();
  const [email, setEmail] = useState("owner@ridgeline.demo");
  const [password, setPassword] = useState("demo");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  // Public census: when the database is intentionally empty (demo data removed from
  // Settings) nobody can sign in — offer the one-click fixtures install right here.
  const censusQ = useApi<DemoCensus>("/api/demo-data");
  const isEmpty = censusQ.data?.empty === true;

  useEffect(() => {
    if (!isEmpty) return;
    document.title = "RidgeLine — empty workspace";
  }, [isEmpty]);

  const loadDemoData = async () => {
    setSeeding(true);
    try {
      await api.post("/api/demo-data");
      toast("Demo data installed — pick a role to sign in");
      await censusQ.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load demo data");
    } finally {
      setSeeding(false);
    }
  };

  const signIn = async (em: string, pw: string) => {
    setBusy(true);
    setPending(em);
    try {
      await api.post("/api/session", { email: em, password: pw });
      await loadSession();
      toast(`Signed in as ${em}`);
      window.location.hash = "#/today";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ─────────────────────────── Brand panel (desktop) ─────────────────────────── */}
      <section className="relative hidden flex-1 overflow-hidden bg-neutral-950 lg:flex" aria-label="RidgeLine highlights">
        <video
          className="absolute inset-0 h-full w-full object-cover"
          src="/media/roof-hero.mp4"
          poster="/media/roof-hero-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden
        />
        {/* deep cinematic scrims — footage stays alive, text stays crisp */}
        <div className="absolute inset-0 bg-gradient-to-tr from-neutral-950/90 via-neutral-950/55 to-neutral-950/35" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/85 via-transparent to-neutral-950/45" aria-hidden />
        <div className="rl-dots pointer-events-none absolute inset-0 opacity-20" aria-hidden />

        <motion.div
          variants={riseWrap}
          initial="hidden"
          animate="show"
          className="relative z-10 flex h-full w-full flex-col justify-between px-10 py-9 xl:px-14"
        >
          <motion.div variants={riseItem} className="flex items-center justify-between">
            <Logo tone="light" tagline={false} />
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-white/70 backdrop-blur-sm">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Live demo workspace
            </p>
          </motion.div>

          <motion.div variants={riseItem} className="max-w-[560px]">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.28em] text-white/50">
              Built for roofing contractors
            </p>
            <h2 className="text-[38px] font-bold leading-[1.08] tracking-tight text-white xl:text-[44px]">
              Every lead answered.
              <br />
              Every estimate chased.
              <br />
              <span className="text-emerald-400">Every job billed.</span>
            </h2>
            <p className="mt-4 max-w-[480px] text-[14.5px] leading-relaxed text-white/60">
              The estimate desk that turns storm-season inquiries into booked inspections,
              signed estimates and reconciled payments — while your crew stays on the roof.
            </p>

            <ul className="mt-8 space-y-4">
              {CAPABILITIES.map((c) => (
                <li key={c.title} className="flex items-start gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.07] text-white/80 backdrop-blur-sm">
                    <c.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-semibold text-white/95">{c.title}</span>
                    <span className="block text-[12px] leading-relaxed text-white/50">{c.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div variants={riseItem} className="flex items-center gap-8 border-t border-white/10 pt-6">
            {BENCHMARKS.map((b) => (
              <div key={b.label}>
                <div className="text-[22px] font-bold tabular-nums tracking-tight text-white">{b.value}</div>
                <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45">{b.label}</div>
              </div>
            ))}
            <p className="ml-auto max-w-[230px] text-right text-[11px] leading-relaxed text-white/40">
              Demo workspace benchmarks — deterministic fixtures, real pipeline math.
            </p>
          </motion.div>
        </motion.div>
      </section>

      {/* ─────────────────────────── Form panel ─────────────────────────── */}
      <section className="relative flex w-full flex-col lg:w-[560px] lg:shrink-0 xl:w-[600px]" aria-label="Sign in">
        {/* subtle premium wash on the solid surface */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_100%_0%,var(--color-primary),transparent_60%)] opacity-[0.05]" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent lg:hidden" />

        {/* mobile brand band — compact, poster only (no autoplay video on phones) */}
        <div className="relative overflow-hidden bg-neutral-950 px-6 py-7 sm:px-10 lg:hidden">
          <img
            src="/media/roof-hero-poster.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 via-neutral-950/60 to-neutral-950/80" aria-hidden />
          <div className="relative flex items-center justify-between">
            <Logo tone="light" tagline={false} />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.08] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Live demo
            </span>
          </div>
          <p className="relative mt-4 max-w-[420px] text-[15px] font-semibold leading-snug text-white">
            Every lead answered. Every estimate chased. Every job billed.
          </p>
        </div>

        <motion.div
          variants={riseWrap}
          initial="hidden"
          animate="show"
          className="relative z-10 mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center px-6 py-10 sm:px-8 lg:px-12"
        >
          {/* desktop-only top row */}
          <motion.div variants={riseItem} className="mb-8 hidden items-center justify-between lg:flex">
            <Logo tone="dark" tagline={false} />
            <button
              onClick={() => (window.location.hash = "#/landing")}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Back to site <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </motion.div>

          <motion.div variants={riseItem}>
            <h1 className="text-[27px] font-bold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
              Sign in to your RidgeLine estimate desk.
            </p>
          </motion.div>

          <form
            className="mt-7 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void signIn(email, password);
            }}
          >
            <motion.div variants={riseItem} className="space-y-1.5">
              <Label htmlFor="email" className="text-[12.5px] font-semibold">Work email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" aria-hidden />
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl pl-10 text-[14px]"
                />
              </div>
            </motion.div>

            <motion.div variants={riseItem} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-[12.5px] font-semibold">Password</Label>
                <span className="text-[11px] text-muted-foreground">
                  demo password: <code className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">demo</code>
                </span>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" aria-hidden />
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-xl pl-10 pr-10 text-[14px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </motion.div>

            <motion.div variants={riseItem} className="pt-1">
              <Button
                type="submit"
                className="group h-12 w-full rounded-xl text-[14.5px] font-bold shadow-[0_16px_40px_-16px_var(--color-primary)] transition-all active:scale-[0.98]"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Sign in to RidgeLine
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </Button>
            </motion.div>
          </form>

          {isEmpty && (
            <motion.div variants={riseItem} className="mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] p-4">
              <p className="flex items-center gap-2 text-[13px] font-semibold">
                <DatabaseZap className="h-4 w-4" aria-hidden />
                Workspace is empty
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                All demo data was removed. Install the fixtures to enable sign-in.
              </p>
              <Button size="sm" className="mt-3 w-full gap-1.5" disabled={seeding} onClick={() => void loadDemoData()}>
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5" />}
                Load demo data
              </Button>
            </motion.div>
          )}

          {/* one-click demo roles */}
          <motion.div variants={riseItem} className="mt-7">
            <div className="flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                One-click demo roles
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="mt-4 grid gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => void signIn(a.email, "demo")}
                  disabled={busy}
                  className="group flex min-h-[54px] items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11.5px] font-bold text-primary">
                    {a.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{a.name}</span>
                    <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                      {a.role} · password demo
                    </span>
                  </span>
                  {pending === a.email ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-muted-foreground/70 transition-all group-hover:border-primary group-hover:bg-primary group-hover:text-primary-foreground">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* homeowner escape hatch + trust line */}
          <motion.div variants={riseItem} className="mt-7 space-y-2.5">
            <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <Home className="h-3.5 w-3.5" aria-hidden />
              Homeowner?{" "}
              <button
                className="font-semibold text-foreground underline underline-offset-2 transition-colors hover:text-primary"
                onClick={() => (window.location.hash = "#/public/intake")}
              >
                Book an inspection here
              </button>{" "}
              — no sign-in needed.
            </p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Sessions are HMAC-signed and expire after 30 days. Demo data is synthetic.
            </p>
          </motion.div>

          {/* mobile-only back link (desktop has it in the top row) */}
          <motion.p variants={riseItem} className="mt-8 text-center lg:hidden">
            <button
              onClick={() => (window.location.hash = "#/landing")}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowRight className="h-3.5 w-3.5 rotate-180" />
              Back to site
            </button>
          </motion.p>
        </motion.div>

        {/* footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
          className="relative z-10 mt-auto flex items-center justify-center gap-2 pb-6 pt-2 text-[11px] text-muted-foreground/70"
        >
          <LogoMark className="h-3.5 w-3.5 text-muted-foreground/70" />
          RidgeLine — estimate desk for roofing teams
        </motion.footer>
      </section>
    </div>
  );
}
