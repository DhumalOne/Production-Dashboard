import { connection } from "next/server";
import { Suspense } from "react";
import { PeriodPicker } from "@/components/period-picker";
import { MonthMatrix } from "@/components/month-matrix";
import { SALES_TABS, SubNav } from "@/components/sub-nav";
import { formatINR } from "@/lib/format";
import { parseAsOf, todayIST } from "@/lib/period";
import { itemTrends, salespersonMonths } from "@/lib/queries/sales";

export const metadata = { title: "Sales trends · Dhumal Dashboard" };

type SP = PageProps<"/sales/items">["searchParams"];

async function asOfFrom(searchParams: SP) {
  const sp = await searchParams;
  await connection();
  const today = todayIST();
  return { today, asOf: parseAsOf(sp.d, today) };
}

export default function SalesTrendsPage({ searchParams }: PageProps<"/sales/items">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Sales</h1>
      <SubNav items={SALES_TABS} current="/sales/items" />
      <Suspense fallback={<div className="mt-4 h-11" />}>
        <DatePicker searchParams={searchParams} />
      </Suspense>
      <section className="mt-4" aria-labelledby="sp">
        <h2 id="sp" className="text-base font-semibold">Salespeople, month by month</h2>
        <Suspense fallback={<div className="mt-3 h-96 animate-pulse rounded-xl bg-surface" />}>
          <People searchParams={searchParams} />
        </Suspense>
      </section>
      <section className="mt-8" aria-labelledby="items">
        <h2 id="items" className="text-base font-semibold">Top 50 items, month by month</h2>
        <p className="text-sm text-muted">
          Each month: sale, <strong className="font-medium text-text">price after discount</strong> (per unit, before GST) and{" "}
          <strong className="font-medium text-text">total discount</strong> against list price.
        </p>
        <Suspense fallback={<div className="mt-4 h-[600px] animate-pulse rounded-xl bg-surface" />}>
          <Items searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

async function DatePicker({ searchParams }: { searchParams: SP }) {
  const { today, asOf } = await asOfFrom(searchParams);
  return <div className="mt-3"><PeriodPicker dateOnly value={{ key: "today", asOf }} today={today} range={{ from: asOf, to: asOf }} /></div>;
}

async function People({ searchParams }: { searchParams: SP }) {
  const { asOf } = await asOfFrom(searchParams);
  const { months, rows, totals } = await salespersonMonths(asOf);
  return (
    <div className="mt-3">
      <MonthMatrix caption="Sale by salesperson by month" months={months} rows={[
        ...rows.map((r) => ({ key: r.key, label: r.label, cells: r.values.map((v) => (v ? formatINR(v) : "—")) })),
        { key: "total", label: "Total", cells: totals.map((v, i) => <strong key={i}>{formatINR(v)}</strong>) },
      ]} />
    </div>
  );
}

async function Items({ searchParams }: { searchParams: SP }) {
  const { asOf } = await asOfFrom(searchParams);
  const { months, items } = await itemTrends(asOf, 50);
  return (
    <div className="mt-4">
      <MonthMatrix caption="Top items by month: sale, price after discount, discount" months={months} rows={items.map((it) => ({
        key: it.itemCode,
        label: it.itemName,
        sub: it.itemCode,
        cells: it.months.map((m, i) => (m.amount ? (
          <span key={i}>
            <span className="block font-medium">{formatINR(m.amount)}</span>
            <span className="block text-[12px] text-muted">{m.price == null ? "—" : formatINR(m.price, { exact: true })}</span>
            <span className="block text-[12px] text-muted">{m.discountPct == null ? "" : `${m.discountPct.toFixed(1)}% off`}</span>
          </span>
        ) : <span key={i} className="text-muted">—</span>)),
      }))} />
    </div>
  );
}
