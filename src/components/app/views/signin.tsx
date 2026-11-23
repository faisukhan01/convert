"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, useApi } from "@/hooks/use-api";
import { useAppStore } from "@/store/app";
import { toast } from "sonner";
import { Logo } from "@/components/app/shell";
import { Eye, EyeOff, Loader2 } from "lucide-react";

/**
 * Staff sign-in. Kept deliberately boring: the landing page sells the
 * product, this screen just needs to get people in. One centered form,
 * the demo accounts listed underneath so reviewers don't have to type
 * anything, and a short footer. Auth behavior (Bearer token + cookie
 * session) is unchanged.
 */

const DEMO_ACCOUNTS = [
  { email: "owner@ridgeline.demo", name: "Priya Shah", role: "Owner, Summit Roofing Co." },
  { email: "office@ridgeline.demo", name: "Marcus Lee", role: "Office, Summit Roofing Co." },
  { email: "estimator@ridgeline.demo", name: "Alex Rivera", role: "Estimator, Summit Roofing Co." },
  { email: "agency@ridgeline.demo", name: "Dana Whitfield", role: "Agency admin" },
  { email: "owner2@ridgeline.demo", name: "Sam Ortiz", role: "Owner, North Peak Exteriors" },
];

type DemoCensus = { empty: boolean; counts: { inquiries: number; contractors: number } };

export function SignInView() {
  const { loadSession } = useAppStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Public census: when the database has no users at all (demo data was
  // removed from Settings) nobody can sign in — offer the fixtures
  // install right here so the workspace can be recovered.
  const censusQ = useApi<DemoCensus>("/api/demo-data");
  const isEmpty = censusQ.data?.empty === true;

  useEffect(() => {
    const prev = document.title;
    document.title = "Sign in — RidgeLine";
    return () => {
      document.title = prev;
    };
  }, []);

  const loadDemoData = async () => {
    setSeeding(true);
    try {
      await api.post("/api/demo-data");
      toast("Demo data installed — pick an account below to sign in");
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
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <a
          href="#/landing"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="RidgeLine home"
        >
          <Logo tagline={false} />
        </a>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-10 sm:pt-16">
        <div className="w-full max-w-[380px]">
          <h1 className="text-xl font-semibold tracking-tight">Sign in to RidgeLine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use your work email and password.
          </p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void signIn(email, password);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {isEmpty && (
            <div className="mt-6 rounded-lg border border-amber-600/40 bg-amber-500/10 p-3">
              <p className="text-sm font-medium">Workspace is empty</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The demo data was removed from Settings, so there are no accounts left to
                sign in with. Install it again to recreate them.
              </p>
              <Button size="sm" className="mt-3" disabled={seeding} onClick={() => void loadDemoData()}>
                {seeding && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Install demo data
              </Button>
            </div>
          )}

          <section className="mt-8" aria-label="Demo accounts">
            <h2 className="text-sm font-medium">Demo accounts</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Click one to sign in directly. Every account uses the password{" "}
              <code className="rounded border bg-muted px-1 py-0.5 font-mono text-[11px]">demo</code>.
            </p>
            <ul className="mt-3 divide-y overflow-hidden rounded-lg border bg-background">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    onClick={() => void signIn(a.email, "demo")}
                    disabled={busy}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium leading-tight">{a.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.role}</span>
                    </span>
                    {pending === a.email ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{a.email}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <p className="mt-6 text-sm text-muted-foreground">
            Homeowner?{" "}
            <a
              href="#/public/intake"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              Book an inspection
            </a>{" "}
            instead — no account needed.
          </p>
        </div>
      </main>

      <footer className="border-t bg-background px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} RidgeLine ·{" "}
        <a href="#/landing" className="underline underline-offset-2 hover:text-foreground">
          Back to site
        </a>
      </footer>
    </div>
  );
}
