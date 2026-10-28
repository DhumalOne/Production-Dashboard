"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { addDays, formatDay, formatRange, weekStart, type PeriodKey } from "@/lib/period";

// One period control for every screen: preset chips (Day, Week, MTD, QTD, YTD, Range) and a calendar.
// Date: one day, or the end date for MTD / QTD / YTD (V9's "Date" cell). Week: any day picks its Monday-Sunday
// week. Range: tap the start, then the end. The choice lives in the URL (?p= ?d= ?from= ?to=), so links and
// the back button keep it.

type Mode = "date" | "week" | "range";

const CHIPS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Day" },
  { key: "week", label: "Week" },
  { key: "mtd", label: "MTD" },
  { key: "qtd", label: "QTD" },
  { key: "ytd", label: "YTD" },
  { key: "custom", label: "Range" },
];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

const modeOf = (key: PeriodKey): Mode => (key === "week" ? "week" : key === "custom" ? "range" : "date");
const monthOf = (date: string) => date.slice(0, 7) + "-01";
const shiftMonth = (month: string, n: number) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
};

export function PeriodPicker({ value, today, range, dateOnly = false }: {
  /** Current period from the URL (readPeriod). */
  value: { key: PeriodKey; asOf: string };
  today: string;
  /** The resolved from-to of the current period, shaded in the calendar. */
  range: { from: string; to: string };
  /** Screens that show a single day (Orders & dispatch, Sales trends): calendar only, no chips. */
  dateOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(dateOnly ? "date" : modeOf(value.key));
  const [month, setMonth] = useState(monthOf(value.asOf));
  const [start, setStart] = useState<string | null>(null); // first tap of a range
  const [hover, setHover] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => boxRef.current && !boxRef.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  /** Navigates with the period replaced and every other parameter (by, dir, view...) kept. */
  function go(next: { p?: PeriodKey; d?: string; from?: string; to?: string }) {
    const q = new URLSearchParams(params.toString());
    for (const k of ["p", "d", "from", "to", "all"]) q.delete(k);
    if (next.p && !dateOnly) q.set("p", next.p);
    if (next.d && next.d !== today) q.set("d", next.d);
    if (next.from) q.set("from", next.from);
    if (next.to) q.set("to", next.to);
    const qs = q.toString();
    setOpen(false);
    setStart(null);
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function openIn(m: Mode) {
    setMode(m);
    setStart(null);
    setMonth(monthOf(m === "range" ? range.to : value.asOf));
    setOpen(true);
  }

  function chip(key: PeriodKey) {
    if (key === "custom") return openIn("range");
    // Keep a picked past date: MTD on 15 Oct stays "as of 15 Oct" when switching to QTD.
    go({ p: key, d: value.key === "custom" ? undefined : value.asOf });
  }

  function pick(day: string) {
    if (mode === "range") {
      if (!start) return setStart(day);
      const [from, to] = start <= day ? [start, day] : [day, start];
      return go({ p: "custom", from, to });
    }
    const p = mode === "week" ? "week" : value.key === "week" || value.key === "custom" ? "today" : value.key;
    go({ p, d: day });
  }

  // Shaded days: the current period, or the week / range being chosen.
  const shade = (day: string): "edge" | "in" | null => {
    if (mode === "range" && start) {
      const end = hover ?? start;
      const [a, b] = start <= end ? [start, end] : [end, start];
      return day === a || day === b ? "edge" : day > a && day < b ? "in" : null;
    }
    if (mode === "week" && hover) {
      const ws = weekStart(hover);
      return day >= ws && day <= addDays(ws, 6) ? "in" : null;
    }
    if (mode === modeOf(value.key) || dateOnly) {
      if (day === value.asOf && mode === "date") return "edge";
      if (day === range.from || day === range.to) return "edge";
      return day > range.from && day < range.to ? "in" : null;
    }
    return null;
  };

  const yesterday = addDays(today, -1);
  const thisWeek = weekStart(today);
  const lastMonthEnd = addDays(monthOf(today), -1);
  const fyStart = `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) >= 4 ? 0 : 1)}-04-01`;
  const shortcuts: { label: string; run: () => void }[] =
    mode === "date" ? [
      { label: "Today", run: () => pick(today) },
      { label: "Yesterday", run: () => pick(yesterday) },
      { label: "A week ago", run: () => pick(addDays(today, -7)) },
    ] : mode === "week" ? [
      { label: "This week", run: () => go({ p: "week", d: today }) },
      { label: "Last week", run: () => go({ p: "week", d: addDays(thisWeek, -1) }) },
      { label: "2 weeks ago", run: () => go({ p: "week", d: addDays(thisWeek, -8) }) },
    ] : [
      { label: "Last 7 days", run: () => go({ p: "custom", from: addDays(today, -6), to: today }) },
      { label: "Last 30 days", run: () => go({ p: "custom", from: addDays(today, -29), to: today }) },
      { label: "Last month", run: () => go({ p: "custom", from: monthOf(lastMonthEnd), to: lastMonthEnd }) },
      { label: "Last FY", run: () => go({ p: "custom", from: `${Number(fyStart.slice(0, 4)) - 1}-04-01`, to: addDays(fyStart, -1) }) },
    ];

  // Month grid starting on Monday.
  const gridStart = weekStart(month);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const rows = days[35].slice(0, 7) === month.slice(0, 7) ? 6 : 5;
  const canNext = shiftMonth(month, 1) <= today;

  const buttonLabel = dateOnly || value.key === "today"
    ? (value.asOf === today ? `Today, ${formatDay(today)}` : SHORT.format(new Date(value.asOf + "T00:00:00Z")))
    : value.key === "custom" || value.key === "week" ? formatRange(range.from, range.to)
    : value.asOf === today ? `To today, ${formatDay(today)}` : `To ${formatDay(value.asOf)}`;

  return (
    <div ref={boxRef} className="relative flex flex-wrap items-center gap-2">
      {!dateOnly && (
        <div role="group" aria-label="Period" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {CHIPS.map((c) => {
            const on = c.key === value.key;
            return (
              <button key={c.key} type="button" onClick={() => chip(c.key)} aria-pressed={on}
                      className={`flex h-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-sm font-medium ${
                        on ? "border-accent bg-accent text-white dark:text-bg" : "border-border bg-surface text-text"}`}>
                {c.label}
              </button>
            );
          })}
        </div>
      )}
      <button type="button" onClick={() => (open ? setOpen(false) : openIn(dateOnly ? "date" : modeOf(value.key)))}
              aria-expanded={open} aria-haspopup="dialog"
              className={`num flex h-11 items-center gap-2 rounded-lg border bg-surface px-3 text-sm ${
                value.asOf !== today || value.key === "custom" ? "border-accent text-accent" : "border-border"}`}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        {buttonLabel}
      </button>
      {(value.asOf !== today || value.key === "custom") && (
        <button type="button" onClick={() => go({ p: value.key === "custom" ? "mtd" : value.key })}
                className="h-11 px-1 text-sm text-accent">Back to today</button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" aria-hidden onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="Choose dates"
               className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-2xl border border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl
                          sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem] sm:rounded-xl">
            {!dateOnly && (
              <div role="tablist" aria-label="Pick by" className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
                {(["date", "week", "range"] as const).map((m) => (
                  <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => { setMode(m); setStart(null); }}
                          className={`h-9 rounded-md text-sm ${mode === m ? "bg-surface font-medium text-accent shadow-sm" : "text-muted"}`}>
                    {m === "date" ? "Date" : m === "week" ? "Week" : "Range"}
                  </button>
                ))}
              </div>
            )}
            <p className="mb-2 text-[13px] text-muted" aria-live="polite">
              {mode === "range" ? (start ? `From ${formatDay(start)}: now tap the end date.` : "Tap the start date, then the end date.")
                : mode === "week" ? "Tap any day to see its week (Monday to Sunday)."
                : value.key === "mtd" || value.key === "qtd" || value.key === "ytd"
                  ? `${value.key.toUpperCase()} up to the date you tap.` : "Tap a date to see that day."}
            </p>

            <div className="flex items-center justify-between">
              <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"
                      className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-2">‹</button>
              <span className="text-sm font-medium">{MONTH.format(new Date(month + "T00:00:00Z"))}</span>
              <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} disabled={!canNext} aria-label="Next month"
                      className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-2 disabled:opacity-30">›</button>
            </div>
            <div className="mt-1 grid grid-cols-7 text-center text-[11px] text-muted" aria-hidden>
              {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => setHover(null)}>
              {days.slice(0, rows * 7).map((day) => {
                const inMonth = day.slice(0, 7) === month.slice(0, 7);
                const future = day > today;
                const s = shade(day);
                return (
                  <button key={day} type="button" disabled={future} onClick={() => pick(day)}
                          onMouseEnter={() => setHover(day)} onFocus={() => setHover(day)}
                          aria-label={formatDay(day)} aria-pressed={s === "edge"}
                          className={`num h-10 text-sm disabled:cursor-not-allowed disabled:opacity-25 ${
                            s === "edge" ? "rounded-lg bg-accent font-semibold text-white dark:text-bg"
                            : s === "in" ? "bg-accent-soft text-accent"
                            : "rounded-lg hover:bg-surface-2"} ${inMonth ? "" : "text-muted"} ${
                            day === today && s !== "edge" ? "font-semibold underline underline-offset-4" : ""}`}>
                    {Number(day.slice(8))}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              {shortcuts.map((s) => (
                <button key={s.label} type="button" onClick={s.run}
                        className="h-9 rounded-full border border-border px-3 text-[13px] hover:border-accent hover:text-accent">
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
