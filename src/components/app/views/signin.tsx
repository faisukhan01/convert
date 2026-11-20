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
import { ArrowLeft, ArrowRight, Eye, EyeOff, Home, Loader2, Lock, Mail } from "lucide-react";

/**
 * Staff sign-in — the same stage as the landing page: live-action
 * job-site footage behind light scrims and filmic grain. Two layered
 * glass cards rise into place: the sign-in form sits to the left, the
 * one-click demo roles panel to the right. Auth behavior (Bearer token
 * + cookie session) is unchanged.
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

/** Per-role avatar duotones — small, tasteful, consistent on dark glass. */
const ROLE_AVATAR: Record<string, string> = {
  "Priya Shah": "from-violet-500/90 to-purple-500/90",
  "Marcus Lee": "from-amber-500/90 to-orange-500/90",
  "Alex Rivera": "from-emerald-500/90 to-teal-500/90",
  "Dana Whitfield": "from-rose-500/90 to-pink-500/90",
};

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

      {/* the stage: sign-in form pinned to the left, demo roles on the right */}
      <main className="relative z-10 flex flex-1 items-center px-5 pb-12 pt-4 sm:px-8 md:px-10">
        <motion.div
          variants={riseWrap}
          initial="hidden"
          animate="show"
          className="mx-auto grid w-full max-w-[1040px] items-stretch gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)] md:gap-7 lg:gap-10"
        >
          {/* left — the sign-in form */}
          <motion.div variants={riseItem} className="mx-auto w-full max-w-[480px] md:mx-0">
            <div className="rounded-[26px] bg-gradient-to-b from-white/30 via-white/[0.09] to-white/[0.04] p-px shadow-[0_60px_130px_-35px_rgba(0,0,0,0.9)]">
              <div className="relative overflow-hidden rounded-[25px] bg-neutral-950/60 backdrop-blur-2xl">
                {/* top sheen + brand glows */}
                <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/50 to-transparent" />
                <div aria-hidden className="absolute -right-20 -top-24 h-60 w-60 rounded-full bg-primary/25 blur-3xl" />
                <div aria-hidden className="absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-emerald-500/15 blur-3xl" />

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
                          className="h-12 rounded-xl border-white/15 bg-white/[0.07] pl-10 text-white placeholder:text-white/35 transition-colors focus-visible:border-white/35 focus-visible:ring-white/15"
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
                          className="h-12 rounded-xl border-white/15 bg-white/[0.07] pl-10 pr-10 text-white transition-colors focus-visible:border-white/35 focus-visible:ring-white/15"
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
                        <code className="rounded-lg border border-white/10 bg-white/[0.07] px-2 py-1 font-mono text-[10.5px] font-semibold text-white/80">demo</code>
                      </p>
                    </motion.div>
                    <motion.div variants={riseItem} className="pt-1">
                      <Button
                        type="submit"
                        className="group h-12 w-full rounded-xl bg-white text-[14.5px] font-bold text-neutral-900 shadow-[0_20px_50px_-14px_rgba(255,255,255,0.4)] transition-all hover:bg-white/90 hover:shadow-[0_24px_60px_-14px_rgba(255,255,255,0.5)]"
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
            </div>
          </motion.div>

          {/* right — one-click demo roles */}
          <motion.div variants={riseItem} className="mx-auto w-full max-w-[480px] md:mx-0">
            <div className="h-full rounded-[26px] bg-gradient-to-b from-white/25 via-white/[0.08] to-white/[0.03] p-px shadow-[0_40px_110px_-40px_rgba(0,0,0,0.85)]">
              <div className="relative flex h-full flex-col overflow-hidden rounded-[25px] bg-neutral-950/50 p-6 backdrop-blur-2xl sm:p-7">
                {/* top sheen + brand glow */}
                <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                <div aria-hidden className="absolute -left-16 -top-20 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />

                <div className="relative">
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/45">
                    One-click demo roles
                  </p>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/50">
                    Pick a seat and you’re in — the workspace is fully seeded.
                  </p>
                </div>

                <div className="relative mt-5 flex flex-col gap-2.5">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      onClick={() => void signIn(a.email, "demo")}
                      disabled={busy}
                      className="group flex min-h-[58px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.09] hover:shadow-[0_18px_45px_-20px_rgba(255,255,255,0.35)] focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-60"
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-[12.5px] font-bold text-white ring-1 ring-inset ring-white/25 ${
                          ROLE_AVATAR[a.name] ?? "from-white/25 to-white/10"
                        }`}
                      >
                        {a.name.split(" ").map((n) => n[0]).join("")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-white/95">{a.name}</span>
                        <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-white/45">{a.role}</span>
                      </span>
                      {pending === a.email ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/80" />
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/40 transition-all group-hover:border-white/30 group-hover:bg-white group-hover:text-neutral-900">
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
