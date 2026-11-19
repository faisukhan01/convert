"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { toast } from "sonner";
import { Logo } from "@/components/app/shell";

const DEMO_ACCOUNTS = [
  { email: "owner@ridgeline.demo", name: "Priya Shah", role: "Owner / office manager", blurb: "Works the queue, books inspections, sends quotes." },
  { email: "office@ridgeline.demo", name: "Marcus Lee", role: "Office", blurb: "Callbacks, assignment, payment matching." },
  { email: "estimator@ridgeline.demo", name: "Alex Rivera", role: "Estimator", blurb: "Phone view: assigned visits and outcomes." },
  { email: "agency@ridgeline.demo", name: "Dana Whitfield", role: "Agency admin", blurb: "Provisions contractors, verifies connections." },
];

export function SignInView() {
  const { loadSession } = useAppStore();
  const [email, setEmail] = useState("owner@ridgeline.demo");
  const [password, setPassword] = useState("demo");
  const [busy, setBusy] = useState(false);

  const signIn = async (em: string, pw: string) => {
    setBusy(true);
    try {
      await api.post("/api/session", { email: em, password: pw });
      await loadSession();
      toast(`Signed in as ${em}`);
      window.location.hash = "#/today";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-4xl">
          <div className="flex justify-center mb-6"><Logo /></div>
          <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] items-start">
            <section className="rounded-xl border bg-card p-6">
              <h1 className="text-lg font-semibold">Sign in</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Local demo path with seeded roles. When OIDC is configured (see docs), staff sign-in moves to your identity provider.
              </p>
              <form
                className="mt-5 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void signIn(email, password);
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground">Demo password: <code className="rounded bg-muted px-1">demo</code></p>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>Sign in</Button>
              </form>
            </section>

            <section aria-label="Demo roles" className="space-y-2.5">
              <h2 className="text-sm font-semibold text-muted-foreground">One-click demo roles</h2>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => void signIn(a.email, "demo")}
                  disabled={busy}
                  className="w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{a.name} <span className="ml-1 text-xs font-normal text-muted-foreground">· {a.role}</span></div>
                      <div className="text-xs text-muted-foreground">{a.blurb}</div>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">{a.email}</span>
                  </div>
                </button>
              ))}
              <p className="pt-1 text-[11px] text-muted-foreground">
                Homeowner? <button className="underline underline-offset-2 hover:text-foreground" onClick={() => (window.location.hash = "#/public/intake")}>Open the public booking flow</button> — no sign-in needed.
              </p>
            </section>
          </div>
        </div>
      </main>
      <footer className="mt-auto border-t bg-sidebar py-3 text-center text-[11px] text-muted-foreground">
        RidgeLine · roofing estimate desk · demo data is synthetic · Postgres-ready · GHL connector simulated
      </footer>
    </div>
  );
}
