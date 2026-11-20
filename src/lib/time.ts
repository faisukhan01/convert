/**
 * Timezone utilities. All instants are stored UTC; display + wall-time math uses the
 * contractor's IANA timezone. `wallToUtc` iteratively converges on the correct UTC instant
 * so appointments and send-windows stay correct across daylight-saving transitions.
 */

export type WorkHours = Record<string, [string, string] | null>; // mon..sun
const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const dtf = (tz: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short",
  });

export function tzParts(instant: Date, tz: string) {
  const parts = dtf(tz).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10) % 24; // "24" appears for midnight with hour12:false
  const minute = parseInt(get("minute"), 10);
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour,
    minute,
    second: parseInt(get("second"), 10),
    dow: get("weekday").toLowerCase() as (typeof DOW)[number],
    minuteOfDay: hour * 60 + minute,
  };
}

export function tzAbbr(instant: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(instant);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
}

/** Convert a wall-clock time in `tz` to the correct UTC instant (DST-safe, iterative). */
export function wallToUtc(tz: string, y: number, m: number, d: number, hh: number, mm: number): Date {
  let guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  for (let i = 0; i < 3; i++) {
    const p = tzParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const target = Date.UTC(y, m - 1, d, hh, mm, 0);
    if (asUtc === target) break;
    guess += target - asUtc;
  }
  return new Date(guess);
}

function parseHM(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function withinWindow(instant: Date, tz: string, hours: WorkHours): boolean {
  const p = tzParts(instant, tz);
  const today = hours[p.dow];
  if (!today) return false;
  const start = parseHM(today[0]);
  const end = parseHM(today[1]);
  return p.minuteOfDay >= start && p.minuteOfDay < end;
}

/** Next instant at (or after `instant`) that falls inside the contact window. */
export function nextWindowStart(instant: Date, tz: string, hours: WorkHours): Date {
  const p = tzParts(instant, tz);
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const day = new Date(instant.getTime() + dayOffset * 86400000);
    const dp = tzParts(day, tz);
    const today = hours[dp.dow];
    if (!today) continue;
    const start = parseHM(today[0]);
    const end = parseHM(today[1]);
    if (dayOffset === 0) {
      if (p.minuteOfDay < start) {
        return wallToUtc(tz, p.year, p.month, p.day, Math.floor(start / 60), start % 60);
      }
      if (p.minuteOfDay >= start && p.minuteOfDay < end) return instant;
    } else {
      return wallToUtc(tz, dp.year, dp.month, dp.day, Math.floor(start / 60), start % 60);
    }
  }
  return instant;
}

export function nextWorkdayDue(instant: Date, tz: string, hours: WorkHours): Date {
  // due time rolled to the next open day at open
  return nextWindowStart(instant, tz, hours);
}

// ── Formatting helpers (display) ──

export function fmtTime(instant: Date | string, tz: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}

export function fmtDate(instant: Date | string, tz: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }).format(d);
}

export function fmtDateLong(instant: Date | string, tz: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d);
}

export function fmtDateTime(instant: Date | string, tz: string): string {
  return `${fmtDate(instant, tz)} · ${fmtTime(instant, tz)}`;
}

export function fmtDateTimeTz(instant: Date | string, tz: string): string {
  return `${fmtDate(instant, tz)} · ${fmtTime(instant, tz)} ${tzAbbr(typeof instant === "string" ? new Date(instant) : instant, tz)}`;
}

export function relativeDue(instant: Date | string, now: Date): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const diffMs = d.getTime() - now.getTime();
  const mins = Math.round(diffMs / 60000);
  const abs = Math.abs(mins);
  if (abs < 60) return `${abs}m`;
  const hrs = Math.round(abs / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function isSameLocalDay(a: Date, b: Date, tz: string): boolean {
  const pa = tzParts(a, tz);
  const pb = tzParts(b, tz);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

export function localDayKey(instant: Date, tz: string): string {
  const p = tzParts(instant, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
