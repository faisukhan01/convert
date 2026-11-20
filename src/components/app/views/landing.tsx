"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Bell,
  CalendarCheck2,
  Check,
  FileText,
  Inbox,
  LayoutDashboard,
  MapPin,
  MousePointerClick,
  Phone,
  Play,
  Plus,
  Search,
  Send,
  TrendingUp,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from "framer-motion";
import { navigate, useAppStore } from "@/store/app";
import { Logo } from "@/components/app/shell";

/**
 * RidgeLine marketing landing — the front door of the product.
 * Real live-action hero footage (Coverr, free license), real job-site
 * photography, actual screenshots of the running product inside a
 * browser frame, and scroll-driven motion (framer-motion): the desk
 * morphs flat as it enters, then auto-tours every real screen on a
 * timed loop; a living bento grid shows the messy middle automated.
 */

const HERO = {
  video: "/media/roof-hero.mp4",
  poster: "/media/roof-hero-poster.jpg",
};

const WORDMARKS = [
  "Summit Roofing Co.",
  "North Peak Exteriors",
  "Bluepine Roofing",
  "Ironclad Exteriors",
  "Cedarline Roofing",
  "Harvest Ridge",
];

/**
 * The pages shown inside the interactive product preview. Every "screen"
 * below is real DOM — no screenshots — so the preview behaves like the
 * running app: click a page in the sidebar and the view switches.
 */
const APP_PAGES = [
  { key: "today", label: "Today", icon: LayoutDashboard, url: "app.ridgeline.dev/#/today" },
  { key: "inquiries", label: "Inquiries", icon: Inbox, url: "app.ridgeline.dev/#/inquiries" },
  { key: "estimates", label: "Estimates", icon: FileText, url: "app.ridgeline.dev/#/estimates" },
  { key: "reports", label: "Reports", icon: BarChart3, url: "app.ridgeline.dev/#/reports" },
] as const;

const FLOW = [
  {
    n: "01",
    img: "/img/roofing/storm-tarp.jpg",
    alt: "Crew securing a tarp over a storm-damaged roof",
    title: "Every inquiry, one desk",
    copy: "Phone calls, website forms, referrals and storm-season walk-ins land in a single queue — deduplicated, time-stamped and owned.",
    points: ["Never ask “who called whom?” again", "Duplicates flagged before they cost you", "Homeowners book inspections themselves"],
  },
  {
    n: "02",
    img: "/img/roofing/tearoff.jpg",
    alt: "Two roofers tearing off shingles ahead of a re-roof",
    title: "Inspections that leave a paper trail",
    copy: "Visit outcomes, photos and measurements are captured on the spot. The estimator’s phone view shows today’s route and nothing else.",
    points: ["Booked, completed, no-show — tracked", "Assignments balanced across the crew", "Follow-ups scheduled the moment you leave"],
  },
  {
    n: "03",
    img: "/img/app/estimates.png",
    alt: "RidgeLine estimates board with status badges",
    title: "Quotes that chase themselves",
    copy: "The desk sends the estimate, sees the moment it’s opened, and nudges the homeowner on your behalf until you get an answer.",
    points: ["Viewed / accepted / declined, visible", "Automatic nudges at smart intervals", "Revisions without losing history"],
    isShot: true,
  },
  {
    n: "04",
    img: "/img/roofing/finished-house.jpg",
    alt: "A finished craftsman home with a new roof",
    title: "From approval to paid invoice",
    copy: "Accepted quotes flow to invoices and matched payments. Aging views show exactly which jobs are stuck and for how long.",
    points: ["Payments matched to estimates", "Overdue stages flagged in red", "Reports your accountant will like"],
  },
];

/* ────────────── motion presets ────────────── */

const EASE = [0.22, 1, 0.36, 1] as const;

const headWrap: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.04 } },
};

const headItem: Variants = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
};

/* ────────────── helpers ────────────── */

function useRevealOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".rv"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** CTAs: signed-in visitors go straight to the desk; everyone else goes to sign-in. */
function ctaNavigate() {
  const authed = !!useAppStore.getState().session?.user;
  navigate(authed ? "/today" : "/signin");
}

/** A browser-chrome frame around real product screenshots. */
function BrowserFrame({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <figure className={`overflow-hidden rounded-xl border border-border bg-card shadow-[0_40px_90px_-40px_rgba(15,23,42,0.5)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/70 px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        </span>
        <span className="ml-2 truncate rounded-md border border-border/70 bg-background px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      {children}
    </figure>
  );
}

/* ────────────── sections ────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const authed = !!useAppStore((s) => s.session?.user);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links = [
    { label: "Product", id: "product" },
    { label: "Features", id: "features" },
    { label: "How it works", id: "how" },
  ];
  return (
    <motion.header
      initial={{ y: -72, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: EASE }}
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,box-shadow] duration-300 ${
        scrolled
          ? "border-b border-border/60 bg-background/85 shadow-[0_10px_36px_-22px_rgba(15,23,42,0.35)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="RidgeLine — back to top"
          className="rounded-md outline-offset-4"
        >
          <Logo tagline={false} tone={scrolled ? "dark" : "light"} />
        </button>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Landing sections">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollToSection(l.id)}
              className={`rounded-full px-3.5 py-1.5 text-[13.5px] font-medium transition-colors ${
                scrolled
                  ? "text-foreground/70 hover:bg-foreground/5 hover:text-foreground"
                  : "text-white/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-1.5 md:flex">
          {!authed && (
            <button
              onClick={ctaNavigate}
              className={`rounded-full px-4 py-2 text-[13.5px] font-semibold transition-colors ${
                scrolled
                  ? "text-foreground/80 hover:bg-accent hover:text-foreground"
                  : "text-white/90 hover:bg-white/15 hover:text-white"
              }`}
            >
              Sign in
            </button>
          )}
          <button
            onClick={ctaNavigate}
            className="group inline-flex items-center gap-1.5 rounded-full bg-primary px-[18px] py-2 text-[13.5px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 hover:shadow-primary/40"
          >
            Open the app
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        <button
          className={`rounded-lg p-2 md:hidden ${scrolled ? "text-foreground" : "text-white"}`}
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden border-b border-border/60 bg-background/95 backdrop-blur-xl md:hidden"
          >
            <div className="px-5 py-4">
              {links.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    setOpen(false);
                    scrollToSection(l.id);
                  }}
                  className="block w-full rounded-lg px-2 py-2.5 text-left text-sm font-medium text-foreground/80 hover:bg-accent"
                >
                  {l.label}
                </button>
              ))}
              {!authed && (
                <button
                  onClick={() => {
                    setOpen(false);
                    ctaNavigate();
                  }}
                  className="mt-1 block w-full rounded-lg px-2 py-2.5 text-left text-sm font-medium text-foreground/80 hover:bg-accent"
                >
                  Sign in
                </button>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  ctaNavigate();
                }}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                Open the app <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

