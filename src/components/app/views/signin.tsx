"use client";


import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { toast } from "sonner";
import { Logo } from "@/components/app/shell";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Home, Loader2 } from "lucide-react";

/**
 * Staff sign-in — a focused, centered entry point on a quiet dark backdrop.
 * No decorative imagery: just the brand, the form, and one-click demo roles.
 * All auth behavior (Bearer token + cookie session) is unchanged.
 */

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
      {/* backdrop: soft brand glow + faint dot grid — no imagery */}
      <div className="rl-dots pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        aria-hidden
        style={{ background: "radial-gradient(60% 100% at 50% 0%, rgba(30,76,126,0.28) 0%, rgba(30,76,126,0.06) 55%, transparent 100%)" }}
      />

      {/* top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <button
          onClick={() => (window.location.hash = "#/landing")}
          className="inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-medium text-white/60 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to site
        </button>
        <span className="[&_span]:text-white"><Logo compact /></span>
      </header>

      {/* centered card */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-5 pb-16 pt-6 sm:px-8">
        <div className="w-full max-w-[440px]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-8">
            <h1 className="text-[24px] font-bold tracking-tight text-white">Sign in to RidgeLine</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/55">
              The estimate desk for roofing teams. Staff access only — homeowners can book without an account.
            </p>

            <form
              className="mt-7 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void signIn(email, password);
              }}
            >
              <div className="space-y-1.5">
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
              </div>
              <div className="space-y-1.5">
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
              </div>
              <Button
                type="submit"
                className="h-11 w-full rounded-xl bg-white text-[14px] font-semibold text-neutral-900 shadow-lg hover:bg-white/90"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* one-click demo roles */}
          <p className="mb-3 mt-8 text-center text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">
            One-click demo roles
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                onClick={() => void signIn(a.email, "demo")}
                disabled={busy}
                className="group flex min-h-[56px] items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] p-3 text-left transition-all hover:border-white/25 hover:bg-white/[0.1] focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-[12px] font-bold text-white/85 transition-colors group-hover:bg-white group-hover:text-neutral-900">
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

          <p className="mt-8 flex items-center justify-center gap-1.5 text-[12.5px] text-white/50">
            <Home className="h-3.5 w-3.5" />
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
      </main>

      <footer className="relative z-10 pb-6 text-center text-[11px] text-white/35">
        RidgeLine · demo data is synthetic · Postgres-ready · GHL connector simulated
      </footer>
    </div>
  );
}
