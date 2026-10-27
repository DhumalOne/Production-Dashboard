import { formatINR } from "@/lib/format";

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" });

/** Monthly trend as a line (PRD §7: lines for trends). Values in ₹. */
export function TrendChart({ months, values, label }: { months: string[]; values: number[]; label: string }) {
  const W = 600, H = 180, P = { l: 8, r: 8, t: 16, b: 24 };
  const max = Math.max(...values, 1);
  const x = (i: number) => P.l + (i / Math.max(values.length - 1, 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - Math.max(v, 0) / max) * (H - P.t - P.b);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const last = values.length - 1;
  const summary = months.map((m, i) => `${MONTH.format(new Date(m + "-01"))} ${formatINR(values[i])}`).join(", ");
  return (
    <figure className="rounded-xl border border-border bg-surface p-3">
      <figcaption className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="num text-muted">Peak {formatINR(max)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-44 w-full" role="img" aria-label={`${label}: ${summary}`}>
        <line x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} className="stroke-border" />
        <polyline points={pts} fill="none" className="stroke-accent" strokeWidth={2.5} strokeLinejoin="round" />
        {values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={i === last ? 4 : 2.5} className="fill-accent" />)}
        {months.map((m, i) => (i % 2 === last % 2 ? (
          <text key={m} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted text-[11px]">
            {MONTH.format(new Date(m + "-01"))}
          </text>
        ) : null))}
      </svg>
    </figure>
  );
}
