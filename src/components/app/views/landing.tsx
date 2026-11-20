"use client";


import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Building2,
  CalendarCheck2,
  Check,
  ChevronDown,
  ClipboardList,
  FileCheck2,
  HardHat,
  PhoneMissed,
  Play,
  Quote,
} from "lucide-react";
import { navigate } from "@/store/app";
import { Logo } from "@/components/app/shell";

/**
 * RidgeLine marketing landing — the front door of the product.
 * Editorial, photography-led, deliberately restrained: real job-site imagery,
 * a cinematic auto-advancing hero, slow reveals, and copy written for roofing
 * operators rather than developers. All interactions degrade gracefully with
 * prefers-reduced-motion.
 */

const HERO_FRAMES = [
  { src: "/img/roofing/hero-1.webp", tag: "The call", line: "A homeowner needs a roof. The job enters the desk." },
  { src: "/img/roofing/hero-2.webp", tag: "The crew", line: "Nothing waits in a notebook. Work rolls the same day." },
  { src: "/img/roofing/hero-3.webp", tag: "The inspection", line: "Findings logged on the record, not on memory." },
  { src: "/img/roofing/hero-4.webp", tag: "The quote", line: "Estimates out fast — follow-ups handled for you." },
  { src: "/img/roofing/hero-5.webp", tag: "The payoff", line: "Approved, invoiced, matched — every dollar on the books." },
];

const WORDMARKS = [
  "Summit Roofing Co.",
  "North Peak Exteriors",
  "Bluepine Roofing",
  "Ironclad Exteriors",
  "Cedarline Roofing",
  "Harvest Ridge",
];

