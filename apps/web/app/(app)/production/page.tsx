import { connection } from "next/server";
import { Suspense } from "react";
import { AsOfDate } from "@/components/as-of";
import { DataList, Named, type Column } from "@/components/data-list";
import { PeriodChips } from "@/components/period-chips";
import { formatINR, formatQty } from "@/lib/format";
import { parseAsOf, parsePeriodKey, resolvePeriod, todayIST } from "@/lib/period";
import { fieldCoverage, productionOn, productionTotals, productSummary, topRejections, type ProductionLine, type ProductSummary } from "@/lib/queries/production";

export const metadata = { title: "Production · Dhumal Dashboard" };

type SP = PageProps<"/production">["searchParams"];

async function read(searchParams: SP) {
  const sp = await searchParams;
  await connection();
  const today = todayIST();
  const day = parseAsOf(sp.d, today);
  const key = parsePeriodKey(sp.p);
  return { today, day, key, period: resolvePeriod(key, day) };
}

const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);

export default function ProductionPage({ searchParams }: PageProps<"/production">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Production</h1>
      <p className="text-sm text-muted">Receipts from production in SAP. Value at production cost.</p>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Daily searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Summary searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Daily({ searchParams }: { searchParams: SP }) {
  const { today, day } = await read(searchParams);
  const [rows, t] = await Promise.all([productionOn(day), productionTotals({ from: day, to: day })]);
  const sum = (k: keyof ProductionLine) => rows.reduce((s, r) => s + ((r[k] as number) ?? 0), 0);
  // V9 Daily Item wise Production: prod order, receipt, item code/name, shift, avg price, master price,
  // production qty, OK qty, OK value, rejected qty, rejected value, rejection %
  const cols: Column<ProductionLine>[] = [
    { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
    { label: "Prod order", cell: (r) => (r.orderNum ? String(r.orderNum) : "—"), wide: true },
    { label: "Receipt", cell: (r) => String(r.receiptNum), wide: true },
    { label: "Shift", cell: (r) => r.shift ?? "—", wide: true },
    { label: "Unit cost", cell: (r) => formatINR(r.unitCost, { exact: true }), align: "right", wide: true },
    { label: "Item avg cost", cell: (r) => formatINR(r.itemAvgCost, { exact: true }), align: "right", wide: true },
    { label: "Production qty", cell: (r) => formatQty(r.productionQty, r.uom), align: "right", wide: true },
    { label: "OK qty", cell: (r) => formatQty(r.okQty, r.uom), align: "right" },
    { label: "Rejected qty", cell: (r) => formatQty(r.rejectedQty, r.uom), align: "right", wide: true },
    { label: "Rej. value", cell: (r) => formatINR(r.rejectedValue), align: "right", wide: true, total: formatINR(sum("rejectedValue")) },
    { label: "Rej. %", cell: (r) => <span className={(r.rejectPct ?? 0) > 5 ? "text-bad" : ""}>{pct(r.rejectPct)}</span>, align: "right" },
    { label: "OK value", cell: (r) => formatINR(r.okValue), align: "right", total: formatINR(sum("okValue")) },
  ];
  return (
    <section className="mt-4" aria-labelledby="daily">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="daily" className="text-base font-semibold">Daily item-wise production</h2>
        <AsOfDate value={day} max={today} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
        {[
          ["OK production", formatINR(t.okValue)],
          ["Rejected", formatINR(t.rejectedValue)],
          ["Rejection %", pct(t.okQty + t.rejectedQty ? (100 * t.rejectedQty) / (t.okQty + t.rejectedQty) : null)],
          ["Receipts", String(t.receipts)],
        ].map(([label, v]) => (
          <div key={label} className="bg-surface p-3"><p className="text-[12px] text-muted">{label}</p><p className="num text-lg font-semibold">{v}</p></div>
        ))}
      </div>
      <div className="mt-3"><DataList rows={rows} columns={cols} empty="No production receipts on this day." /></div>
    </section>
  );
}

async function Summary({ searchParams }: { searchParams: SP }) {
  const { today, day, key, period } = await read(searchParams);
  const week = { from: shift(day, -6), to: day };
  const [rows, rejects, coverage] = await Promise.all([productSummary(period), topRejections(week), fieldCoverage(period)]);
  return (
    <>
      <section className="mt-8" aria-labelledby="prod">
        <h2 id="prod" className="text-base font-semibold">Product-wise summary</h2>
        <div className="mt-2"><PeriodChips current={key} basePath="/production" keep={day !== today ? { d: day } : {}} /></div>
        <div className="mt-3">
          <DataList<ProductSummary> rows={rows} empty="No production in this period." columns={[
            { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
            { label: "Planned qty (orders)", cell: (r) => formatQty(r.plannedQty, r.uom), align: "right", wide: true },
            { label: "OK qty", cell: (r) => formatQty(r.okQty, r.uom), align: "right" },
            { label: "Rejected qty", cell: (r) => formatQty(r.rejectedQty, r.uom), align: "right", wide: true },
            { label: "Rej. %", cell: (r) => pct(r.rejectPct), align: "right" },
            { label: "OK value", cell: (r) => formatINR(r.okValue), align: "right" },
          ]} />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="rej">
        <h2 id="rej" className="text-base font-semibold">Top 5 rejection items, last 7 days</h2>
        <div className="mt-3">
          <DataList<ProductSummary> rows={rejects} empty="No rejections in the last 7 days." columns={[
            { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
            { label: "Rejected qty", cell: (r) => formatQty(r.rejectedQty, r.uom), align: "right" },
            { label: "Rej. %", cell: (r) => pct(r.rejectPct), align: "right" },
            { label: "Rejected value", cell: (r) => formatINR(r.okValue), align: "right" },
          ]} />
        </div>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-2" aria-label="Not available yet">
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="font-semibold">Operator-wise summary</h2>
          <p className="mt-1 text-muted">
            SAP has fields for shift and operator on production receipts, but they are filled on {coverage.operator} of {coverage.lines} lines
            in this period. Once operators are entered in SAP (or the source is connected), this summary appears here.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="font-semibold">Machine-wise summary</h2>
          <p className="mt-1 text-muted">
            Machine minutes, downtime and utilisation are not in SAP. Waiting for the production team to confirm where they are recorded (MES, add-on or Excel).
          </p>
        </div>
      </section>
    </>
  );
}

function shift(day: string, days: number): string {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
