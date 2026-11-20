"use client";


import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { toast } from "sonner";
import { Logo } from "@/components/app/shell";
import { ArrowRight, Eye, EyeOff, Home, Loader2 } from "lucide-react";

/**
 * Staff sign-in — a considered, editorial entry point: a full-height
 * photography panel carrying the brand moment, and a focused form on the
 * warm workspace palette. Demo roles remain one click; all auth behavior
 * (Bearer token + cookie session) is unchanged.
 */

const DEMO_ACCOUNTS = [
  { email: "owner@ridgeline.demo", name: "Priya Shah", role: "Owner", blurb: "Works the queue, books inspections, sends quotes." },
  { email: "office@ridgeline.demo", name: "Marcus Lee", role: "Office", blurb: "Callbacks, assignment, payment matching." },
  { email: "estimator@ridgeline.demo", name: "Alex Rivera", role: "Estimator", blurb: "Phone view: assigned visits and outcomes." },
  { email: "agency@ridgeline.demo", name: "Dana Whitfield", role: "Agency admin", blurb: "Provisions contractors, verifies connections." },
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
    <div className="grain flex min-h-screen flex-col bg-background lg:flex-row">
      {/* ── photography panel ── */}
      <aside className="relative hidden overflow-hidden bg-neutral-950 lg:block lg:w-[45%]" aria-label="RidgeLine brand">
        <img
          src="/img/roofing/signin-a.webp"
          alt="Roofer working a steep roof at golden hour"
          className="rl-kenburns absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/90 via-neutral-950/20 to-neutral-950/40" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/30 to-transparent" aria-hidden />

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-12">
          <div className="[&_span]:text-white">
            <Logo />
          </div>

          {/* product moment card */}
          <div className="self-start rounded-2xl border border-white/15 bg-white/10 p-2 shadow-2xl backdrop-blur-md">
            <img
              src="/img/roofing/signin-b.webp"
              alt="A finished home at dusk"
              className="h-40 w-56 rounded-xl object-cover"
              loading="lazy"
            />
            <div className="flex items-center justify-between px-2.5 py-2">
              <p className="text-[11px] font-semibold text-white/90">E-1043 · accepted</p>
              <p className="text-[11px] font-bold text-emerald-300">$6,900</p>
            </div>
          </div>

          <div className="max-w-sm">
            <p className="font-display text-[24px] font-[450] leading-snug text-white/95">
              “Every quote followed up. Every dollar accounted for.”
            </p>
            <p className="mt-3 text-[12px] font-medium uppercase tracking-[0.22em] text-white/50">
              The estimate desk for roofing teams
            </p>
          </div>
        </div>
      </aside>

      {/* ── form panel ── */}
      <main className="relative flex flex-1 flex-col">
        {/* mobile photo strip */}
        <div className="relative h-52 overflow-hidden lg:hidden">
          <img
            src="/img/roofing/signin-a.webp"
            alt="Roofer working a steep roof at golden hour"
            className="absolute inset-0 h-full w-full object-cover object-[center_30%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-neutral-950/30 to-neutral-950/50" aria-hidden />
          <div className="absolute left-5 top-5 [&_span]:text-white">
            <Logo />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
          <div className="w-full max-w-[430px]">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">Staff portal</p>
            <h1 className="font-display text-[34px] font-[560] leading-tight tracking-tight md:text-[38px]">
              Welcome back to the <em className="font-[450] italic text-primary">desk</em>.
            </h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Sign in to pick up the queue. Local demo path with seeded roles — when OIDC is
              configured, staff sign-in moves to your identity provider.
            </p>

            <form
              className="mt-8 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void signIn(email, password);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[12.5px] font-semibold">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-11 rounded-xl border-border/80 bg-card shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[12.5px] font-semibold">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-xl border-border/80 bg-card pr-10 shadow-sm focus-visible:ring-2 focus-visible:ring-ring/40"
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
                <p className="text-[11px] text-muted-foreground">
                  Demo password <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px]">demo</code>
                </p>
              </div>
              <Button type="submit" className="h-11 w-full rounded-xl text-[14px] font-semibold shadow-lg" disabled={busy}>
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

            {/* demo roles */}
            <div className="mt-9">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-foreground/55">
                One-click demo roles
              </p>
              <div className="space-y-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    onClick={() => void signIn(a.email, "demo")}
                    disabled={busy}
                    className="group flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-accent/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 min-h-[44px]"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      {a.name.split(" ").map((n) => n[0]).join("")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="text-[13.5px] font-semibold text-foreground">{a.name}</span>
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{a.role}</span>
                      </span>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{a.blurb}</span>
                    </span>
                    {pending === a.email ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <p className="mt-8 flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Home className="h-3.5 w-3.5" />
              Homeowner?{" "}
              <button
                className="font-medium underline underline-offset-2 transition-colors hover:text-foreground"
                onClick={() => (window.location.hash = "#/public/intake")}
              >
                Open the public booking flow
              </button>{" "}
              — no sign-in needed.
            </p>
          </div>
        </div>

        <footer className="mt-auto border-t bg-sidebar py-3 text-center text-[11px] text-muted-foreground">
          RidgeLine · roofing estimate desk · demo data is synthetic · Postgres-ready · GHL connector simulated
        </footer>
      </main>
    </div>
  );
}
