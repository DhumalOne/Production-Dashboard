import Link from "next/link";
import { formatChange, formatINR } from "@/lib/format";
import type { KpiCard } from "@/lib/queries/home";

/** Change vs last year: arrow + sign + colour, so colour is never the only signal. */
export function Change({ current, previous, label = "vs last year" }: { current: number; previous: number; label?: string }) {
  const c = formatChange(current, previous);
  const tone = c.direction === "up" ? "text-good" : c.direction === "down" ? "text-bad" : "text-muted";
  const arrow = c.direction === "up" ? "▲" : c.direction === "down" ? "▼" : "";
  return (
    <span className={`num text-sm ${tone}`}>
      {arrow && <span aria-hidden>{arrow} </span>}
      {c.text}
      <span className="text-muted"> {label}</span>
    </span>
  );
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 100, h = 28;
  const max = Math.max(...values, 0), min = Math.min(...values, 0);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - ((v - min) / span) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-7 w-full text-accent" role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke"
                strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function KpiTile({ kpi, periodLabel, query }: { kpi: KpiCard; periodLabel: string; query: string }) {
  return (
    <Link href={`${kpi.href}${query}`}
          className="block rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent/50 active:bg-surface-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-muted">{kpi.label}</h3>
        <span className="text-[12px] text-muted">{periodLabel}</span>
      </div>
      <p className="num mt-1 text-2xl font-semibold tracking-tight">{formatINR(kpi.period)}</p>
      <Change current={kpi.period} previous={kpi.periodPY} />
      <div className="mt-2">
        <Sparkline values={kpi.months.map((m) => m.amount)} label={`${kpi.label}, last 6 months`} />
      </div>
      <dl className="num mt-2 grid grid-cols-3 gap-1 text-[12px]">
        <div><dt className="text-muted">Today</dt><dd>{formatINR(kpi.today)}</dd></div>
        <div><dt className="text-muted">MTD</dt><dd>{formatINR(kpi.mtd)}</dd></div>
        <div><dt className="text-muted">YTD</dt><dd>{formatINR(kpi.ytd)}</dd></div>
      </dl>
      <p className="num mt-1 text-[12px] text-muted">Avg {formatINR(kpi.dailyAvg)}/day</p>
    </Link>
  );
}

export function KpiSkeleton() {
  return <div className="h-[212px] animate-pulse rounded-xl border border-border bg-surface" aria-hidden />;
}
