import Link from "next/link";
import type { PeriodKey } from "@/lib/period";

const CHIPS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "mtd", label: "MTD" },
  { key: "qtd", label: "QTD" },
  { key: "ytd", label: "YTD" },
];

export function PeriodChips({ current, basePath, keep = {} }: { current: PeriodKey; basePath: string; keep?: Record<string, string> }) {
  return (
    <div role="group" aria-label="Period" className="flex gap-2">
      {CHIPS.map((c) => {
        const on = c.key === current;
        const qs = new URLSearchParams({ ...keep, p: c.key }).toString();
        return (
          <Link key={c.key} href={`${basePath}?${qs}`} aria-current={on ? "true" : undefined} scroll={false}
                className={`flex h-11 min-w-14 items-center justify-center rounded-full border px-4 text-sm font-medium ${
                  on ? "border-accent bg-accent text-white dark:text-bg" : "border-border bg-surface text-text"}`}>
            {c.label}
          </Link>
        );
      })}
    </div>
  );
}
