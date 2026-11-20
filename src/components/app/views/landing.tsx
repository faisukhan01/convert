"use client";


import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Building2,
  CalendarCheck2,
  Check,
  ClipboardList,
  FileCheck2,
  HardHat,
  PhoneMissed,
  Play,
  Quote,
} from "lucide-react";
import { navigate, useAppStore } from "@/store/app";
import { Logo } from "@/components/app/shell";

/**
 * RidgeLine marketing landing — the front door of the product.
 * Built like a real SaaS marketing site: a live-action hero video (Coverr,
 * free license), real job-site photography, and actual screenshots of the
 * running product inside browser frames. Single sans typeface, flat layout,
 * no decorative effects — credibility over decoration.
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

const MINI_FEATURES = [
  {
    icon: PhoneMissed,
    title: "Missed calls become booked inspections",
    copy: "Every call, website form and referral lands in one queue — deduplicated, time-stamped, owned by someone.",
  },
  {
    icon: BellRing,
    title: "Quotes chase themselves",
    copy: "RidgeLine notices when an estimate is opened and nudges the homeowner on schedule until you get an answer.",
  },
  {
    icon: FileCheck2,
    title: "Payments tie back to the quote",
    copy: "Accepted estimates flow to invoices and matched payments, so the books always agree with the roof.",
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

const ROLES = [
  {
    icon: ClipboardList,
    title: "Owner",
    line: "One honest list, every morning",
    copy: "What’s overdue, what’s waiting on you, what money is stuck — before the first coffee.",
  },
  {
    icon: BellRing,
    title: "Office",
    line: "The queue does the chasing",
    copy: "Callbacks, assignment and payment matching in one tidy inbox instead of a pocket notebook.",
  },
  {
    icon: HardHat,
    title: "Estimator",
    line: "A phone built for the roof",
    copy: "Today’s visits, one-tap outcomes, and the next appointment always in view — even in gloves.",
  },
  {
    icon: Building2,
    title: "Agency",
    line: "Every location, one dashboard",
    copy: "Provision contractors, verify connections and compare performance across the whole group.",
  },
];

const REVIEWS = [
  {
    quote:
      "The queue finally tells me the truth. I open one screen in the morning and I know exactly what the day owes me.",
    name: "Priya Shah",
    role: "Owner · Summit Roofing Co.",
    initials: "PS",
  },
  {
    quote:
      "Callbacks used to live in my pocket notebook. Now the desk chases the customer for me — I just approve it.",
    name: "Marcus Lee",
    role: "Office · Summit Roofing Co.",
    initials: "ML",
  },
  {
    quote:
      "Three locations, one dashboard. Provisioning a new contractor took minutes, not a week of spreadsheets.",
    name: "Dana Whitfield",
    role: "Agency admin · North Peak Exteriors",
    initials: "DW",
  },
];

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
    <figure className={`overflow-hidden rounded-xl border border-border bg-card shadow-[0_30px_80px_-36px_rgba(15,23,42,0.45)] ${className}`}>
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

/* ────────────── sections ────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const authed = !!useAppStore((s) => s.session)?.user;
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links = [
    { label: "Product", id: "product" },
    { label: "How it works", id: "how" },
    { label: "Who it's for", id: "roles" },
    { label: "Reviews", id: "reviews" },
  ];
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-black/5 bg-background/85 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <div className={scrolled ? "" : "[&_svg]:shadow-lg [&_span]:text-white [&_span_span]:text-white/70"}>
          <span className={scrolled ? "" : "text-white"}>
            <Logo />
          </span>
        </div>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Landing sections">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollToSection(l.id)}
              className={`text-[13px] font-medium transition-colors ${
                scrolled ? "text-foreground/70 hover:text-foreground" : "text-white/80 hover:text-white"
              }`}
            >
              {l.label}
            </button>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {!authed && (
            <button
              onClick={ctaNavigate}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                scrolled ? "text-foreground hover:bg-accent" : "text-white hover:bg-white/15"
              }`}
            >
              Sign in
            </button>
          )}
          <button
            onClick={ctaNavigate}
            className={`group inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold shadow-lg transition-transform hover:scale-[1.03] ${
              scrolled ? "bg-primary text-primary-foreground" : "bg-white text-neutral-900"
            }`}
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
      {open && (
        <div className="border-t bg-background/95 px-5 py-4 backdrop-blur-md md:hidden">
          {links.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setOpen(false);
                scrollToSection(l.id);
              }}
              className="block w-full py-2.5 text-left text-sm font-medium text-foreground/80"
            >
              {l.label}
            </button>
          ))}
          <button
            onClick={ctaNavigate}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Open the app <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </header>
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

function Product() {
  return (
    <section id="product" className="bg-background py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mx-auto mb-14 max-w-2xl text-center">
          <p className="rv mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">The product</p>
          <h2 className="rv text-4xl font-bold leading-[1.08] tracking-tight md:text-[48px]" style={{ ["--rv-delay" as string]: "60ms" }}>
            Your whole day, on one screen.
          </h2>
          <p className="rv mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground" style={{ ["--rv-delay" as string]: "120ms" }}>
            No spreadsheets, no group texts, no pocket notebook. One queue tells you exactly what needs
            a response, a visit, or a decision — and what happens if you don’t.
          </p>
        </div>

        {/* the real desk */}
        <div className="rv" style={{ ["--rv-delay" as string]: "80ms" }}>
          <BrowserFrame
            src="/img/app/today.png"
            alt="RidgeLine Today view: needs a response, inspections today, estimates awaiting a reply"
            label="app.ridgeline.dev/#/today"
          />
        </div>

        {/* three mini features under the shot */}
        <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {MINI_FEATURES.map((f, i) => (
            <div key={f.title} className="rv" style={{ ["--rv-delay" as string]: `${i * 90}ms` }}>
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="text-[16.5px] font-bold tracking-tight">{f.title}</h3>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">{f.copy}</p>
            </div>
          ))}
        </div>

        {/* more of the real product */}
        <div className="mt-16 grid gap-6 md:grid-cols-2">
          <div className="rv" style={{ ["--rv-delay" as string]: "60ms" }}>
            <BrowserFrame
              src="/img/app/inquiries.png"
              alt="RidgeLine inquiries list with statuses and owners"
              label="app.ridgeline.dev/#/inquiries"
            />
          </div>
          <div className="rv md:mt-12" style={{ ["--rv-delay" as string]: "140ms" }}>
            <BrowserFrame
              src="/img/app/reports.png"
              alt="RidgeLine reports: conversion, aging and revenue views"
              label="app.ridgeline.dev/#/reports"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function How() {
  return (
    <section id="how" className="border-y border-border/70 bg-muted/40 py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mb-16 max-w-2xl">
          <p className="rv mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">How it works</p>
          <h2 className="rv text-4xl font-bold leading-[1.08] tracking-tight md:text-[48px]" style={{ ["--rv-delay" as string]: "60ms" }}>
            From first call to final payment.
          </h2>
        </div>
        <div className="space-y-16 md:space-y-20">
          {FLOW.map((s, i) => (
            <div
              key={s.n}
              className={`rv flex flex-col gap-8 md:items-center md:gap-14 ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"}`}
            >
              <div className="md:w-[46%]">
                <div className="overflow-hidden rounded-xl border border-border/70 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.4)]">
                  <img
                    src={s.img}
                    alt={s.alt}
                    className={`block w-full object-cover ${s.isShot ? "" : "aspect-[4/3]"}`}
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="md:w-[54%]">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary/80">Step {s.n}</p>
                <h3 className="text-[24px] font-bold tracking-tight md:text-[28px]">{s.title}</h3>
                <p className="mt-4 max-w-md text-[14.5px] leading-relaxed text-muted-foreground">{s.copy}</p>
                <ul className="mt-6 space-y-2.5">
                  {s.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-[13.5px] text-foreground/80">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
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

function Roles() {
  return (
    <section id="roles" className="bg-background py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mb-14 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="rv mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">Who it's for</p>
            <h2 className="rv text-4xl font-bold leading-[1.08] tracking-tight md:text-[48px]" style={{ ["--rv-delay" as string]: "60ms" }}>
              Built for every seat on the crew.
            </h2>
          </div>
          <p className="rv max-w-sm text-[14px] leading-relaxed text-muted-foreground" style={{ ["--rv-delay" as string]: "120ms" }}>
            Four roles, four tailored views, one shared truth. Nobody sees more than they need;
            everybody sees what matters.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r, i) => (
            <div
              key={r.title}
              className="rv group rounded-xl border border-border/70 bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_44px_-20px_rgba(15,23,42,0.3)]"
              style={{ ["--rv-delay" as string]: `${i * 80}ms` }}
            >
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <r.icon className="h-5 w-5" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{r.title}</p>
              <h3 className="mt-1.5 text-[17px] font-bold tracking-tight">{r.line}</h3>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{r.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Reviews() {
  return (
    <section id="reviews" className="border-y border-border/70 bg-muted/40 py-24 md:py-28">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mb-14 max-w-2xl">
          <p className="rv mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">From the desk</p>
          <h2 className="rv text-4xl font-bold leading-[1.08] tracking-tight md:text-[48px]" style={{ ["--rv-delay" as string]: "60ms" }}>
            The people who live in it daily.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {REVIEWS.map((r, i) => (
            <figure
              key={r.name}
              className="rv flex flex-col rounded-xl border border-border/70 bg-card p-7"
              style={{ ["--rv-delay" as string]: `${i * 90}ms` }}
            >
              <Quote className="h-5 w-5 text-primary/40" />
              <blockquote className="mt-4 flex-1 text-[15px] leading-relaxed text-foreground/90">
                “{r.quote}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-border/60 pt-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-[12px] font-bold text-primary">
                  {r.initials}
                </span>
                <span>
                  <span className="block text-[13.5px] font-semibold text-foreground">{r.name}</span>
                  <span className="block text-[11.5px] text-muted-foreground">{r.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
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
                <li><button onClick={() => scrollToSection("how")} className="text-muted-foreground transition-colors hover:text-foreground">How it works</button></li>
                <li><button onClick={() => scrollToSection("roles")} className="text-muted-foreground transition-colors hover:text-foreground">Who it’s for</button></li>
                <li><button onClick={() => scrollToSection("reviews")} className="text-muted-foreground transition-colors hover:text-foreground">Reviews</button></li>
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
        <How />
        <Stats />
        <Roles />
        <Reviews />
        <FinalCta />
      </main>
      <footer className="mt-auto"><Footer /></footer>
    </div>
  );
}
