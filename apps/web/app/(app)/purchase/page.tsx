import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataList, Named } from "@/components/data-list";
import { Change } from "@/components/kpi";
import { MonthMatrix } from "@/components/month-matrix";
import { PeriodPicker } from "@/components/period-picker";
import { formatINR, formatQty } from "@/lib/format";
import { previousYear, readPeriod, todayIST } from "@/lib/period";
import { openPurchaseOrders, purchaseBy, purchaseTrend, type OpenPO, type PurchaseDimension, type PurchaseRow } from "@/lib/queries/purchase";

export const metadata = { title: "Purchase · Dhumal Dashboard" };

const DIMS: { key: PurchaseDimension; label: string }[] = [
  { key: "vendor", label: "Vendor" },
  { key: "item", label: "Item" },
  { key: "buyer", label: "Buyer" },
];

export default function PurchasePage({ searchParams }: PageProps<"/purchase">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Purchase</h1>
      <p className="text-sm text-muted">A/P invoices net of A/P credit memos, before GST.</p>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="mt-6 h-72 animate-pulse rounded-xl bg-surface" />}>
        <OpenPOs />
      </Suspense>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Trends searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

type SP = PageProps<"/purchase">["searchParams"];

async function read(searchParams: SP) {
  const sp = await searchParams;
  await connection();
  return { sp, ...readPeriod(sp, todayIST()) };
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { sp, today, asOf, key, period, params } = await read(searchParams);
  const by = DIMS.find((d) => d.key === sp.by)?.key ?? "vendor";
  const all = sp.all === "1";
  const data = await purchaseBy(by, period, previousYear(period), all ? 5000 : 100);
  const keep = { by, ...params };
  const cut = !all && data.rows.length === 100;
  return (
    <>
      <div className="mt-4"><PeriodPicker value={{ key, asOf }} today={today} range={period} /></div>
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">{period.label}</p>
        <p className="num text-3xl font-semibold">{formatINR(data.total)}</p>
        <Change current={data.total} previous={data.totalPY} />
      </div>
      <nav aria-label="Group by" className="mt-4 flex gap-2">
        {DIMS.map((d) => (
          <Link key={d.key} href={`/purchase?${new URLSearchParams({ ...keep, by: d.key })}`} scroll={false} aria-current={d.key === by ? "true" : undefined}
                className={`flex h-11 items-center rounded-lg px-4 text-sm ${d.key === by ? "bg-accent-soft font-medium text-accent" : "bg-surface"}`}>
            {d.label}
          </Link>
        ))}
      </nav>
      <div className="mt-3">
        <DataList<PurchaseRow> rows={data.rows}
          totalLabel={cut ? "Total (all rows)" : "Total"}
          showAll={cut ? { href: `/purchase?${new URLSearchParams({ ...keep, all: "1" })}` } : undefined}
          columns={[
            { label: DIMS.find((d) => d.key === by)!.label, cell: (r) => (by === "buyer" ? r.label : <Named name={r.label} code={r.key} />) },
            ...(by === "item" ? [
              { label: "Qty", cell: (r: PurchaseRow) => formatQty(r.quantity), align: "right" as const },
              { label: "Price after discount", cell: (r: PurchaseRow) => (r.price == null ? "—" : formatINR(r.price, { exact: true })), align: "right" as const, wide: true },
            ] : []),
            { label: "Share", cell: (r) => `${(r.share * 100).toFixed(1)}%`, align: "right", total: "100%" },
            { label: "Last year", cell: (r) => formatINR(r.amountPY), align: "right", wide: true, total: formatINR(data.totalPY) },
            { label: "Purchase", cell: (r) => formatINR(r.amount), align: "right", total: formatINR(data.total) },
          ]} />
      </div>
    </>
  );
}

async function OpenPOs() {
  const { rows, total, overdueValue } = await openPurchaseOrders(100);
  return (
    <section className="mt-8" aria-labelledby="po">
      <h2 id="po" className="text-base font-semibold">Open purchase orders</h2>
      <p className="num text-sm text-muted">{formatINR(total)} still to receive · <span className="text-bad">{formatINR(overdueValue)} past due date</span></p>
      <div className="mt-3">
        <DataList<OpenPO> rows={rows} empty="No open purchase orders." columns={[
          { label: "Vendor", cell: (r) => r.vendor },
          { label: "Due", cell: (r) => <span className={r.overdue ? "font-medium text-bad" : ""}>{r.overdue ? "⚠ " : ""}{r.dueDate ?? "—"}</span> },
          { label: "PO", cell: (r) => String(r.docNum), wide: true },
          { label: "Lines", cell: (r) => String(r.lines), align: "right", wide: true },
          { label: "Open value", cell: (r) => formatINR(r.openValue), align: "right" },
        ]} />
      </div>
    </section>
  );
}

async function Trends({ searchParams }: { searchParams: SP }) {
  const { asOf } = await read(searchParams);
  const t = await purchaseTrend(asOf);
  const amounts = (values: number[]) => values.map((v) => (v ? formatINR(v) : "—"));
  return (
    <section className="mt-8 space-y-4" aria-label="Purchase trends">
      <h2 className="text-base font-semibold">Last 6 months</h2>
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">By buyer</h3>
        <MonthMatrix caption="Purchase by buyer by month" months={t.months} rows={t.buyers.map((s) => ({ key: s.key, label: s.label, cells: amounts(s.values) }))} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">Top 5 vendors</h3>
        <MonthMatrix caption="Top 5 vendors by month" months={t.months} rows={t.vendors.map((s) => ({ key: s.key, label: s.label, sub: s.key, cells: amounts(s.values) }))} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted">Top 10 items: purchase and price after discount</h3>
        <MonthMatrix caption="Top 10 purchased items by month" months={t.months} rows={t.items.map((s) => ({
          key: s.key, label: s.label, sub: s.key,
          cells: s.values.map((v, i) => (v ? (
            <span key={i}>
              <span className="block font-medium">{formatINR(v)}</span>
              <span className="block text-[12px] text-muted">{s.prices?.[i] == null ? "—" : formatINR(s.prices[i], { exact: true })}</span>
            </span>
          ) : <span key={i} className="text-muted">—</span>)),
        }))} />
      </div>
    </section>
  );
}
