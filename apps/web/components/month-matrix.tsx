import type { ReactNode } from "react";

const MONTH = new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });
export const monthLabel = (ym: string) => MONTH.format(new Date(ym + "-01"));

/**
 * Rows × months table (V9 trend sheets). The first column stays put; months scroll sideways
 * inside the card on phones, so the page itself never scrolls horizontally.
 */
export function MonthMatrix({ months, rows, caption }: {
  months: string[];
  rows: { key: string; label: string; sub?: string; cells: ReactNode[] }[];
  caption: string;
}) {
  if (rows.length === 0) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">No data for these months.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2 text-[12px] text-muted">
          <tr>
            <th scope="col" className="sticky left-0 bg-surface-2 px-3 py-2 text-left font-medium">Name</th>
            {months.map((m) => <th key={m} scope="col" className="px-3 py-2 text-right font-medium">{monthLabel(m)}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="sticky left-0 max-w-44 bg-surface px-3 py-2 text-left align-top font-normal">
                <span className="block truncate">{r.label}</span>
                {r.sub && <span className="num block text-[12px] text-muted">{r.sub}</span>}
              </th>
              {r.cells.map((c, i) => <td key={i} className="num px-3 py-2 text-right align-top">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
