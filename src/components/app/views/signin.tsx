"use client";

import { useState } from "react";
import { motion, type Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { toast } from "sonner";
import { Logo } from "@/components/app/shell";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Home, Loader2, Lock } from "lucide-react";

/**
 * Staff sign-in — the same stage as the landing page: the live-action
 * job-site footage behind a heavy scrim, filmic grain, and one glass
 * card that rises into place with staggered fields. No decorative
 * side-imagery, no clip-art: just brand, form, and one-click demo roles.
 * Auth behavior (Bearer token + cookie session) is unchanged.
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

export function SignInView() {
  const { loadSession } = useAppStore();
  const [email, setEmail] = useState("owner@ridgeline.demo");
  const [password, setPassword] = useState("demo");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

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
        <button
          onClick={() => (window.location.hash = "#/landing")}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to site
        </button>
        <Logo tone="light" tagline={false} />
      </motion.header>

      {/* the stage: form on the left, demo roles on the right */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-5 pb-14 pt-6 sm:px-8">
        <motion.div
          variants={riseWrap}
          initial="hidden"
          animate="show"
          className="mx-auto grid w-full max-w-[940px] items-stretch gap-5 md:grid-cols-[1fr_380px] md:gap-7"
        >
          {/* left — the sign-in form */}
          <motion.div
            variants={riseItem}
            className="mx-auto w-full max-w-[460px] rounded-3xl border border-white/10 bg-white/[0.07] p-6 shadow-[0_60px_130px_-35px_rgba(0,0,0,0.9)] backdrop-blur-2xl sm:p-8 md:mx-0"
          >
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/85">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
              Estimate desk for roofing teams
            </p>
            <h1 className="text-[26px] font-bold tracking-tight text-white">Sign in to RidgeLine</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/55">
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
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 rounded-xl border-white/15 bg-white/[0.08] text-white placeholder:text-white/35 focus-visible:border-white/30 focus-visible:ring-white/20"
                />
              </motion.div>
              <motion.div variants={riseItem} className="space-y-1.5">
                <Label htmlFor="password" className="text-[12.5px] font-semibold text-white/80">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl border-white/15 bg-white/[0.08] pr-10 text-white focus-visible:border-white/30 focus-visible:ring-white/20"
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
                <p className="text-[11px] text-white/45">
                  Demo password <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10.5px] text-white/75">demo</code>
                </p>
              </motion.div>
              <motion.div variants={riseItem}>
                <Button
                  type="submit"
                  className="group h-11 w-full rounded-xl bg-white text-[14px] font-semibold text-neutral-900 shadow-lg transition-all hover:bg-white/90 hover:shadow-xl"
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
          </motion.div>

          {/* right — one-click demo roles */}
          <motion.div
            variants={riseItem}
            className="mx-auto flex w-full max-w-[460px] flex-col rounded-3xl border border-white/10 bg-white/[0.05] p-6 shadow-[0_40px_110px_-40px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-7 md:mx-0"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">
              One-click demo roles
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/45">
              Pick a seat and you’re in — the workspace is fully seeded.
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => void signIn(a.email, "demo")}
                  disabled={busy}
                  className="group flex min-h-[56px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-left backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-[12px] font-bold text-white/85 transition-colors group-hover:bg-white group-hover:text-neutral-900">
                    {a.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-white/90">{a.name}</span>
                    <span className="block text-[10.5px] font-medium uppercase tracking-wide text-white/45">{a.role}</span>
                  </span>
                  {pending === a.email ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/80" />
                  ) : (
                    <ArrowRight className="h-4 w-4 shrink-0 text-white/30 transition-all group-hover:translate-x-0.5 group-hover:text-white/80" />
                  )}
                </button>
              ))}
            </div>
            <div className="mt-auto pt-5">
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
