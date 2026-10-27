import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AsOfDate } from "@/components/as-of";
import { DataList, Named, type Column } from "@/components/data-list";
import { STOCK_TABS, SubNav } from "@/components/sub-nav";
import { formatINR, formatQty } from "@/lib/format";
import { parseAsOf, todayIST } from "@/lib/period";
import { dispatchOn, ordersOn, pendingByAge, pendingOrders, shortages, type ItemShortage, type OrderLine } from "@/lib/queries/stock";

export const metadata = { title: "Orders & dispatch · Dhumal Dashboard" };

type SP = PageProps<"/stock/orders">["searchParams"];
const VIEWS = [
  { key: "today", label: "Day" },
  { key: "pending", label: "Pending" },
  { key: "shortage", label: "Shortages" },
] as const;

export default function OrdersPage({ searchParams }: PageProps<"/stock/orders">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Stock</h1>
      <SubNav items={STOCK_TABS} current="/stock/orders" />
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function chip(on: boolean) {
  return `flex h-11 items-center rounded-lg px-4 text-sm ${on ? "bg-accent-soft font-medium text-accent" : "bg-surface"}`;
}

async function Body({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? (sp.overdue ? "pending" : "today");
  await connection();
  const today = todayIST();
  const day = parseAsOf(sp.d, today);
  return (
    <>
      <nav aria-label="View" className="mt-3 flex gap-2">
        {VIEWS.map((v) => (
          <Link key={v.key} href={`/stock/orders?view=${v.key}`} aria-current={v.key === view ? "true" : undefined} className={chip(v.key === view)}>
            {v.label}
          </Link>
        ))}
      </nav>
      {view === "today" && <Day day={day} today={today} />}
      {view === "pending" && <Pending all={sp.age === "all"} overdue={!!sp.overdue} everyLine={sp.lines === "all"} />}
      {view === "shortage" && <Shortages everyItem={sp.lines === "all"} />}
    </>
  );
}

const sum = (rows: OrderLine[], k: "value" | "openValue") => rows.reduce((s, r) => s + (r[k] ?? 0), 0);

async function Day({ day, today }: { day: string; today: string }) {
  const [orders, dispatch] = await Promise.all([ordersOn(day), dispatchOn(day)]);
  const label = day === today ? "Today’s" : `${day}:`;
  // V9 Today's Order: order no, customer code/name, order date, due date, item code/name, qty, rate, value, balance qty, balance value
  const orderCols: Column<OrderLine>[] = [
    { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
    { label: "Customer", cell: (r) => <Named name={r.cardName} code={r.cardCode} /> },
    { label: "Order", cell: (r) => String(r.docNum), wide: true },
    { label: "Order date", cell: (r) => r.docDate, wide: true },
    { label: "Due date", cell: (r) => r.dueDate ?? "—", wide: true },
    { label: "Qty", cell: (r) => formatQty(r.quantity, r.uom), align: "right" },
    { label: "Rate", cell: (r) => formatINR(r.price, { exact: true }), align: "right", wide: true },
    { label: "Balance qty", cell: (r) => formatQty(r.openQty, r.uom), align: "right", wide: true },
    { label: "Balance value", cell: (r) => formatINR(r.openValue), align: "right", wide: true, total: formatINR(sum(orders, "openValue")) },
    { label: "Order value", cell: (r) => formatINR(r.value), align: "right", total: formatINR(sum(orders, "value")) },
  ];
  // V9 Today's Dispatch: customer code/name, item code/name, sales UoM, qty, rate, basic sale
  const dispatchCols: Column<OrderLine>[] = [
    { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
    { label: "Customer", cell: (r) => <Named name={r.cardName} code={r.cardCode} /> },
    { label: "Delivery", cell: (r) => String(r.docNum), wide: true },
    { label: "UoM", cell: (r) => r.uom ?? "—", wide: true },
    { label: "Qty", cell: (r) => formatQty(r.quantity), align: "right" },
    { label: "Rate", cell: (r) => formatINR(r.price, { exact: true }), align: "right", wide: true },
    { label: "Basic sale", cell: (r) => formatINR(r.value), align: "right", total: formatINR(sum(dispatch, "value")) },
  ];
  return (
    <>
      <div className="mt-3"><AsOfDate value={day} max={today} /></div>
      <section className="mt-4" aria-labelledby="to">
        <h2 id="to" className="text-base font-semibold">{`${label} orders`}</h2>
        <p className="num text-sm text-muted">{new Set(orders.map((o) => o.docNum)).size} orders · {formatINR(sum(orders, "value"))}</p>
        <div className="mt-2"><DataList rows={orders} columns={orderCols} empty="No sales orders entered on this day." /></div>
      </section>
      <section className="mt-6" aria-labelledby="td">
        <h2 id="td" className="text-base font-semibold">{`${label} dispatch`}</h2>
        <p className="num text-sm text-muted">{new Set(dispatch.map((o) => o.docNum)).size} deliveries · {formatINR(sum(dispatch, "value"))}</p>
        <div className="mt-2"><DataList rows={dispatch} columns={dispatchCols} empty="Nothing dispatched on this day." /></div>
      </section>
    </>
  );
}

async function Pending({ all, overdue, everyLine }: { all: boolean; overdue: boolean; everyLine: boolean }) {
  const limit = everyLine ? 20000 : 500;
  const [ages, rows] = await Promise.all([
    pendingByAge(),
    pendingOrders({ maxAgeDays: all ? undefined : 180, overdueOnly: overdue, limit }),
  ]);
  const cut = rows.length === limit;
  const total = ages.reduce((s, a) => s + a.value, 0);
  const q = (o: Record<string, string>) => `/stock/orders?${new URLSearchParams({ view: "pending", ...o })}`;
  // V9 Pending Order: order no, customer code/name, due date, item code/name, qty, rate, value, balance qty, balance value (+ on hand)
  const cols: Column<OrderLine>[] = [
    { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
    { label: "Customer", cell: (r) => <Named name={r.cardName} code={r.cardCode} /> },
    { label: "Due", cell: (r) => <span className={r.overdue ? "font-medium text-bad" : ""}>{r.overdue ? "⚠ " : ""}{r.dueDate ?? "—"}</span> },
    { label: "Order", cell: (r) => String(r.docNum), wide: true },
    { label: "Qty", cell: (r) => formatQty(r.quantity, r.uom), align: "right", wide: true },
    { label: "Rate", cell: (r) => formatINR(r.price, { exact: true }), align: "right", wide: true },
    { label: "Value", cell: (r) => formatINR(r.value), align: "right", wide: true, total: formatINR(sum(rows, "value")) },
    { label: "Balance", cell: (r) => formatQty(r.openQty, r.uom), align: "right" },
    { label: "On hand", cell: (r) => <span>{formatQty(r.onHand, r.uom)}{r.canShip ? " ✓" : ""}</span>, align: "right", wide: true },
    { label: "Balance value", cell: (r) => formatINR(r.openValue), align: "right", total: formatINR(sum(rows, "openValue")) },
  ];
  return (
    <section className="mt-4" aria-label="Pending orders">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">Open sales orders (still to deliver)</p>
        <p className="num text-3xl font-semibold">{formatINR(total)}</p>
        <ul className="num mt-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
          {ages.map((a) => (
            <li key={a.age}><span className="block text-muted">{a.age} old</span>{formatINR(a.value)} · {a.orders} orders</li>
          ))}
        </ul>
        <p className="mt-3 text-[13px] text-warn">
          Orders older than 180 days are probably delivered or abandoned but not closed in SAP. They are hidden below unless you choose &ldquo;All&rdquo;.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={q(overdue ? { overdue: "1" } : {})} className={chip(!all)}>Last 180 days</Link>
        <Link href={q(overdue ? { age: "all", overdue: "1" } : { age: "all" })} className={chip(all)}>All</Link>
        <Link href={q({ ...(all ? { age: "all" } : {}), ...(overdue ? {} : { overdue: "1" }) })} className={chip(overdue)}>
          {overdue ? "✓ Overdue only" : "Overdue only"}
        </Link>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        {cut ? `First ${rows.length} lines` : `${rows.length} lines`}, earliest due first. ✓ = stock on hand covers the balance.
      </p>
      <div className="mt-2">
        <DataList rows={rows} columns={cols} empty="No pending lines." totalLabel={cut ? "Total (lines shown)" : "Total"}
                  showAll={cut ? { href: q({ ...(all ? { age: "all" } : {}), ...(overdue ? { overdue: "1" } : {}), lines: "all" }), label: "Show every line (slower)" } : undefined} />
      </div>
    </section>
  );
}

async function Shortages({ everyItem }: { everyItem: boolean }) {
  const limit = everyItem ? 20000 : 200;
  const rows = await shortages(limit);
  const cut = rows.length === limit;
  // V9 "Balance Quantity and Stock": item code/name, category, balance qty, on hand, shortage
  return (
    <section className="mt-4" aria-label="Shortages">
      <p className="text-sm text-muted">Items where open sales-order quantity is more than stock on hand (all warehouses, all open orders).</p>
      <div className="mt-3">
        <DataList<ItemShortage> rows={rows} empty="No shortages: stock covers every open order."
          showAll={cut ? { href: "/stock/orders?view=shortage&lines=all", label: "Show every item (large)" } : undefined}
          columns={[
          { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
          { label: "Category", cell: (r) => r.category ?? "—", wide: true },
          { label: "Orders", cell: (r) => String(r.orders), align: "right", wide: true },
          { label: "Balance qty", cell: (r) => formatQty(r.openQty), align: "right" },
          { label: "On hand", cell: (r) => formatQty(r.onHand), align: "right" },
          { label: "Shortage", cell: (r) => <span className="text-bad">{formatQty(r.shortage)}</span>, align: "right" },
        ]} />
      </div>
    </section>
  );
}
