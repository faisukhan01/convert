"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarCheck2,
  Check,
  Eye,
  FileText,
  Inbox,
  LayoutDashboard,
  Play,
  Wallet,
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
 * photography, actual screenshots of the running product inside browser
 * frames, and scroll-driven motion (framer-motion): the desk morphs flat
 * as it enters, live events pop over it, screens auto-tour, and the
 * how-it-works rail draws itself as you read.
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

/** The real product screens used in the auto-touring showcase. */
const SCREENS = [
  {
    key: "today",
    icon: LayoutDashboard,
    tab: "Today",
    title: "The morning queue",
    desc: "Needs-a-response, today's inspections and quotes awaiting a reply — the whole day on one list.",
    shot: "/img/app/today.png",
    label: "app.ridgeline.dev/#/today",
    alt: "RidgeLine Today view: needs a response, inspections today, estimates awaiting a reply",
  },
  {
    key: "inquiries",
    icon: Inbox,
    tab: "Inquiries",
    title: "Every lead, owned",
    desc: "Calls, web forms and referrals deduplicated, time-stamped and assigned before they slip.",
    shot: "/img/app/inquiries.png",
    label: "app.ridgeline.dev/#/inquiries",
    alt: "RidgeLine inquiries list with statuses and owners",
  },
  {
    key: "estimates",
    icon: FileText,
    tab: "Estimates",
    title: "Quotes that chase",
    desc: "Viewed, nudged and accepted — the pipeline moves without a single game of phone tag.",
    shot: "/img/app/estimates.png",
    label: "app.ridgeline.dev/#/estimates",
    alt: "RidgeLine estimates board with status badges",
  },
  {
    key: "reports",
    icon: BarChart3,
    tab: "Reports",
    title: "The honest numbers",
    desc: "Conversion, aging and collectible revenue across every location — exportable in one click.",
    shot: "/img/app/reports.png",
    label: "app.ridgeline.dev/#/reports",
    alt: "RidgeLine reports: conversion, aging and revenue views",
  },
];

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

