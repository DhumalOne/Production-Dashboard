"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** V9's "Date" cell: re-bases Today / MTD / QTD / YTD on any past date. Clearing it returns to today. */
export function AsOfDate({ value, max }: { value: string; max: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (d: string) => {
    const next = new URLSearchParams(params.toString());
    if (!d || d === max) next.delete("d");
    else next.set("d", d);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const isToday = value === max;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="asof" className="text-sm text-muted">As of</label>
      <input id="asof" type="date" value={value} max={max} onChange={(e) => go(e.target.value)}
             className={`num h-11 rounded-lg border bg-surface px-2 text-sm ${isToday ? "border-border" : "border-accent text-accent"}`} />
      {!isToday && (
        <button type="button" onClick={() => go("")} className="h-11 px-2 text-sm text-accent">Today</button>
      )}
    </div>
  );
}
