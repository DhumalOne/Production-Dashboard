import Link from "next/link";
import { formatINR } from "@/lib/format";
import type { GroupValue } from "@/lib/queries/stock";

/** Value and share bars; with href each row opens its items. */
export function ShareBars({ rows, href }: { rows: GroupValue[]; href?: (r: GroupValue) => string }) {
  return (
    <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {rows.map((r) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={`min-w-0 truncate ${href ? "text-accent" : ""}`}>{r.name}{href && <span aria-hidden className="text-muted"> ›</span>}</span>
              <span className="num shrink-0 font-medium">{formatINR(r.value)} <span className="text-muted">{(r.share * 100).toFixed(1)}%</span></span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-surface-2">
              <div className="h-2 rounded-full bg-mark" style={{ width: `${Math.max(r.share * 100, 0.5)}%` }} />
            </div>
          </>
        );
        return (
          <li key={r.key}>
            {href
              ? <Link href={href(r)} className="block px-4 py-2.5 hover:bg-surface-2 active:bg-surface-2">{body}</Link>
              : <div className="px-4 py-2.5">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}
