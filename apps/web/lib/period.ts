// Periods on the Indian financial year (1 April – 31 March), in India time.
// Dates are plain "YYYY-MM-DD" strings so they pass straight into SQL and URLs.

export type PeriodKey = "today" | "mtd" | "qtd" | "ytd" | "custom";

export interface DateRange {
  from: string; // inclusive
  to: string; // inclusive
}

export interface Period extends DateRange {
  key: PeriodKey;
  label: string;
}

export const PERIOD_KEYS: PeriodKey[] = ["today", "mtd", "qtd", "ytd"];

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

export function resolvePeriod(key: PeriodKey, today: string, custom?: Partial<DateRange>): Period {
  const [y, m] = parts(today);
  switch (key) {
    case "today":
      return { key, from: today, to: today, label: "Today" };
    case "mtd":
      return { key, from: iso(y, m, 1), to: today, label: "Month to date" };
    case "qtd":
      return { key, from: quarterStart(today), to: today, label: "Quarter to date" };
    case "ytd":
      return { key, from: iso(fyStartYear(today), 4, 1), to: today, label: `${fyLabel(today)} to date` };
    case "custom": {
      const from = custom?.from && isDate(custom.from) ? custom.from : iso(y, m, 1);
      const to = custom?.to && isDate(custom.to) ? custom.to : today;
      return from <= to ? { key, from, to, label: `${from} to ${to}` } : { key, from: to, to: from, label: `${to} to ${from}` };
    }
  }
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
  return v === "today" || v === "mtd" || v === "qtd" || v === "ytd" || v === "custom" ? v : fallback;
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