function Hero() {
  return (
    <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-neutral-950">
      {/* live-action footage — real job site, real roofer */}
      <video
        className="absolute inset-0 h-full w-full object-cover"
        src={HERO.video}
        poster={HERO.poster}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden
      />
      {/* scrims */}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/92 via-neutral-950/30 to-neutral-950/55" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/60 via-neutral-950/10 to-transparent" aria-hidden />

      {/* copy */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-24 pt-40 md:px-8 md:pb-28">
        <p className="rv is-in mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90 backdrop-blur-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Estimate desk for roofing teams
        </p>
        <h1 className="rv is-in max-w-3xl text-[42px] font-bold leading-[1.05] tracking-tight text-white sm:text-6xl md:text-[72px]">
          Every roofing job, on one desk.
        </h1>
        <p className="rv is-in mt-6 max-w-xl text-[15px] leading-relaxed text-white/75 md:text-lg">
          RidgeLine tracks the inquiries, books the inspections, chases every quote and matches every
          payment — so your crew builds roofs, not paperwork.
        </p>
        <div className="rv is-in mt-9 flex flex-wrap items-center gap-3.5">
          <button
            onClick={ctaNavigate}
            className="group inline-flex min-h-[48px] items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-neutral-900 shadow-2xl transition-transform hover:scale-[1.03]"
          >
            <Play className="h-4 w-4 fill-neutral-900" />
            Open the live demo
          </button>
          <button
            onClick={() => scrollToSection("how")}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 text-[15px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            See how it works
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <span className="text-[12.5px] font-medium text-white/55">Free demo · four roles · zero setup</span>
        </div>
      </div>
    </section>
  );
}

function Wordmarks() {
  return (
    <section aria-label="Teams using RidgeLine" className="border-b border-border/70 bg-background py-9">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground/70">
          Demo teams running their desk on RidgeLine
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
          {WORDMARKS.map((w) => (
            <span key={w} className="text-[16px] font-semibold tracking-tight text-foreground/30">
              {w}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────── the living product preview — pure DOM, zero screenshots ────────────── */

/** A small section label inside a preview screen. */
function PreviewLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-0.5 pb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-muted-foreground sm:text-[10px]">
      {children}
    </p>
  );
}

/** One queue row inside a preview screen — avatar, tag pill, context, deadline chip. */
function QueueRow({
  initials,
  avatarCls,
  tag,
  tagCls,
  name,
  sub,
  due,
  dueCls,
  className = "",
}: {
  initials: string;
  avatarCls: string;
  tag: string;
  tagCls: string;
  name: string;
  sub: string;
  due: string;
  dueCls: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border border-border/60 bg-card px-2.5 py-2 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.35)] transition-colors hover:border-primary/30 ${className}`}
    >
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ring-1 sm:h-8 sm:w-8 sm:text-[10px] ${avatarCls}`}>
        {initials}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[11.5px] font-semibold text-foreground sm:text-[13px]">{name}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold sm:text-[9.5px] ${tagCls}`}>{tag}</span>
        </span>
        <span className="mt-1 block truncate text-[10px] text-muted-foreground sm:text-[11px]">{sub}</span>
      </span>
      <span className={`shrink-0 rounded-md px-2 py-1 text-[8.5px] font-semibold sm:text-[10px] ${dueCls}`}>{due}</span>
    </div>
  );
}

/** A preview screen header bar — page title, search, notifications, crew avatars. */
function PreviewHead({ title, chip }: { title: string; chip?: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/70 bg-gradient-to-r from-muted/70 via-muted/30 to-transparent px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="text-[12.5px] font-bold tracking-tight text-foreground sm:text-[14.5px]">{title}</span>
        {chip && (
          <span className="hidden rounded-full border border-border bg-background px-2 py-0.5 text-[9px] font-semibold text-muted-foreground md:inline">
            {chip}
          </span>
        )}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <span className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-background px-2.5 py-1 text-[9.5px] font-medium text-muted-foreground lg:flex">
          <Search className="h-2.5 w-2.5" aria-hidden />
          Search jobs…
          <span className="rounded border border-border/70 bg-muted px-1 font-mono text-[7.5px] text-muted-foreground/70">⌘K</span>
        </span>
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground">
          <Bell className="h-3 w-3" aria-hidden />
          <span className="absolute -right-px -top-px h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-background" aria-hidden />
        </span>
        <span className="hidden -space-x-1.5 sm:flex" aria-hidden>
          {["PS", "ML", "AR"].map((i) => (
            <span key={i} className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/85 text-[7.5px] font-bold text-background ring-2 ring-background">
              {i}
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.14em] text-emerald-600 sm:text-[9.5px]">
          <span className="relative flex h-1.5 w-1.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          live
        </span>
      </span>
    </div>
  );
}

/** Page 1 — Today: KPI strip, the response queue, today's route, awaiting replies. */
const TODAY_KPIS = [
  { icon: Phone, label: "Need response", value: "3", sub: "2 overdue", tone: "text-amber-600", bar: "30%", barCls: "bg-amber-500" },
  { icon: CalendarCheck2, label: "Inspections", value: "2", sub: "next 10:00 AM", tone: "text-emerald-600", bar: "45%", barCls: "bg-emerald-500" },
  { icon: Send, label: "Awaiting reply", value: "3", sub: "1 just opened", tone: "text-primary", bar: "62%", barCls: "bg-primary" },
];

function TodayMock() {
  return (
    <div className="flex h-full flex-col bg-background">
      <PreviewHead title="Today" chip="Wednesday · June 12" />
      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-2 border-b border-border/60 bg-muted/25 px-3 py-2.5 sm:px-4 sm:py-3">
        {TODAY_KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-border/60 bg-card px-3 py-2 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)]">
            <p className="flex items-center gap-1.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[10px]">
              <k.icon className="h-3 w-3" aria-hidden />
              {k.label}
            </p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-[16px] font-bold tracking-tight text-foreground sm:text-[22px]">{k.value}</span>
              <span className={`text-[8.5px] font-bold sm:text-[10.5px] ${k.tone}`}>{k.sub}</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted sm:mt-2">
              <div className={`h-full rounded-full ${k.barCls}`} style={{ width: k.bar }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 gap-2 px-3 py-2.5 sm:grid-cols-[1.15fr_1fr] sm:gap-2.5 sm:px-4 sm:py-3">
        {/* needs a response — rows stretch to fill the panel */}
        <div className="flex min-h-0 flex-col rounded-xl border border-border/60 bg-muted/25 p-2 sm:p-2.5">
          <div className="flex items-center justify-between px-0.5 pb-2">
            <PreviewLabel>Needs a response</PreviewLabel>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[8.5px] font-bold text-amber-700 sm:text-[9.5px]">3 open</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <QueueRow
              className="min-h-0 flex-1"
              initials="MW"
              avatarCls="bg-amber-500/15 text-amber-700 ring-amber-500/30"
              tag="Missed call"
              tagCls="bg-amber-500/15 text-amber-700"
              name="Marcus Webb"
              sub="Loose shingles after Tuesday's storm"
              due="Call by 12:00"
              dueCls="bg-amber-500/15 text-amber-700"
            />
            <QueueRow
              className="min-h-0 flex-1"
              initials="MC"
              avatarCls="bg-primary/10 text-primary ring-primary/25"
              tag="New call"
              tagCls="bg-primary/10 text-primary"
              name="McAllister Residence"
              sub="Roof replacement quote · Berry Lane"
              due="Respond 2:00"
              dueCls="bg-primary/10 text-primary"
            />
            <QueueRow
              className="min-h-0 flex-1"
              initials="GN"
              avatarCls="bg-emerald-500/15 text-emerald-700 ring-emerald-500/30"
              tag="Web form"
              tagCls="bg-emerald-500/15 text-emerald-700"
              name="Grace Nolan"
              sub="Requested estimate · attach report"
              due="Assign now"
              dueCls="bg-emerald-500/15 text-emerald-700"
            />
            <QueueRow
              className="min-h-0 flex-1"
              initials="DP"
              avatarCls="bg-primary/10 text-primary ring-primary/25"
              tag="Referral"
              tagCls="bg-emerald-500/15 text-emerald-700"
              name="Dana Park"
              sub="Storm claim · 3 photos missing"
              due="Today 4:00"
              dueCls="bg-foreground/5 text-foreground/70"
            />
          </div>
          <p className="px-0.5 pt-2 text-[9px] font-medium text-muted-foreground sm:text-[10px]">
            + 9 more today · every row has an owner and a deadline
          </p>
        </div>

        {/* right column — route + awaiting replies (desktop preview only) */}
        <div className="hidden min-h-0 flex-col gap-2 sm:flex sm:gap-2.5">
          <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/60 bg-muted/25 p-2 sm:p-2.5">
            <PreviewLabel>Inspections today</PreviewLabel>
            <div className="relative flex min-h-0 flex-1 flex-col justify-between gap-1.5 pl-0.5">
              <span className="absolute bottom-3 left-[10px] top-3 w-px bg-border" aria-hidden />
              {[
                { time: "10:00", name: "Rosa Alvarez", sub: "118 Alder Creek Rd · with Alex R.", state: "En route" },
                { time: "1:30", name: "Dwight Alderman", sub: "44 Summit Pass · with Marcus L.", state: "Booked" },
                { time: "4:00", name: "Parker Lind", sub: "9 Cedar Falls Ln · walk-the-roof", state: "Confirmed" },
              ].map((r) => (
                <div key={r.name} className="relative flex flex-1 items-center gap-2">
                  <span className="relative z-10 h-[8px] w-[8px] shrink-0 rounded-full bg-primary ring-[3px] ring-primary/15" aria-hidden />
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/60 bg-card px-2 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] font-semibold text-foreground sm:text-[12px]">{r.name}</span>
                        <span className="shrink-0 rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-[8.5px] font-semibold text-foreground/70 sm:text-[9.5px]">{r.time}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] text-muted-foreground sm:text-[10px]">{r.sub}</span>
                    </span>
                    <span className="hidden shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 md:inline">{r.state}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-h-0 flex-[0.9] flex-col rounded-xl border border-primary/25 bg-primary/[0.06] p-2 sm:p-2.5">
            <PreviewLabel>Estimates awaiting a reply</PreviewLabel>
            <div className="flex min-h-0 flex-1 flex-col justify-between gap-1.5">
              <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-primary/20 bg-card px-2 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-foreground sm:text-[12px]">E-1043 · Grace Nolan</span>
                  <span className="mt-0.5 block truncate text-[9px] text-muted-foreground sm:text-[10px]">Viewed 11:47 AM · nudge tomorrow</span>
                </span>
                <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[9.5px] font-bold text-primary sm:text-[11px]">$8,500</span>
              </div>
              <div className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-2 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-foreground sm:text-[12px]">E-1044 · Webb Residence</span>
                  <span className="mt-0.5 block truncate text-[9px] text-muted-foreground sm:text-[10px]">Sent 8:15 AM · opens tracked</span>
                </span>
                <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[9.5px] font-bold text-primary sm:text-[11px]">$4,250</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Page 2 — Inquiries: a real pipeline table — owner, source, status, next step. */
const INQUIRIES = [
  { name: "Grace Nolan", initials: "GN", av: "bg-primary/10 text-primary ring-primary/25", src: "Web form", srcTone: "bg-primary/10 text-primary", status: "New", stTone: "bg-amber-500/15 text-amber-700", next: "Assign an estimator", owner: "PS", age: "4m" },
  { name: "Marcus Webb", initials: "MW", av: "bg-amber-500/15 text-amber-700 ring-amber-500/30", src: "Missed call", srcTone: "bg-amber-500/15 text-amber-700", status: "Contacted", stTone: "bg-foreground/5 text-foreground/70", next: "Call back before noon", owner: "ML", age: "26m" },
  { name: "Rosa Alvarez", initials: "RA", av: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30", src: "Referral", srcTone: "bg-emerald-500/15 text-emerald-700", status: "Booked", stTone: "bg-emerald-500/15 text-emerald-700", next: "Inspection · Fri 10:00", owner: "AR", age: "1h" },
  { name: "Dwight Alderman", initials: "DA", av: "bg-rose-500/10 text-rose-700 ring-rose-500/25", src: "Walk-in", srcTone: "bg-foreground/5 text-foreground/70", status: "Booked", stTone: "bg-emerald-500/15 text-emerald-700", next: "Photo report · today", owner: "ML", age: "3h" },
  { name: "Dana Park", initials: "DP", av: "bg-primary/10 text-primary ring-primary/25", src: "Missed call", srcTone: "bg-amber-500/15 text-amber-700", status: "New", stTone: "bg-amber-500/15 text-amber-700", next: "Call back 3:30 PM", owner: "PS", age: "12m" },
  { name: "Parker Lind", initials: "PL", av: "bg-primary/10 text-primary ring-primary/25", src: "Web form", srcTone: "bg-primary/10 text-primary", status: "Contacted", stTone: "bg-foreground/5 text-foreground/70", next: "Walk-the-roof · 4:00", owner: "AR", age: "4h" },
  { name: "Elliot Hayes", initials: "EH", av: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30", src: "Referral", srcTone: "bg-emerald-500/15 text-emerald-700", status: "Booked", stTone: "bg-emerald-500/15 text-emerald-700", next: "Inspection · Mon 9:00", owner: "ML", age: "5h" },
];

function InquiriesMock() {
  return (
    <div className="flex h-full flex-col bg-background">
      <PreviewHead title="Inquiries" chip="calls · forms · referrals" />
      {/* toolbar */}
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/25 px-3 py-2 sm:gap-2 sm:px-4 sm:py-2.5">
        {["All · 12", "New · 2", "Booked · 4"].map((f, i) => (
          <span
            key={f}
            className={`rounded-full px-2.5 py-1 text-[9px] font-semibold sm:text-[10px] ${
              i === 0 ? "bg-foreground text-background" : "border border-border/70 bg-card text-muted-foreground"
            }`}
          >
            {f}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[9px] font-bold text-primary-foreground sm:text-[10px]">
          <Plus className="h-3 w-3" aria-hidden /> New inquiry
        </span>
      </div>
      {/* table head */}
      <div className="hidden grid-cols-[1.2fr_0.75fr_0.8fr_1.25fr_auto] gap-2 border-b border-border/60 bg-muted/40 px-4 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:grid">
        <span>Homeowner</span>
        <span>Source</span>
        <span>Status</span>
        <span>Next step</span>
        <span className="text-right">Age</span>
      </div>
      {/* rows — stretch to fill the page (last rows desktop-only on small screens) */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {INQUIRIES.map((r, i) => (
          <div
            key={r.name}
            className={`${i >= 4 ? "hidden sm:flex" : "flex"} flex-1 items-center gap-2 border-b border-border/50 px-3 transition-colors last:border-0 hover:bg-muted/40 sm:grid sm:grid-cols-[1.2fr_0.75fr_0.8fr_1.25fr_auto] sm:gap-2 sm:px-4`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ring-1 sm:h-8 sm:w-8 sm:text-[10px] ${r.av}`}>
                {r.initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-semibold text-foreground sm:text-[13px]">{r.name}</span>
                <span className="block truncate text-[8.5px] text-muted-foreground sm:hidden">Owner {r.owner} · {r.age} ago</span>
              </span>
            </span>
            <span className="hidden sm:block">
              <span className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold sm:text-[10.5px] ${r.srcTone}`}>{r.src}</span>
            </span>
            <span className="hidden sm:block">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-bold sm:text-[10.5px] ${r.stTone}`}>
                <span className="h-1 w-1 rounded-full bg-current" aria-hidden />
                {r.status}
              </span>
            </span>
            <span className="hidden truncate text-[10.5px] font-medium text-muted-foreground sm:block sm:text-[11.5px]">{r.next}</span>
            <span className="hidden shrink-0 text-right text-[10px] font-medium text-muted-foreground sm:block sm:text-[11px]">{r.age} ago</span>
          </div>
        ))}
      </div>
      {/* footer strip */}
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-2 text-[9.5px] font-medium text-muted-foreground sm:px-4 sm:py-2.5 sm:text-[10.5px]">
        <span>12 open · 2 unassigned</span>
        <span className="flex items-center gap-1 font-semibold text-amber-700">Oldest lead 2d · assigned</span>
      </div>
    </div>
  );
}

/** Page 3 — Estimates: sent → viewed → accepted, with live nudges. */
const EST_COLS = [
  {
    label: "Sent",
    count: 4,
    total: "$27.4k",
    cards: [
      { id: "E-1046", name: "Parker Lind", amt: "$6,900", sub: "sent 9:40 AM", bar: "18%", barCls: "bg-foreground/30" },
      { id: "E-1044", name: "Webb Residence", amt: "$4,250", sub: "sent 8:15 AM", bar: "12%", barCls: "bg-foreground/30" },
      { id: "E-1042", name: "Alderman Roof", amt: "$16,250", sub: "sent Yesterday", bar: "22%", barCls: "bg-foreground/30" },
    ],
  },
  {
    label: "Viewed",
    count: 3,
    total: "$16.3k",
    live: true,
    cards: [
      { id: "E-1043", name: "Grace Nolan", amt: "$8,500", sub: "opened 11:47 AM · nudge day 3", bar: "55%", barCls: "bg-primary" },
      { id: "E-1040", name: "Cedar Falls Duplex", amt: "$7,800", sub: "opened 9:12 AM · nudge day 2", bar: "48%", barCls: "bg-primary" },
    ],
  },
  {
    label: "Accepted",
    count: 2,
    total: "$31.4k",
    done: true,
    cards: [
      { id: "E-1039", name: "Rosa Alvarez", amt: "$12,480", sub: "deposit due Fri", bar: "100%", barCls: "bg-emerald-500" },
      { id: "E-1037", name: "Miller Residence", amt: "$18,900", sub: "crew scheduled · Jul 2", bar: "100%", barCls: "bg-emerald-500" },
    ],
  },
];

function EstimatesMock() {
  return (
    <div className="flex h-full flex-col bg-background">
      <PreviewHead title="Estimates" chip="sent → viewed → accepted" />
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 px-3 pb-2.5 pt-3 sm:gap-2.5 sm:px-4 sm:pb-3.5 sm:pt-3.5">
        {EST_COLS.map((c) => (
          <div
            key={c.label}
            className={`flex min-h-0 flex-col rounded-xl border p-2 sm:p-2.5 ${
              c.done
                ? "border-emerald-500/25 bg-emerald-500/[0.05]"
                : c.live
                  ? "border-primary/25 bg-primary/[0.05]"
                  : "border-border/60 bg-muted/25"
            }`}
          >
            <div className="flex items-center justify-between px-0.5 pb-2">
              <span className="flex items-center gap-1.5 text-[9.5px] font-bold text-foreground/85 sm:text-[11px]">
                {c.done ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                ) : c.live ? (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-foreground/25" aria-hidden />
                )}
                {c.label}
                <span className="rounded bg-background/80 px-1.5 py-0.5 text-[8px] font-bold text-muted-foreground sm:text-[9.5px]">{c.count}</span>
              </span>
              <span className="hidden text-[9px] font-bold text-foreground/60 sm:block sm:text-[10.5px]">{c.total}</span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {c.cards.map((k) => (
                <div
                  key={k.id}
                  className={`flex min-h-0 flex-1 flex-col justify-center rounded-xl border bg-card p-2 shadow-[0_8px_20px_-14px_rgba(15,23,42,0.4)] sm:p-2.5 ${
                    c.live ? "border-primary/30" : "border-border/60"
                  }`}
                >
                  <p className="hidden items-center justify-between text-[9px] font-semibold text-muted-foreground sm:flex sm:text-[10px]">
                    <span className="font-mono">{k.id}</span>
                    <span className="text-[11px] font-bold text-foreground sm:text-[14px]">{k.amt}</span>
                  </p>
                  <p className="flex items-center justify-between gap-1.5 sm:hidden">
                    <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-30" aria-hidden />
                    <span className="shrink-0 text-[11.5px] font-bold text-foreground">{k.amt}</span>
                  </p>
                  <p className="mt-1 hidden truncate text-[11px] font-bold text-foreground sm:block sm:text-[12.5px]">{k.name}</p>
                  <p className="mt-0.5 hidden items-center gap-1 truncate text-[8.5px] text-muted-foreground sm:flex sm:text-[9.5px]">
                    {c.live && <span className="h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />}
                    {k.sub}
                  </p>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: k.bar }}
                      transition={{ duration: 0.7, ease: EASE }}
                      className={`h-full rounded-full ${k.barCls}`}
                    />
                  </div>
                </div>
              ))}
              {/* ghost card — the pipeline keeps going (sent column only) */}
              {c.cards.length < 3 && (
                <div className="rounded-xl border border-dashed border-border/50 p-2 opacity-50 sm:p-2.5">
                  <span className="block h-1.5 w-2/3 rounded bg-muted" />
                  <span className="mt-1.5 block h-1.5 w-1/2 rounded bg-muted" />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* footer strip */}
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-2 text-[9.5px] font-medium text-muted-foreground sm:px-4 sm:py-2.5 sm:text-[10.5px]">
        <span>Median time to answer · 2d 4h</span>
        <span className="font-semibold text-emerald-600">2 accepted this week</span>
      </div>
    </div>
  );
}

/** Page 4 — Reports: KPI cards, the week's bookings, location leaderboard. */
const REPORT_KPIS = [
  { label: "Booked rate", value: "92%", delta: "+4.1 pt", bar: "92%", barCls: "bg-emerald-500" },
  { label: "Collected · 30d", value: "$148k", delta: "+12.2%", bar: "68%", barCls: "bg-primary" },
  { label: "Median response", value: "6m", delta: "2m faster", bar: "78%", barCls: "bg-primary" },
];
const REPORT_BARS = [34, 52, 44, 66, 58, 78, 91];
const REPORT_DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const REPORT_LOCS = [
  { name: "Summit Roofing Co.", v: 92 },
  { name: "North Peak Exteriors", v: 78 },
  { name: "Cedarline Roofing", v: 96 },
  { name: "Ironclad Exteriors", v: 71 },
];

function ReportsMock() {
  const max = Math.max(...REPORT_BARS);
  return (
    <div className="flex h-full flex-col bg-background">
      <PreviewHead title="Reports" chip="every branch, side by side" />
      <div className="grid grid-cols-3 gap-2 px-3 pt-3 sm:gap-2.5 sm:px-4 sm:pt-3.5">
        {REPORT_KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-border/60 bg-card px-3 py-2 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)]">
            <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground sm:text-[9.5px]">{k.label}</p>
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-1.5">
              <p className="text-[16px] font-bold tracking-tight text-foreground sm:text-[22px]">{k.value}</p>
              <p className="flex items-center gap-0.5 text-[8.5px] font-semibold text-emerald-600 sm:text-[10px]">
                <TrendingUp className="h-3 w-3" aria-hidden />
                {k.delta}
              </p>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted sm:mt-2">
              <div className={`h-full rounded-full ${k.barCls}`} style={{ width: k.bar }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex min-h-0 flex-1 gap-2 px-3 pb-2.5 sm:mt-3 sm:gap-2.5 sm:px-4 sm:pb-3">
        {/* the week's bars draw themselves in */}
        <div className="flex min-h-0 flex-[1.4] flex-col rounded-xl border border-border/60 bg-muted/25 p-2.5 sm:p-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">Booked inquiries · this week</p>
          <div className="flex min-h-0 flex-1 items-end gap-1.5 pt-2 sm:gap-2.5">
            {REPORT_BARS.map((v, i) => (
              <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                {v === max && (
                  <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold text-white sm:text-[9px]">92%</span>
                )}
                <motion.div
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.6, delay: 0.06 * i, ease: EASE }}
                  style={{ height: `${v}%`, transformOrigin: "bottom" }}
                  className={`w-full rounded-t-[5px] ${
                    v === max ? "bg-gradient-to-t from-emerald-500/80 to-emerald-400" : "bg-gradient-to-t from-primary/75 to-primary"
                  }`}
                />
                <span className={`text-[8.5px] font-medium sm:text-[9.5px] ${v === max ? "font-bold text-emerald-600" : "text-muted-foreground"}`}>
                  {REPORT_DAYS[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
        {/* per-location leaderboard (desktop preview only) */}
        <div className="hidden min-h-0 flex-1 flex-col rounded-xl border border-border/60 bg-muted/25 p-2.5 sm:flex sm:p-3">
          <p className="flex items-center gap-1 pb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground sm:text-[10px]">
            <MapPin className="h-3 w-3" aria-hidden /> By location
          </p>
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-2">
            {REPORT_LOCS.map((loc, i) => (
              <div key={loc.name} className="flex-1">
                <div className="flex items-center justify-between gap-2 text-[9px] sm:text-[10.5px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[8px] font-bold ${
                        i === 0 ? "bg-emerald-500 text-white" : "bg-foreground/5 text-foreground/60"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate font-semibold text-foreground/85">{loc.name}</span>
                  </span>
                  <span className="shrink-0 font-bold text-foreground/70">{loc.v}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${loc.v}%` }}
                    transition={{ duration: 0.8, delay: 0.15 + i * 0.12, ease: EASE }}
                    className={`h-full rounded-full ${i === 0 ? "bg-emerald-500" : "bg-primary"}`}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-2 py-2">
            <span className="text-[8.5px] font-bold text-amber-700 sm:text-[9.5px]">Collectible overdue</span>
            <span className="text-[9px] font-bold text-amber-700 sm:text-[11px]">$12.9k · 3 invoices</span>
          </div>
        </div>
      </div>
      {/* footer strip */}
      <div className="flex items-center justify-between border-t border-border/60 bg-muted/25 px-3 py-2 text-[9.5px] font-medium text-muted-foreground sm:px-4 sm:py-2.5 sm:text-[10.5px]">
        <span>Quarter to date · all locations</span>
        <span className="font-semibold text-primary">Export ready · CSV &amp; PDF</span>
      </div>
    </div>
  );
}

/**
 * The interactive desk: a working miniature of the product rendered in
 * pure DOM — no screenshots. Clicking a page in the sidebar jumps there
 * (exactly like the real app) and the tour keeps rolling: one page
 * every 3 seconds, forever. A click just restarts the 3-second clock.
 */
function AppPreview() {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);

  /* the tour never stops — every 3 seconds the desk advances to the next
     page, even right after the user picks a page from the sidebar. */
  useEffect(() => {
    const t = setTimeout(() => {
      setActive((a) => (a + 1) % APP_PAGES.length);
      setCycle((c) => c + 1);
    }, 3000);
    return () => clearTimeout(t);
  }, [cycle]);

  const jump = (i: number) => {
    if (i === active) return;
    setActive(i);
    setCycle((c) => c + 1);
  };

  const page = APP_PAGES[active];

  return (
    <div className="relative">
      <BrowserFrame label={page.url}>
        <div className="relative flex h-[430px] w-full overflow-hidden bg-background sm:aspect-[16/10] sm:h-auto">
          {/* the sidebar — click a page to switch to it (desktop) */}
          <aside className="hidden w-[190px] shrink-0 flex-col border-r border-border/70 bg-muted/50 px-2.5 pb-2.5 pt-3 sm:flex">
            <div className="px-1.5 pb-3">
              <Logo compact tone="dark" />
            </div>
            <div className="flex flex-col gap-1" role="tablist" aria-label="Product pages">
              {APP_PAGES.map((p, i) => {
                const on = i === active;
                return (
                  <button
                    key={p.key}
                    role="tab"
                    aria-selected={on}
                    onClick={() => jump(i)}
                    className={`relative flex min-h-[36px] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition-colors ${
                      on
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {on && (
                      <motion.span
                        layoutId="preview-nav"
                        className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                        aria-hidden
                      />
                    )}
                    <p.icon className="h-3.5 w-3.5 shrink-0" />
                    {p.label}
                    {on && (
                      <span className="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-primary">
                        viewing
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-auto rounded-lg border border-dashed border-border/70 px-2.5 py-2 text-[9.5px] leading-snug text-muted-foreground">
              Demo workspace · four roles · synthetic data
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            {/* the sidebar, as page chips on small screens */}
            <div className="flex gap-1.5 overflow-x-auto border-b border-border/70 bg-muted/50 px-2 py-2 sm:hidden" role="tablist" aria-label="Product pages">
              {APP_PAGES.map((p, i) => (
                <button
                  key={p.key}
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => jump(i)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    i === active
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 bg-card text-muted-foreground"
                  }`}
                >
                  <p.icon className="h-3 w-3" />
                  {p.label}
                </button>
              ))}
            </div>

            {/* the active page — switches on sidebar click or on tour */}
            <div className="relative min-h-0 flex-1">
              <AnimatePresence mode="wait">
                <motion.div
                  key={page.key}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -22 }}
                  transition={{ duration: 0.42, ease: EASE }}
                  className="absolute inset-0"
                >
                  {active === 0 && <TodayMock />}
                  {active === 1 && <InquiriesMock />}
                  {active === 2 && <EstimatesMock />}
                  {active === 3 && <ReportsMock />}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </BrowserFrame>
    </div>
  );
}

/**
 * The product section: the headline reveals in staggered lines and the
 * desk arrives flat and still — a stable stage for the living preview
 * inside (which tours itself and switches on sidebar clicks).
 */
function Product() {
  return (
    <section id="product" className="scroll-mt-16 bg-background py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div
          variants={headWrap}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-15%" }}
          className="mx-auto mb-14 max-w-2xl text-center md:mb-16"
        >
          <motion.p
            variants={headItem}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.07] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-primary"
          >
            <MousePointerClick className="h-3.5 w-3.5" aria-hidden />
            The product
          </motion.p>
          <motion.h2
            variants={headItem}
            className="text-balance text-[40px] font-bold leading-[1.04] tracking-tight text-foreground md:text-[58px]"
          >
            One desk. <span className="text-primary">Every decision.</span>
          </motion.h2>
        </motion.div>

        <div className="relative">
          {/* ambient glow behind the desk */}
          <div
            aria-hidden
            style={{
              background:
                "radial-gradient(58% 58% at 50% 42%, oklch(0.43 0.095 243 / 0.13), transparent 72%)",
            }}
            className="absolute -inset-x-10 -top-12 bottom-0 rounded-[64px] blur-2xl md:-inset-x-16"
          />

          {/* the desk — perfectly still, lands flat, then tours itself */}
          <motion.div
            initial={{ opacity: 0, y: 34 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.75, ease: EASE }}
          >
            <AppPreview />
          </motion.div>

          {/* hint — the preview is live, not a screenshot */}
          <p className="mt-7 flex items-center justify-center gap-2 text-center text-[12.5px] font-medium text-muted-foreground">
            <MousePointerClick className="h-4 w-4 text-primary" aria-hidden />
            Interactive preview — click a page in the sidebar; the tour keeps rolling to the next page every 3 seconds.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ────────────── living visuals for the feature bento ────────────── */

const QUEUE_FEED = [
  { tag: "New call", tone: "bg-amber-500/10 text-amber-700", text: "McAllister Residence", meta: "respond by 2:00 PM" },
  { tag: "Web form", tone: "bg-primary/10 text-primary", text: "Quote request · Berry Lane", meta: "assign an estimator" },
  { tag: "Referral", tone: "bg-emerald-500/10 text-emerald-700", text: "Alderman Residence", meta: "inspection Fri 10:00 AM" },
];

const PIPELINE = [
  { label: "Sent", sub: "E-1043 · Grace Nolan" },
  { label: "Viewed", sub: "opened 11:47 AM", live: true },
  { label: "Nudged", sub: "auto follow-up · day 3" },
  { label: "Accepted", sub: "$8,500 · deposit due", done: true },
];

const CARD =
  "group relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_22px_55px_-34px_rgba(15,23,42,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_34px_75px_-32px_rgba(15,23,42,0.5)]";

/**
 * Feature bento: "the messy middle, automated." Every card carries its
 * own small, living visual — a queue that cycles, a pipeline that
 * pulses.
 */
function Features() {
  const [feed, setFeed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFeed((f) => (f + 1) % QUEUE_FEED.length), 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <section id="features" className="scroll-mt-16 border-y border-border/70 bg-muted/40 py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div
          variants={headWrap}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-15%" }}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <motion.p variants={headItem} className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
            Why RidgeLine
          </motion.p>
          <motion.h2 variants={headItem} className="text-4xl font-bold leading-[1.08] tracking-tight md:text-[48px]">
            The messy middle, automated.
          </motion.h2>
          <motion.p variants={headItem} className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            The work between the first call and the final payment is where roofing teams lose money.
            RidgeLine closes every gap — automatically, and on the record.
          </motion.p>
        </motion.div>

        <motion.div
          variants={headWrap}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-10%" }}
          className="grid gap-5 lg:grid-cols-6"
        >
          {/* the queue — cycles live */}
          <motion.div variants={headItem} className={`${CARD} flex flex-col p-6 lg:col-span-4`}>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Inbox className="h-[18px] w-[18px]" />
              </span>
              <h3 className="text-[17px] font-bold tracking-tight">One queue, zero spreadsheets</h3>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Calls, web forms and referrals land in one queue — deduplicated, time-stamped and owned
              by a real person with a real deadline.
            </p>
            <div className="mt-5 flex flex-1 flex-col rounded-xl border border-border/70 bg-background/60 p-3.5">
              <div className="flex items-center justify-between px-1 pb-2.5">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Today · needs a response
                </span>
                <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
                  <span className="relative flex h-1.5 w-1.5" aria-hidden>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                  live
                </span>
              </div>
              <div className="flex flex-1 flex-col justify-center gap-2.5 py-2">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={feed}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3.5 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`shrink-0 rounded-md px-2 py-1 text-[10.5px] font-bold ${QUEUE_FEED[feed].tone}`}>
                        {QUEUE_FEED[feed].tag}
                      </span>
                      <span className="truncate text-[13.5px] font-semibold text-foreground">
                        {QUEUE_FEED[feed].text}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11.5px] font-medium text-muted-foreground">
                      {QUEUE_FEED[feed].meta}
                    </span>
                  </motion.div>
                </AnimatePresence>
                {/* dimmed depth rows — the queue keeps going */}
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/60 px-3.5 py-3 opacity-60">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10.5px] font-bold text-muted-foreground">
                      Missed call
                    </span>
                    <span className="truncate text-[13.5px] font-semibold text-foreground/75">Marcus Webb</span>
                  </span>
                  <span className="shrink-0 text-[11.5px] font-medium text-muted-foreground/80">call back before noon</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/60 px-3.5 py-3 opacity-40">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[10.5px] font-bold text-muted-foreground">
                      Walk-in
                    </span>
                    <span className="truncate text-[13.5px] font-semibold text-foreground/75">Parker Lind</span>
                  </span>
                  <span className="shrink-0 text-[11.5px] font-medium text-muted-foreground/80">quote · roof replacement</span>
                </div>
              </div>
              <p className="px-1 pt-2 text-[11px] font-medium text-muted-foreground">
                + 12 more in the queue today · every row has an owner and a deadline
              </p>
            </div>
          </motion.div>

          {/* quotes that chase */}
          <motion.div variants={headItem} className={`${CARD} p-6 lg:col-span-2`}>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Send className="h-[18px] w-[18px]" />
              </span>
              <h3 className="text-[17px] font-bold tracking-tight">Quotes that chase themselves</h3>
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              The desk sees the moment a quote is opened — and nudges the homeowner for you until
              there is an answer.
            </p>
            <div className="mt-5">
              {PIPELINE.map((p, i) => (
                <div key={p.label} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < PIPELINE.length - 1 && (
                    <span className="absolute bottom-0 left-[9px] top-[22px] w-px bg-border" aria-hidden />
                  )}
                  <span className="relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full">
                    {p.done ? (
                      <span className="flex h-[19px] w-[19px] items-center justify-center rounded-full bg-emerald-500 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : (
                      <span
                        className={`h-[11px] w-[11px] rounded-full ${
                          p.live ? "bg-primary" : "border-2 border-primary/45 bg-background"
                        }`}
                      />
                    )}
                    {p.live && (
                      <motion.span
                        animate={{ scale: [1, 2.1], opacity: [0.55, 0] }}
                        transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
                        className="absolute inset-0 rounded-full bg-primary"
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-bold text-foreground">{p.label}</span>
                    <span className="block text-[11.5px] text-muted-foreground">{p.sub}</span>
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

        </motion.div>
      </div>
    </section>
  );
}

/**
 * How it works: a timeline rail that draws itself with scroll progress,
 * numbered badges springing in, and each step sliding up as you read.
 */
function How() {
  const railRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: railRef, offset: ["start 78%", "end 62%"] });
  const lineScale = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.6 });

  return (
    <section id="how" className="scroll-mt-16 bg-background py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div variants={headWrap} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-15%" }} className="mb-16 max-w-2xl">
          <motion.p variants={headItem} className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
            How it works
          </motion.p>
          <motion.h2 variants={headItem} className="text-4xl font-bold leading-[1.08] tracking-tight md:text-[48px]">
            From first call to final payment.
          </motion.h2>
        </motion.div>

        <div ref={railRef} className="relative mt-4">
          {/* static rail */}
          <div className="absolute bottom-3 left-[20px] top-3 w-px bg-border md:left-1/2" aria-hidden />
          {/* progress rail — draws with scroll */}
          <motion.div
            style={{ scaleY: lineScale }}
            className="absolute bottom-3 left-[20px] top-3 w-[2px] origin-top rounded-full bg-gradient-to-b from-primary via-primary to-emerald-500 md:-ml-px md:left-1/2"
            aria-hidden
          />

          <ol className="space-y-16 md:space-y-24">
            {FLOW.map((step, i) => (
              <li key={step.n} className="relative grid gap-6 pl-14 md:grid-cols-2 md:items-center md:gap-14 md:pl-0">
                {/* numbered badge on the rail */}
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true, margin: "-25%" }}
                  transition={{ type: "spring", stiffness: 320, damping: 17, delay: 0.08 }}
                  className="absolute left-0 top-0 z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary bg-background text-[12.5px] font-bold text-primary shadow-[0_8px_20px_-8px_rgba(15,23,42,0.35)] md:left-[calc(50%-20px)] md:top-1/2 md:-translate-y-1/2"
                  aria-hidden
                >
                  {step.n}
                </motion.span>

                {/* image half */}
                <motion.div
                  initial={{ opacity: 0, y: 44 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-15%" }}
                  transition={{ duration: 0.8, ease: EASE }}
                  className={i % 2 === 0 ? "md:order-1" : "md:order-2"}
                >
                  <div className="group overflow-hidden rounded-xl border border-border/70 shadow-[0_26px_60px_-30px_rgba(15,23,42,0.45)]">
                    <img
                      src={step.img}
                      alt={step.alt}
                      className={`block w-full object-cover transition-transform duration-700 group-hover:scale-[1.04] ${step.isShot ? "" : "aspect-[4/3]"}`}
                      loading="lazy"
                    />
                  </div>
                </motion.div>

                {/* text half */}
                <motion.div
                  initial={{ opacity: 0, y: 44 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-15%" }}
                  transition={{ duration: 0.8, ease: EASE, delay: 0.12 }}
                  className={i % 2 === 0 ? "md:order-2" : "md:order-1"}
                >
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary/80">Step {step.n}</p>
                  <h3 className="text-[24px] font-bold tracking-tight md:text-[28px]">{step.title}</h3>
                  <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">{step.copy}</p>
                  <ul className="mt-6 space-y-2.5">
                    {step.points.map((p) => (
                      <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-foreground/80">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden py-28 md:py-32">
      <img
        src="/img/roofing/crew-roofline.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-neutral-950/60" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/75 via-transparent to-neutral-950/45" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-5 text-center md:px-8">
        <h2 className="rv text-4xl font-bold leading-[1.06] tracking-tight text-white md:text-[56px]">
          Open the demo. Run a full day.
        </h2>
        <p className="rv mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-white/75" style={{ ["--rv-delay" as string]: "90ms" }}>
          Four seeded roles and a full pipeline of demo data — inquiries, inspections, quotes,
          payments. See the desk your crew would run tomorrow.
        </p>
        <div className="rv mt-9 flex flex-wrap items-center justify-center gap-3.5" style={{ ["--rv-delay" as string]: "160ms" }}>
          <button
            onClick={ctaNavigate}
            className="group inline-flex min-h-[48px] items-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-neutral-900 shadow-2xl transition-transform hover:scale-[1.03]"
          >
            Open the app
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <button
            onClick={() => (window.location.hash = "#/public/intake")}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-white/30 bg-white/10 px-7 text-[15px] font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <CalendarCheck2 className="h-4 w-4" />
            Book as a homeowner
          </button>
        </div>
      </div>
    </section>
  );
}

/**
 * Marketing footer — brand block with badges, two link columns, and a
 * clean legal bar with a back-to-top control. Professional and quiet.
 */
function Footer() {
  const year = new Date().getFullYear();
  const dot = <span className="h-1 w-1 rounded-full bg-border transition-colors group-hover:bg-primary" aria-hidden />;
  return (
    <footer className="mt-auto border-t border-border/70 bg-muted/40">
      <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="grid gap-10 py-14 md:grid-cols-[1.45fr_1fr_1fr] md:gap-14">
          {/* brand */}
          <div className="max-w-sm">
            <Logo size="lg" />
            <p className="mt-5 text-[13.5px] leading-relaxed text-muted-foreground">
              The estimate desk for roofing teams — inquiries to inspections, estimates to matched
              payments, all on one screen.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Demo build", "Synthetic data", "GHL-ready"].map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-border/70 bg-background px-3 py-1 text-[10.5px] font-semibold text-muted-foreground"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* product */}
          <nav aria-label="Product">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-foreground/70">Product</p>
            <ul className="space-y-3 text-[13.5px]">
              {[
                { label: "Product tour", go: () => scrollToSection("product") },
                { label: "Why RidgeLine", go: () => scrollToSection("features") },
                { label: "How it works", go: () => scrollToSection("how") },
              ].map((l) => (
                <li key={l.label}>
                  <button
                    onClick={l.go}
                    className="group inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {dot}
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* get started */}
          <nav aria-label="Get started">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-foreground/70">Get started</p>
            <ul className="space-y-3 text-[13.5px]">
              <li>
                <button
                  onClick={ctaNavigate}
                  className="group inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {dot}
                  Open the app
                </button>
              </li>
              <li>
                <button
                  onClick={() => (window.location.hash = "#/public/intake")}
                  className="group inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {dot}
                  Homeowner booking
                </button>
              </li>
              <li>
                <a
                  href="https://github.com/faisukhan01/convert"
                  target="_blank"
                  rel="noreferrer"
                  className="group inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {dot}
                  GitHub
                  <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 border-t border-border/60 py-6 sm:flex-row sm:items-center">
          <p className="text-[11.5px] text-muted-foreground/80">
            © {year} RidgeLine · demo build — all data is synthetic
          </p>
          <div className="flex items-center gap-5">
            <p className="hidden text-[11.5px] text-muted-foreground/70 lg:block">
              Postgres-ready · GHL connector simulated · footage &amp; imagery for demo use
            </p>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to top <ArrowUp className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function LandingView() {
  useRevealOnScroll();
  return (
    <div className="grain flex min-h-screen flex-col bg-background">
      <Nav />
      <main className="flex-1">
        <Hero />
        <Wordmarks />
        <Product />
        <How />
        <Features />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