const STATS = [
  { to: 92, suffix: "%", label: "of quotes get automatic follow-ups" },
  { to: 6, suffix: " min", label: "from missed call to booked inspection" },
  { to: 4, suffix: "", label: "stages in one pipeline, zero spreadsheets" },
  { to: 100, suffix: "%", label: "of actions on the audit record" },
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

function CountUp({ to, suffix, duration = 1600 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [val, setVal] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return;
        started.current = true;
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setVal(Math.round(to * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to, duration]);
  return (
    <span ref={ref}>
      {val}
      {suffix}
    </span>
  );
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** CTAs: signed-in visitors go straight to the desk; everyone else goes to sign-in. */
function ctaNavigate() {
  const authed = !!useAppStore.getState().session?.user;
  navigate(authed ? "/today" : "/signin");
}

/** A browser-chrome frame around a real product screenshot. */
function BrowserFrame({ src, alt, label, className = "" }: { src: string; alt: string; label: string; className?: string }) {
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
      <img src={src} alt={alt} className="block w-full" loading="lazy" />
    </figure>
  );
}

/** A small “live event” card that pops in and then floats gently forever. */
function FloatCard({
  className = "",
  delay = 0,
  floatDelay = 0,
  children,
}: {
  className?: string;
  delay?: number;
  floatDelay?: number;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={`absolute z-20 ${className}`}
      initial={{ opacity: 0, scale: 0.7, y: 22 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ type: "spring", stiffness: 240, damping: 19, delay }}
    >
      <motion.div
        animate={{ y: [0, -7, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: floatDelay }}
        className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/95 py-2.5 pl-3 pr-4 shadow-[0_18px_44px_-18px_rgba(15,23,42,0.45)] backdrop-blur-sm"
      >
        {children}
      </motion.div>
    </motion.div>
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
    { label: "Screens", id: "screens" },
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

/**
 * The product desk: the headline reveals in staggered lines, the real
 * Today screenshot morphs from a tilted card to flat as it scrolls into
 * view, and live events pop over it and float — the page feels alive.
 */
function Product() {
  const shotRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: shotRef, offset: ["start end", "center center"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [14, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  const lift = useTransform(scrollYProgress, [0, 1], [56, 0]);
  const glow = useTransform(scrollYProgress, [0, 0.55, 1], [0.15, 0.85, 1]);

  return (
    <section id="product" className="scroll-mt-16 bg-background py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div
          variants={headWrap}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-15%" }}
          className="mx-auto mb-16 max-w-2xl text-center"
        >
          <motion.p variants={headItem} className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
            The product
          </motion.p>
          <motion.h2 variants={headItem} className="text-4xl font-bold leading-[1.08] tracking-tight md:text-[48px]">
            Your whole day, on one screen.
          </motion.h2>
          <motion.p variants={headItem} className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            No spreadsheets, no group texts, no pocket notebook. One queue tells you exactly what needs
            a response, a visit, or a decision — and what happens if you don’t.
          </motion.p>
        </motion.div>

        <div ref={shotRef} className="relative">
          {/* ambient glow that intensifies as the desk arrives */}
          <motion.div
            aria-hidden
            style={{
              opacity: glow,
              background:
                "radial-gradient(58% 58% at 50% 42%, oklch(0.43 0.095 243 / 0.16), transparent 72%)",
            }}
            className="absolute -inset-x-10 bottom-0 -top-14 rounded-[64px] blur-2xl md:-inset-x-16"
          />

          {/* the desk — starts tilted in perspective, lands flat */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.6 }}
            style={{ rotateX, scale, y: lift, transformPerspective: 1400 }}
          >
            <BrowserFrame
              src="/img/app/today.png"
              alt="RidgeLine Today view: needs a response, inspections today, estimates awaiting a reply"
              label="app.ridgeline.dev/#/today"
            />
          </motion.div>

          {/* live events popping over the desk */}
          <FloatCard className="-right-2 top-8 sm:-right-6 md:-right-12 lg:-right-16" delay={0.4} floatDelay={0.5}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CalendarCheck2 className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className="block text-[12.5px] font-bold tracking-tight text-foreground">Inspection booked</span>
              <span className="block text-[11px] text-muted-foreground">Rosa Alvarez · today 10:00 AM</span>
            </span>
          </FloatCard>

          <FloatCard className="-left-2 bottom-24 sm:-left-6 md:-left-12 lg:-left-16" delay={0.65} floatDelay={1.7}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Eye className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className="block text-[12.5px] font-bold tracking-tight text-foreground">Estimate viewed</span>
              <span className="block text-[11px] text-muted-foreground">Grace Nolan · E-1043 · $8,500</span>
            </span>
          </FloatCard>

          <FloatCard className="-right-2 bottom-4 hidden sm:block sm:-right-6 md:-right-10" delay={0.9} floatDelay={2.9}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <Wallet className="h-[18px] w-[18px]" />
            </span>
            <span>
              <span className="block text-[12.5px] font-bold tracking-tight text-foreground">Payment matched</span>
              <span className="block text-[11px] text-muted-foreground">$12,480 · Alderman Residence</span>
            </span>
          </FloatCard>
        </div>
      </div>
    </section>
  );
}

/**
 * Screens showcase: four real screens, auto-touring with an animated
 * pill indicator; hovering pauses, clicking jumps and holds the tour.
 */
function Screens() {
  const [active, setActive] = useState(0);
  const [hold, setHold] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hold) return;
    const t = setInterval(() => setActive((a) => (a + 1) % SCREENS.length), 6500);
    return () => clearInterval(t);
  }, [hold]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  const pick = (i: number) => {
    setActive(i);
    setHold(true);
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = setTimeout(() => setHold(false), 12000);
  };

  const s = SCREENS[active];

  return (
    <section id="screens" className="scroll-mt-16 border-y border-border/70 bg-muted/40 py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div
          variants={headWrap}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-15%" }}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <motion.p variants={headItem} className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">
            Inside the desk
          </motion.p>
          <motion.h2 variants={headItem} className="text-4xl font-bold leading-[1.08] tracking-tight md:text-[48px]">
            Four screens. Zero guesswork.
          </motion.h2>
          <motion.p variants={headItem} className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            Real screens from the running app — the same views your owner, office and estimators get.
          </motion.p>
        </motion.div>

        <div
          className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-14"
          onPointerEnter={() => setHold(true)}
          onPointerLeave={() => setHold(false)}
        >
          {/* tab list — vertical on desktop, scrollable pills on mobile */}
          <div
            role="tablist"
            aria-label="Product screens"
            className="flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {SCREENS.map((item, i) => {
              const on = i === active;
              return (
                <button
                  key={item.key}
                  role="tab"
                  aria-selected={on}
                  onClick={() => pick(i)}
                  className={`relative shrink-0 rounded-xl p-4 text-left transition-colors lg:w-full ${
                    on ? "" : "hover:bg-foreground/[0.035]"
                  }`}
                >
                  {on && (
                    <motion.span
                      layoutId="screens-active-pill"
                      transition={{ type: "spring", stiffness: 340, damping: 32 }}
                      className="absolute inset-0 rounded-xl border border-primary/25 bg-card shadow-[0_14px_34px_-18px_rgba(15,23,42,0.35)]"
                    />
                  )}
                  <span className="relative flex items-start gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-[14px] font-bold tracking-tight ${on ? "text-foreground" : "text-foreground/80"}`}>
                        {item.tab}
                      </span>
                      <span className="mt-1 hidden text-[12.5px] leading-snug text-muted-foreground lg:block">
                        {item.desc}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* the active screen, animated in */}
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={s.key}
                initial={{ opacity: 0, x: 40, scale: 0.985 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -28, scale: 0.99 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <BrowserFrame src={s.shot} alt={s.alt} label={s.label} />
                <p className="mt-5 text-center text-[12.5px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground/80">{s.title}</span> — {s.desc}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* tour progress */}
            <div className="mt-6 flex items-center justify-center gap-2" aria-hidden>
              {SCREENS.map((item, i) => (
                <span
                  key={item.key}
                  className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-7 bg-primary" : "w-2.5 bg-border"}`}
                />
              ))}
            </div>
          </div>
        </div>
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

function Stats() {
  return (
    <section className="relative overflow-hidden bg-neutral-950 py-20 md:py-24">
      <img
        src="/img/roofing/shingles-texture.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-[0.14]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/85 via-neutral-950/60 to-neutral-950/85" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 sm:grid-cols-2 md:grid-cols-4 md:px-8">
        {STATS.map((s, i) => (
          <div key={s.label} className="rv text-center md:text-left" style={{ ["--rv-delay" as string]: `${i * 90}ms` }}>
            <p className="text-5xl font-bold tracking-tight text-white md:text-[56px]">
              <CountUp to={s.to} suffix={s.suffix} />
            </p>
            <p className="mt-2.5 text-[12.5px] leading-snug text-white/65">{s.label}</p>
          </div>
        ))}
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

function Footer() {
  return (
    <footer className="border-t border-border/70 bg-background pb-10 pt-14">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="flex flex-col justify-between gap-10 md:flex-row md:items-start">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
              The estimate desk for roofing teams — inquiries to inspections, estimates to matched
              payments.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-12 sm:gap-20">
            <div>
              <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/60">Product</p>
              <ul className="space-y-2.5 text-[13.5px]">
                <li><button onClick={() => scrollToSection("product")} className="text-muted-foreground transition-colors hover:text-foreground">Product tour</button></li>
                <li><button onClick={() => scrollToSection("screens")} className="text-muted-foreground transition-colors hover:text-foreground">Inside the app</button></li>
                <li><button onClick={() => scrollToSection("how")} className="text-muted-foreground transition-colors hover:text-foreground">How it works</button></li>
              </ul>
            </div>
            <div>
              <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/60">Get started</p>
              <ul className="space-y-2.5 text-[13.5px]">
                <li><button onClick={ctaNavigate} className="text-muted-foreground transition-colors hover:text-foreground">Open the app</button></li>
                <li><button onClick={() => (window.location.hash = "#/public/intake")} className="text-muted-foreground transition-colors hover:text-foreground">Homeowner booking</button></li>
                <li>
                  <a
                    href="https://github.com/faisukhan01/convert"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    GitHub <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-border/60 pt-6 text-[11.5px] text-muted-foreground/80 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} RidgeLine · demo build — all data is synthetic</p>
          <p>Go automation engine · Postgres · GHL-ready · footage &amp; imagery for demo use</p>
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
        <Screens />
        <How />
        <Stats />
        <FinalCta />
      </main>
      <footer className="mt-auto"><Footer /></footer>
    </div>
  );
}
