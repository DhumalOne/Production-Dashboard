import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataList, Named } from "@/components/data-list";
import { Change } from "@/components/kpi";
import { PeriodPicker } from "@/components/period-picker";
import { SALES_TABS, SubNav } from "@/components/sub-nav";
import { TrendChart } from "@/components/trend-chart";
import { formatINR, formatQty } from "@/lib/format";
import { previousYear, readPeriod, todayIST } from "@/lib/period";
import { salesBy, salesTrend, type SalesDimension, type SalesRow } from "@/lib/queries/sales";

export const metadata = { title: "Sales · Dhumal Dashboard" };

const DIMS: { key: SalesDimension; label: string }[] = [
  { key: "salesperson", label: "Salesperson" },
  { key: "customer", label: "Customer" },
  { key: "item", label: "Item" },
  { key: "group", label: "Item group" },
];
const LIMIT = 100;

type SP = Promise<Record<string, string | string[] | undefined>>;

async function read(searchParams: SP) {
  const sp = await searchParams;
  const by = (DIMS.find((d) => d.key === sp.by)?.key ?? "salesperson") as SalesDimension;
  await connection();
  return { by, all: sp.all === "1", ...readPeriod(sp, todayIST()) };
}

export default function SalesPage({ searchParams }: PageProps<"/sales">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Sales</h1>
      <SubNav items={SALES_TABS} current="/sales" />
      <p className="mt-3 text-sm text-muted">Net of credit notes, before GST, excluding inter-company customers.</p>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="mt-6 h-56 animate-pulse rounded-xl bg-surface" />}>
        <Trend searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { by, key, today, asOf, all, period, params } = await read(searchParams);
  const data = await salesBy(by, period, previousYear(period), all ? 5000 : LIMIT);
  const keep = { by, ...params };
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...keep, ...extra }).toString();
  const cut = !all && data.rows.length === LIMIT;
  const withCode = by === "customer" || by === "item";
  const columns = [
    { label: DIMS.find((d) => d.key === by)!.label, cell: (r: SalesRow) => (withCode ? <Named name={r.label} code={r.key} /> : r.label) },
    ...(by === "item" ? [{ label: "Qty", cell: (r: SalesRow) => formatQty(r.quantity), align: "right" as const }] : []),
    { label: "Share", cell: (r: SalesRow) => `${(r.share * 100).toFixed(1)}%`, align: "right" as const, total: "100%" },
    { label: "Last year", cell: (r: SalesRow) => formatINR(r.amountPY), align: "right" as const, wide: true, total: formatINR(data.totalPY) },
    ...(by === "item" || by === "customer"
      ? [{ label: "Margin", cell: (r: SalesRow) => (r.margin == null ? "—" : formatINR(r.margin)), align: "right" as const, wide: true }]
      : []),
    { label: "Sale", cell: (r: SalesRow) => formatINR(r.amount), align: "right" as const, total: formatINR(data.total) },
  ];
  return (
    <>
      <div className="mt-4"><PeriodPicker value={{ key, asOf }} today={today} range={period} /></div>
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">{period.label}</p>
        <p className="num text-3xl font-semibold">{formatINR(data.total)}</p>
        <Change current={data.total} previous={data.totalPY} />
      </div>
      <nav aria-label="Group by" className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {DIMS.map((d) => (
          <Link key={d.key} href={`/sales?${new URLSearchParams({ ...keep, by: d.key })}`} scroll={false} aria-current={d.key === by ? "true" : undefined}
                className={`flex h-11 shrink-0 items-center rounded-lg px-4 text-sm ${d.key === by ? "bg-accent-soft font-medium text-accent" : "bg-surface text-text"}`}>
            {d.label}
          </Link>
        ))}
      </nav>
      <div className="mt-3">
        <DataList rows={data.rows} columns={columns}
                  totalLabel={cut ? "Total (all rows)" : "Total"}
                  showAll={cut ? { href: `/sales?${qs({ all: "1" })}` } : undefined}
                  href={by === "group" ? undefined
                    : by === "customer" ? (r) => `/customers/${encodeURIComponent(r.key)}`
                    : (r) => `/sales/documents?${qs({ key: r.key, name: r.label })}`} />
      </div>
    </>
  );
}

async function Trend({ searchParams }: { searchParams: SP }) {
  const { asOf } = await read(searchParams);
  const t = await salesTrend(asOf);
  return (
    <section className="mt-6 space-y-3" aria-label="Trend">
      <TrendChart months={t.months} values={t.series[0].values} label="Sale, last 12 months" />
      <div className="grid gap-3 md:grid-cols-2">
        {t.series.slice(1).map((s) => <TrendChart key={s.label} months={t.months} values={s.values} label={s.label} />)}
      </div>
    </section>
  );
}