const FLOW = [
  {
    n: "01",
    img: "/img/roofing/flow-1.webp",
    alt: "Roofing crew arriving at a neighborhood job site",
    title: "Every inquiry, one desk",
    copy: "Phone calls, website forms, referrals and storm-season walk-ins land in a single queue — deduplicated, time-stamped and owned.",
    points: ["Never ask “who called whom?” again", "Duplicates flagged before they cost you", "Homeowners book inspections themselves"],
  },
  {
    n: "02",
    img: "/img/roofing/flow-2.webp",
    alt: "Close-up of a hammer on asphalt shingles",
    title: "Inspections that leave a paper trail",
    copy: "Visit outcomes, photos and measurements are captured on the spot. The estimator’s phone view shows today’s route and nothing else.",
    points: ["Booked, completed, no-show — tracked", "Assignments balanced across the crew", "Follow-ups scheduled the moment you leave"],
  },
  {
    n: "03",
    img: "/img/roofing/flow-3.webp",
    alt: "Roofing craftsman fastening shingles with a nail gun",
    title: "Quotes that chase themselves",
    copy: "The desk sends the estimate, notices when it’s opened, and nudges the homeowner on your behalf until you get an answer.",
    points: ["Viewed / accepted / declined, visible", "Automatic nudges at smart intervals", "Revisions without losing history"],
  },
  {
    n: "04",
    img: "/img/roofing/flow-4.webp",
    alt: "A finished white farmhouse with a new roof",
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
    copy: "Today’s visits, one tap outcomes, and the next appointment always in view — even in gloves.",
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

/* ────────────── sections ────────────── */

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links = [
    { label: "The desk", id: "product" },
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
          <button
            onClick={() => navigate("/signin")}
            className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
              scrolled ? "text-foreground hover:bg-accent" : "text-white hover:bg-white/15"
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => navigate("/signin")}
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
            onClick={() => navigate("/signin")}
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
  const [active, setActive] = useState(0);
  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setActive((a) => (a + 1) % HERO_FRAMES.length), 5600);
    return () => clearInterval(t);
  }, [reduced]);

  const frame = HERO_FRAMES[active];
  return (
    <section className="relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-neutral-950">
      {/* photography — crossfading slow push-in */}
      {HERO_FRAMES.map((f, i) => (
        <div
          key={f.src}
          className="absolute inset-0 transition-opacity duration-[1400ms] ease-out"
          style={{ opacity: i === active ? 1 : 0 }}
          aria-hidden={i !== active}
        >
          <img
            key={i === active ? `active-${active}` : `idle-${i}`}
            src={f.src}
            alt=""
            className={`h-full w-full object-cover ${i === active && !reduced ? "rl-kenburns" : ""}`}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "low"}
          />
        </div>
      ))}
      {/* scrims */}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/85 via-neutral-950/25 to-neutral-950/55" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/55 via-transparent to-transparent" aria-hidden />

      {/* copy */}
      <div className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-28 pt-40 md:px-8 md:pb-32">
        <p className="rv is-in mb-5 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/90 backdrop-blur-sm">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Estimate desk for roofing teams
        </p>
        <h1 className="font-display max-w-3xl text-[42px] font-[560] leading-[1.04] tracking-tight text-white sm:text-6xl md:text-[76px]">
          The desk that turns{" "}
          <br className="hidden sm:block" />
          <em className="font-[450] italic text-amber-100/95">leaks</em> into{" "}
          <em className="font-[450] italic text-amber-100/95">finished jobs</em>.
        </h1>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/75 md:text-lg">
          RidgeLine catches every homeowner request, books the inspection, chases every quote and
          follows the money to the last invoice — so your crew builds roofs, not paperwork.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3.5">
          <button
            onClick={() => navigate("/signin")}
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
        </div>

        {/* film-strip controls */}
        <div className="mt-14 hidden items-end gap-6 md:flex">
          <div className="flex max-w-xl flex-1 gap-2" role="tablist" aria-label="Hero scenes">
            {HERO_FRAMES.map((f, i) => (
              <button
                key={f.tag}
                role="tab"
                aria-selected={i === active}
                aria-label={`Scene ${i + 1}: ${f.tag}`}
                onClick={() => setActive(i)}
                className="group relative flex-1 pb-3"
              >
                <span className="block h-[3px] w-full overflow-hidden rounded-full bg-white/25">
                  {i === active ? (
                    <span
                      key={active}
                      className="block h-full w-full origin-left bg-white"
                      style={{ animation: reduced ? "none" : "rl-meter 5.6s linear forwards" }}
                    />
                  ) : (
                    <span className={`block h-full w-full origin-left ${i < active ? "bg-white/60" : "bg-transparent"}`} />
                  )}
                </span>
                <span
                  className={`absolute inset-x-0 bottom-0 whitespace-nowrap text-center text-[9.5px] font-semibold uppercase tracking-[0.14em] transition-colors ${
                    i === active ? "text-white" : "text-white/40 group-hover:text-white/70"
                  }`}
                >
                  {f.tag}
                </span>
              </button>
            ))}
          </div>
          <p className="max-w-[240px] text-[12px] leading-snug text-white/70">{frame.line}</p>
        </div>
      </div>

      {/* scroll cue */}
      <button
        onClick={() => scrollToSection("product")}
        aria-label="Scroll to content"
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-white/60 transition-colors hover:text-white"
      >
        <ChevronDown className="h-6 w-6 animate-bounce" />
      </button>
    </section>
  );
}

