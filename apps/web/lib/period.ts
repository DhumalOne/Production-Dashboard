// Periods on the Indian financial year (1 April – 31 March), in India time.
// Dates are plain "YYYY-MM-DD" strings so they pass straight into SQL and URLs.

// "today" is one day: the as-of date (?d=), today unless a past date is picked. "week" is Monday to Sunday
// around the as-of date. MTD / QTD / YTD run up to the as-of date. "custom" is ?from= to ?to=.
export type PeriodKey = "today" | "week" | "mtd" | "qtd" | "ytd" | "custom";

export interface DateRange {
  from: string; // inclusive
  to: string; // inclusive
}

export interface Period extends DateRange {
  key: PeriodKey;
  label: string;
}

export const PERIOD_KEYS: PeriodKey[] = ["today", "week", "mtd", "qtd", "ytd", "custom"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const parts = (s: string) => s.split("-").map(Number) as [number, number, number];

/** Today's date in India, whatever the server's time zone. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

export function fyStartYear(date: string): number {
  const [y, m] = parts(date);
  return m >= 4 ? y : y - 1;
}

/** "FY 2026-27" */
export function fyLabel(date: string): string {
  const y = fyStartYear(date);
  return `FY ${y}-${pad((y + 1) % 100)}`;
}

/** Indian quarters: Q1 = Apr–Jun … Q4 = Jan–Mar. */
function quarterStart(date: string): string {
  const [y, m] = parts(date);
  const startMonth = [4, 7, 10, 1][Math.floor(((m + 8) % 12) / 3)];
  return iso(y, startMonth, 1);
}

/** Adds days to a "YYYY-MM-DD" date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Monday of the week containing the date. */
export function weekStart(date: string): string {
  const [y, m, d] = parts(date);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const DAY_NO_YEAR = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const WEEKDAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });

/** "21 Oct 2026" */
export function formatDay(date: string): string {
  return DAY.format(new Date(date + "T00:00:00Z"));
}

/** "19 – 25 Oct 2026", "28 Sept – 4 Oct 2026", "1 Dec 2025 – 5 Jan 2026" */
export function formatRange(from: string, to: string): string {
  if (from === to) return formatDay(from);
  const f = new Date(from + "T00:00:00Z");
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${formatDay(from)} – ${formatDay(to)}`;
  const start = from.slice(0, 7) === to.slice(0, 7) ? String(f.getUTCDate()) : DAY_NO_YEAR.format(f);
  return `${start} – ${formatDay(to)}`;
}

/**
 * `today` is the as-of date. `limit` (the real today) caps the end of a week or custom range, so a week
 * that is still running ends today.
 */
export function resolvePeriod(key: PeriodKey, today: string, custom?: Partial<DateRange>, limit: string = today): Period {
  const [y, m] = parts(today);
  switch (key) {
    case "today":
      return { key, from: today, to: today, label: today === limit ? "Today" : `${WEEKDAY.format(new Date(today + "T00:00:00Z"))} ${formatDay(today)}` };
    case "week": {
      const from = weekStart(today);
      const sunday = addDays(from, 6);
      const to = sunday < limit ? sunday : limit;
      return { key, from, to, label: `Week ${formatRange(from, sunday)}` };
    }
    case "mtd":
      return { key, from: iso(y, m, 1), to: today, label: "Month to date" };
    case "qtd":
      return { key, from: quarterStart(today), to: today, label: "Quarter to date" };
    case "ytd":
      return { key, from: iso(fyStartYear(today), 4, 1), to: today, label: `${fyLabel(today)} to date` };
    case "custom": {
      let from = custom?.from && isDate(custom.from) ? custom.from : iso(y, m, 1);
      let to = custom?.to && isDate(custom.to) ? custom.to : today;
      if (from > to) [from, to] = [to, from];
      if (to > limit) to = limit;
      if (from > to) from = to;
      return { key, from, to, label: formatRange(from, to) };
    }
  }
}

export interface PeriodState {
  key: PeriodKey;
  /** As-of date: the picked day, the day inside the picked week, or the end of a custom range. */
  asOf: string;
  today: string;
  period: Period;
  /** The URL parameters for this period (p, d, from, to), to carry it along in links. */
  params: Record<string, string>;
}

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Reads ?p= ?d= ?from= ?to= the same way on every page. MTD / QTD / YTD labels say "to <date>" when re-based. */
export function readPeriod(sp: SearchParams, today: string, fallback: PeriodKey = "mtd"): PeriodState {
  const key = parsePeriodKey(sp.p, fallback);
  if (key === "custom") {
    const period = resolvePeriod("custom", today, { from: first(sp.from), to: first(sp.to) }, today);
    return { key, asOf: period.to, today, period, params: { p: key, from: period.from, to: period.to } };
  }
  const asOf = parseAsOf(sp.d, today);
  const period = resolvePeriod(key, asOf, undefined, today);
  if (asOf !== today && (key === "mtd" || key === "qtd" || key === "ytd")) period.label += ` to ${formatDay(asOf)}`;
  return { key, asOf, today, period, params: { p: key, ...(asOf !== today ? { d: asOf } : {}) } };
}

/** Same dates one year earlier (29 Feb maps to 28 Feb). */
export function previousYear(range: DateRange): DateRange {
  const back = (s: string) => {
    const [y, m, d] = parts(s);
    const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
    return iso(y - 1, m, Math.min(d, last));
  };
  return { from: back(range.from), to: back(range.to) };
}

export function isDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function parsePeriodKey(value: string | string[] | undefined, fallback: PeriodKey = "mtd"): PeriodKey {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "today" || v === "week" || v === "mtd" || v === "qtd" || v === "ytd" || v === "custom" ? v : fallback;
}

/** The as-of date from ?d=, never later than today; anything invalid means today. */
export function parseAsOf(value: string | string[] | undefined, today: string): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && isDate(v) && v <= today ? v : today;
}

/** Number of days in a range, inclusive. */
export function dayCount(range: DateRange): number {
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1;
}
