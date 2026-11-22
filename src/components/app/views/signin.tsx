"use client";

import { useEffect, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, useApi } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { toast } from "sonner";
import { Logo } from "@/components/app/shell";
import { ArrowRight, DatabaseZap, Eye, EyeOff, Home, Loader2, Lock, Mail } from "lucide-react";

/**
 * Staff sign-in — the same stage as the landing page: live-action
 * job-site footage behind light scrims and filmic grain. Two fully
 * transparent outline cards rise into place: the sign-in form sits to
 * the left, the one-click demo roles panel to the right — fields and
 * buttons pick up color on hover and press. Auth behavior (Bearer
 * token + cookie session) is unchanged.
 */

const EASE = [0.22, 1, 0.36, 1] as const;

const riseWrap: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};

const riseItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

const DEMO_ACCOUNTS = [
  { email: "owner@ridgeline.demo", name: "Priya Shah", role: "Owner" },
  { email: "office@ridgeline.demo", name: "Marcus Lee", role: "Office" },
  { email: "estimator@ridgeline.demo", name: "Alex Rivera", role: "Estimator" },
  { email: "agency@ridgeline.demo", name: "Dana Whitfield", role: "Agency admin" },
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
    <div className="grain relative flex min-h-screen flex-col overflow-hidden bg-neutral-950">
      {/* same live-action footage as the landing hero — one continuous brand */}
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
      {/* light scrims — the footage stays clearly visible; the glass cards keep text readable */}
      <div className="absolute inset-0 bg-neutral-950/40" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/60 via-transparent to-neutral-950/25" aria-hidden />
      <div className="rl-dots pointer-events-none absolute inset-0 opacity-25" aria-hidden />

      {/* top bar */}
      <motion.header
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8"
      >
        <Logo tone="light" tagline={false} />
        <button
          onClick={() => (window.location.hash = "#/landing")}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          Back to site <ArrowRight className="h-4 w-4" />
        </button>
      </motion.header>

      {/* the stage: sign-in form pinned to the left corner, demo roles on the right */}
      <main className="relative z-10 flex flex-1 items-center px-5 pb-12 pt-4 sm:px-8 md:px-12">
        <motion.div
          variants={riseWrap}
          initial="hidden"
          animate="show"
          className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-stretch gap-6 md:grid-cols-2 lg:gap-12"
        >
          {/* left corner — the sign-in form */}
          <motion.div variants={riseItem} className="w-full max-w-[500px] self-center justify-self-center md:justify-self-start">
            <div className="relative overflow-hidden rounded-[28px] border border-white/20 bg-transparent shadow-[0_50px_120px_-40px_rgba(0,0,0,0.8)]">
                {/* top sheen + brand glows over the live footage */}
                <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                <div aria-hidden className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary/30 blur-[110px]" />
                <div aria-hidden className="absolute -bottom-32 -left-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-[110px]" />

                <div className="relative p-6 sm:p-8">
                  <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/85">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
                    Estimate desk for roofing teams
                  </p>
                  <h1 className="text-[26px] font-bold tracking-tight text-white sm:text-[28px]">Sign in to RidgeLine</h1>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
                    Staff access only — homeowners can book an inspection without an account.
                  </p>

                  <form
                    className="mt-7 space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void signIn(email, password);
                    }}
                  >
                    <motion.div variants={riseItem} className="space-y-1.5">
                      <Label htmlFor="email" className="text-[12.5px] font-semibold text-white/80">Work email</Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
                        <Input
                          id="email"
                          type="email"
                          autoComplete="username"
                          placeholder="you@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          required
                          className="h-12 rounded-xl border-white/15 bg-transparent pl-10 text-white placeholder:text-white/35 transition-colors hover:border-white/35 hover:bg-white/10 focus-visible:border-white/45 focus-visible:bg-white/[0.12] focus-visible:ring-white/20"
                        />
                      </div>
                    </motion.div>
                    <motion.div variants={riseItem} className="space-y-1.5">
                      <Label htmlFor="password" className="text-[12.5px] font-semibold text-white/80">Password</Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
                        <Input
                          id="password"
                          type={showPw ? "text" : "password"}
                          autoComplete="current-password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="h-12 rounded-xl border-white/15 bg-transparent pl-10 pr-10 text-white transition-colors hover:border-white/35 hover:bg-white/10 focus-visible:border-white/45 focus-visible:bg-white/[0.12] focus-visible:ring-white/20"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((v) => !v)}
                          aria-label={showPw ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 transition-colors hover:text-white"
                        >
                          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="flex items-center gap-2 pt-0.5 text-[11px] text-white/45">
                        Demo password
                        <code className="rounded-lg border border-white/15 bg-transparent px-2 py-1 font-mono text-[10.5px] font-semibold text-white/80">demo</code>
                      </p>
                    </motion.div>
                    <motion.div variants={riseItem} className="pt-1">
                      <Button
                        type="submit"
                        className="group h-12 w-full rounded-xl bg-white text-[14.5px] font-bold text-neutral-900 shadow-[0_20px_50px_-14px_rgba(255,255,255,0.4)] transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-[0_24px_60px_-14px_rgba(0,0,0,0.5)] active:scale-[0.98]"
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
                            Sign in
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                          </>
                        )}
                      </Button>
                    </motion.div>
                  </form>
                </div>
            </div>
          </motion.div>

          {/* right corner — one-click demo roles */}
          <motion.div variants={riseItem} className="w-full max-w-[500px] self-center justify-self-center md:justify-self-end">
            <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-white/20 bg-transparent p-6 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.8)] sm:p-7">
                {/* top sheen + brand glows over the live footage */}
                <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                <div aria-hidden className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-primary/30 blur-[110px]" />
                <div aria-hidden className="absolute -bottom-24 -right-20 h-52 w-52 rounded-full bg-emerald-500/10 blur-[110px]" />

                <div className="relative">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/50">
                    One-click demo roles
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/55">
                    Pick a seat and you’re in — the workspace is fully seeded.
                  </p>
                  {isEmpty && (
                    <div className="mt-3 rounded-2xl border border-white/20 bg-white/[0.06] p-3">
                      <p className="text-[12.5px] font-semibold text-white/90">Workspace is empty</p>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">
                        All demo data was removed. Install the fixtures to enable sign-in.
                      </p>
                      <Button
                        size="sm"
                        className="mt-2.5 w-full gap-1.5"
                        disabled={seeding}
                        onClick={() => void loadDemoData()}
                      >
                        {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5" />}
                        Load demo data
                      </Button>
                    </div>
                  )}
                </div>

                <div className="relative mt-5 flex flex-1 flex-col justify-center gap-2.5">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      onClick={() => void signIn(a.email, "demo")}
                      disabled={busy}
                      className="group flex min-h-[58px] items-center gap-3 rounded-2xl border border-white/15 bg-transparent p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/45 hover:bg-white/[0.12] hover:shadow-[0_18px_45px_-20px_rgba(255,255,255,0.3)] active:bg-white/[0.16] focus-visible:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-60"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-transparent text-[12.5px] font-bold text-white/75 ring-1 ring-inset ring-white/25">
                        {a.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-white/95">{a.name}</span>
                        <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-white/45">{a.role}</span>
                      </span>
                      {pending === a.email ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/80" />
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-transparent text-white/40 transition-all group-hover:border-white/40 group-hover:bg-white group-hover:text-neutral-900">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="relative mt-auto pt-5">
                  <p className="flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-4 text-[12.5px] text-white/55">
                    <Home className="h-3.5 w-3.5" aria-hidden />
                    Homeowner?{" "}
                    <button
                      className="font-medium text-white/85 underline underline-offset-2 transition-colors hover:text-white"
                      onClick={() => (window.location.hash = "#/public/intake")}
                    >
                      Book an inspection here
                    </button>{" "}
                    — no sign-in needed.
                  </p>
                </div>
            </div>
          </motion.div>
        </motion.div>
      </main>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.6 }}
        className="relative z-10 pb-6 text-center text-[11px] text-white/35"
      >
        RidgeLine · demo data is synthetic · Postgres-ready · GHL connector simulated
      </motion.footer>
    </div>
  );
}