function Wordmarks() {
  const row = [...WORDMARKS, ...WORDMARKS];
  return (
    <section aria-label="Teams using RidgeLine" className="border-b border-border/70 bg-background py-8">
      <div className="mx-auto max-w-6xl overflow-hidden px-5 md:px-8">
        <p className="mb-5 text-center text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground/70">
          Demo teams running their desk on RidgeLine
        </p>
        <div className="relative">
          <div className="rl-marquee flex w-max items-center gap-14 whitespace-nowrap pr-14">
            {row.map((w, i) => (
              <span key={`${w}-${i}`} className="font-display text-[17px] font-[450] text-foreground/35">
                {w}
              </span>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
        </div>
      </div>
    </section>
  );
}

function Product() {
  return (
    <section id="product" className="bg-background py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-14 px-5 md:grid-cols-[1fr_1.05fr] md:gap-16 md:px-8">
        {/* sticky copy */}
        <div className="md:sticky md:top-28 md:self-start">
          <p className="rv mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">The problem</p>
          <h2 className="rv font-display text-4xl font-[560] leading-[1.08] tracking-tight md:text-[52px]" style={{ ["--rv-delay" as string]: "60ms" }}>
            Quotes don’t die in RidgeLine.
            <br />
            <em className="font-[450] italic text-primary">They get chased.</em>
          </h2>
          <p className="rv mt-6 max-w-md text-[15px] leading-relaxed text-muted-foreground" style={{ ["--rv-delay" as string]: "120ms" }}>
            Most lost jobs aren’t lost to a better roofer — they’re lost to the roofer who followed
            up first. RidgeLine is built around that truth: it remembers, it reminds, it follows the
            money.
          </p>
          <ul className="rv mt-8 space-y-4" style={{ ["--rv-delay" as string]: "180ms" }}>
            {[
              { icon: PhoneMissed, text: "Missed calls become booked inspections, not lost customers" },
              { icon: BellRing, text: "Every unanswered quote gets nudged automatically" },
              { icon: FileCheck2, text: "Invoices tie back to the exact estimate that won the job" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[14.5px] leading-snug text-foreground/80">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* collage */}
        <div className="rv relative min-h-[560px]" style={{ ["--rv-delay" as string]: "120ms" }}>
          <div className="rl-tilt-a absolute left-0 top-0 w-[72%] overflow-hidden rounded-2xl border border-border/60 shadow-[0_24px_60px_-24px_rgba(20,20,20,0.45)]">
            <img src="/img/roofing/crew-1.webp" alt="Roofing crew in hi-vis working on a roof" className="aspect-[4/3] w-full object-cover" loading="lazy" />
          </div>
          <div className="rl-tilt-b absolute right-0 top-[30%] w-[46%] overflow-hidden rounded-2xl border border-border/60 shadow-[0_24px_60px_-24px_rgba(20,20,20,0.45)]">
            <img src="/img/roofing/flow-3.webp" alt="Craftsman fastening shingles with a nail gun" className="aspect-[3/4] w-full object-cover" loading="lazy" />
          </div>
          <div className="rl-tilt-a absolute bottom-0 left-[8%] w-[58%] overflow-hidden rounded-2xl border border-border/60 shadow-[0_24px_60px_-24px_rgba(20,20,20,0.45)]">
            <img src="/img/roofing/crew-2.webp" alt="Aerial view of materials being lifted onto a roof" className="aspect-[16/10] w-full object-cover" loading="lazy" />
          </div>
          {/* floating product moments */}
          <div className="absolute -left-2 top-[38%] z-10 hidden rounded-xl border border-border/70 bg-card/95 px-3.5 py-2.5 shadow-xl backdrop-blur sm:block">
            <p className="text-[11px] font-semibold text-foreground">E-1043 · viewed 2m ago</p>
            <p className="text-[10.5px] text-muted-foreground">Grace Nolan · $6,900</p>
          </div>
          <div className="absolute bottom-[16%] right-[2%] z-10 hidden rounded-xl border border-border/70 bg-card/95 px-3.5 py-2.5 shadow-xl backdrop-blur sm:block">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Nudge sent automatically
            </p>
            <p className="text-[10.5px] text-muted-foreground">Parker Lind · callback 2 of 3</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function How() {
  return (
    <section id="how" className="border-y border-border/70 bg-[oklch(0.965_0.008_88)] py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mb-16 max-w-2xl">
          <p className="rv mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">The pipeline</p>
          <h2 className="rv font-display text-4xl font-[560] leading-[1.08] tracking-tight md:text-[52px]" style={{ ["--rv-delay" as string]: "60ms" }}>
            First call to final payment,
            <em className="font-[450] italic text-primary"> one straight line</em>.
          </h2>
        </div>
        <div className="space-y-16 md:space-y-24">
          {FLOW.map((s, i) => (
            <div
              key={s.n}
              className={`rv flex flex-col gap-8 md:items-center md:gap-14 ${i % 2 === 1 ? "md:flex-row-reverse" : "md:flex-row"}`}
            >
              <div className="relative md:w-[46%]">
                <div className="overflow-hidden rounded-2xl border border-border/60 shadow-[0_24px_60px_-28px_rgba(20,20,20,0.45)]">
                  <img src={s.img} alt={s.alt} className="aspect-[4/3] w-full object-cover transition-transform duration-700 hover:scale-[1.03]" loading="lazy" />
                </div>
                <span className="font-display absolute -left-3 -top-7 select-none text-[72px] font-[450] leading-none text-primary/15 md:-left-8">
                  {s.n}
                </span>
              </div>
              <div className="md:w-[54%]">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary/80">Step {s.n}</p>
                <h3 className="font-display text-[26px] font-[560] tracking-tight md:text-[32px]">{s.title}</h3>
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
        src="/img/roofing/hero-3.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover opacity-[0.16]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-neutral-950/80 via-neutral-950/60 to-neutral-950/80" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 sm:grid-cols-2 md:grid-cols-4 md:px-8">
        {STATS.map((s, i) => (
          <div key={s.label} className="rv text-center md:text-left" style={{ ["--rv-delay" as string]: `${i * 90}ms` }}>
            <p className="font-display text-5xl font-[560] tracking-tight text-white md:text-[56px]">
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
    <section id="roles" className="bg-background py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mb-14 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="rv mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">Who it’s for</p>
            <h2 className="rv font-display text-4xl font-[560] leading-[1.08] tracking-tight md:text-[52px]" style={{ ["--rv-delay" as string]: "60ms" }}>
              Built for the whole crew —
              <em className="font-[450] italic text-primary"> not just the boss</em>.
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
              className="rv group rounded-2xl border border-border/70 bg-card p-6 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_20px_44px_-20px_rgba(20,20,20,0.35)]"
              style={{ ["--rv-delay" as string]: `${i * 80}ms` }}
            >
              <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <r.icon className="h-5 w-5" />
              </span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{r.title}</p>
              <h3 className="font-display mt-1.5 text-[19px] font-[560] tracking-tight">{r.line}</h3>
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
    <section id="reviews" className="border-y border-border/70 bg-[oklch(0.965_0.008_88)] py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mb-14 max-w-2xl">
          <p className="rv mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">From the desk</p>
          <h2 className="rv font-display text-4xl font-[560] leading-[1.08] tracking-tight md:text-[52px]" style={{ ["--rv-delay" as string]: "60ms" }}>
            The people who <em className="font-[450] italic text-primary">live in it</em> daily.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {REVIEWS.map((r, i) => (
            <figure
              key={r.name}
              className="rv flex flex-col rounded-2xl border border-border/70 bg-card p-7"
              style={{ ["--rv-delay" as string]: `${i * 90}ms` }}
            >
              <Quote className="h-6 w-6 text-primary/30" />
              <blockquote className="font-display mt-4 flex-1 text-[17px] font-[450] leading-relaxed text-foreground/90">
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
    <section className="relative overflow-hidden py-28 md:py-36">
      <img src="/img/roofing/signin-b.webp" alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-neutral-950/55" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/70 via-transparent to-neutral-950/40" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-5 text-center md:px-8">
        <h2 className="rv font-display text-4xl font-[560] leading-[1.06] tracking-tight text-white md:text-[60px]">
          Your next job starts
          <em className="font-[450] italic text-amber-100/95"> at the ridge</em>.
        </h2>
        <p className="rv mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-white/75" style={{ ["--rv-delay" as string]: "90ms" }}>
          Open the live demo and run a full day — inquiries, inspections, quotes, payments — with
          seeded roles and zero setup.
        </p>
        <div className="rv mt-9 flex flex-wrap items-center justify-center gap-3.5" style={{ ["--rv-delay" as string]: "160ms" }}>
          <button
            onClick={() => navigate("/signin")}
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
                <li><button onClick={() => scrollToSection("how")} className="text-muted-foreground transition-colors hover:text-foreground">How it works</button></li>
                <li><button onClick={() => scrollToSection("roles")} className="text-muted-foreground transition-colors hover:text-foreground">Who it’s for</button></li>
                <li><button onClick={() => scrollToSection("reviews")} className="text-muted-foreground transition-colors hover:text-foreground">Reviews</button></li>
              </ul>
            </div>
            <div>
              <p className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/60">Get started</p>
              <ul className="space-y-2.5 text-[13.5px]">
                <li><button onClick={() => navigate("/signin")} className="text-muted-foreground transition-colors hover:text-foreground">Open the app</button></li>
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
          <p>Go automation engine · Postgres · GHL-ready</p>
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
