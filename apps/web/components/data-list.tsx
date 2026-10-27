import Link from "next/link";
import type { ReactNode } from "react";

export interface Column<T> {
  label: string;
  cell: (row: T) => ReactNode;
  align?: "right";
  /** Only in the wide-screen table; phone cards leave it out. */
  wide?: boolean;
  /** Only on phone cards (e.g. a combined "90+" where the table shows each bucket). */
  phone?: boolean;
  /** Value for the total row (wide table and phone summary). */
  total?: ReactNode;
}

/**
 * Table on wide screens, cards on phones (PRD §7). The first column is the title, the last column the
 * main value. Optional total row, and a "Show all" link when the list was cut at a limit.
 */
export function DataList<T>({ rows, columns, href, empty = "No data for this period.", totalLabel = "Total", showAll }: {
  rows: T[];
  columns: Column<T>[];
  href?: (row: T) => string;
  empty?: string;
  totalLabel?: string;
  /** When set, the list was limited: show a link to the full list. */
  showAll?: { href: string; label?: string };
}) {
  if (rows.length === 0) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">{empty}</p>;
  const tableCols = columns.filter((c) => !c.phone);
  const phoneCols = columns.filter((c) => !c.wide);
  const [title, ...rest] = phoneCols;
  const value = rest[rest.length - 1];
  const middle = rest.slice(0, -1);
  const hasTotal = columns.some((c) => c.total !== undefined);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[12px] text-muted">
            <tr>
              {tableCols.map((c) => (
                <th key={c.label} scope="col" className={`whitespace-nowrap px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-surface-2">
                {tableCols.map((c, j) => (
                  <td key={c.label} className={`px-3 py-2 ${c.align === "right" ? "num whitespace-nowrap text-right" : ""}`}>
                    {j === 0 && href ? <Link href={href(r)} className="text-accent hover:underline">{c.cell(r)}</Link> : c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasTotal && (
            <tfoot className="border-t-2 border-border bg-surface-2 font-semibold">
              <tr>
                {tableCols.map((c, j) => (
                  <td key={c.label} className={`px-3 py-2 ${c.align === "right" ? "num whitespace-nowrap text-right" : ""}`}>
                    {j === 0 ? totalLabel : c.total ?? ""}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((r, i) => {
          const body = (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate font-medium">{title.cell(r)}</p>
                <p className="num shrink-0 font-semibold">{value.cell(r)}</p>
              </div>
              {middle.length > 0 && (
                <p className="num mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
                  {middle.map((c) => <span key={c.label}>{c.label}: {c.cell(r)}</span>)}
                </p>
              )}
            </>
          );
          return (
            <li key={i}>
              {href ? <Link href={href(r)} className="block min-h-14 px-4 py-3 active:bg-surface-2">{body}</Link> : <div className="px-4 py-3">{body}</div>}
            </li>
          );
        })}
        {hasTotal && (
          <li className="flex items-baseline justify-between gap-3 bg-surface-2 px-4 py-3 font-semibold">
            <span>{totalLabel}</span><span className="num">{value.total ?? ""}</span>
          </li>
        )}
      </ul>
      {showAll && (
        <Link href={showAll.href} scroll={false} className="flex h-12 items-center justify-center border-t border-border text-sm text-accent hover:bg-surface-2">
          {showAll.label ?? "Show all"}
        </Link>
      )}
    </div>
  );
}

/** Small code under a name, e.g. item code or customer code. */
export function Named({ name, code }: { name: string | null | undefined; code: string | null | undefined }) {
  return (
    <>
      <span className="block">{name || code}</span>
      {code && name && <span className="num block text-[12px] text-muted">{code}</span>}
    </>
  );
}
