import { formatINR } from "@/lib/format";
import { BUCKETS, type AgingRow } from "@/lib/queries/aging";

// Sequential ramp from "fresh" to "old" (one hue family, light to strong), always labelled.
const SHADES = ["bg-accent/25", "bg-accent/40", "bg-accent/55", "bg-warn/60", "bg-bad/60", "bg-bad"];

/** Stacked bar of the six aging buckets with a labelled legend underneath. */
export function AgingBar({ row }: { row: AgingRow }) {
  const parts = BUCKETS.map((b, i) => ({ ...b, value: Math.max(row[b.key], 0), shade: SHADES[i] }));
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img"
           aria-label={parts.map((p) => `${p.label} days ${formatINR(p.value)}`).join(", ")}>
        {parts.map((p) => p.value > 0 && (
          <div key={p.key} className={p.shade} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <dl className="num mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-[13px] sm:grid-cols-6">
        {parts.map((p) => (
          <div key={p.key}>
            <dt className="flex items-center gap-1.5 text-muted"><span className={`size-2.5 rounded-sm ${p.shade}`} />{p.label}</dt>
            <dd className="font-medium">{formatINR(p.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
