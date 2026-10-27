import { Suspense } from "react";
import { DataList, Named } from "@/components/data-list";
import { STOCK_TABS, SubNav } from "@/components/sub-nav";
import { formatINR, formatQty } from "@/lib/format";
import { belowMinimum, slowMoving, stockByCategory, stockByWarehouse, topStockItems, type BelowMin, type GroupValue, type SlowItem, type StockItem } from "@/lib/queries/stock";

export const metadata = { title: "Inventory · Dhumal Dashboard" };

const Skeleton = ({ h = "h-64" }: { h?: string }) => <div className={`mt-4 ${h} animate-pulse rounded-xl bg-surface`} />;

export default function InventoryPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Stock</h1>
      <SubNav items={STOCK_TABS} current="/stock" />
      <Suspense fallback={<Skeleton />}><Categories /></Suspense>
      <Suspense fallback={<Skeleton />}><Warehouses /></Suspense>
      <Suspense fallback={<Skeleton h="h-96" />}><TopItems /></Suspense>
      <Suspense fallback={<Skeleton />}><BelowMinimum /></Suspense>
      <Suspense fallback={<Skeleton />}><Slow /></Suspense>
    </main>
  );
}

function ShareBars({ rows }: { rows: GroupValue[] }) {
  return (
    <ul className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-4">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.name}</span>
            <span className="num shrink-0 font-medium">{formatINR(r.value)} <span className="text-muted">{(r.share * 100).toFixed(1)}%</span></span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-2">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.max(r.share * 100, 0.5)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function Categories() {
  const { rows, total } = await stockByCategory();
  return (
    <section className="mt-4" aria-labelledby="cat">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">Stock value, all warehouses</p>
        <p className="num text-3xl font-semibold">{formatINR(total)}</p>
        <p className="text-[13px] text-muted">At each warehouse&rsquo;s average cost.</p>
      </div>
      <h2 id="cat" className="mt-6 text-base font-semibold">By item category</h2>
      <ShareBars rows={rows} />
    </section>
  );
}

async function Warehouses() {
  const rows = await stockByWarehouse(15);
  return (
    <section className="mt-6" aria-labelledby="whs">
      <h2 id="whs" className="text-base font-semibold">Top warehouses</h2>
      <ShareBars rows={rows} />
    </section>
  );
}

async function TopItems() {
  const rows = await topStockItems(50);
  return (
    <section className="mt-6" aria-labelledby="top">
      <h2 id="top" className="text-base font-semibold">Top 50 items by value</h2>
      <div className="mt-3">
        <DataList<StockItem> rows={rows} columns={[
          { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
          { label: "Category", cell: (r) => r.category ?? "—", wide: true },
          { label: "On hand", cell: (r) => formatQty(r.onHand, r.uom), align: "right" },
          { label: "Avg cost", cell: (r) => formatINR(r.avgPrice, { exact: true }), align: "right", wide: true },
          { label: "Value", cell: (r) => formatINR(r.value), align: "right" },
        ]} />
      </div>
    </section>
  );
}

async function BelowMinimum() {
  const rows = await belowMinimum();
  const withOrders = rows.filter((r) => r.pendingQty).length;
  return (
    <section className="mt-6" aria-labelledby="min">
      <h2 id="min" className="text-base font-semibold">At or below minimum stock</h2>
      <p className="text-sm text-muted">{rows.length} items · {withOrders} also have pending sales orders (listed first)</p>
      <div className="mt-3">
        <DataList<BelowMin> rows={rows} empty="No item is below its minimum level." columns={[
          { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
          { label: "Min", cell: (r) => formatQty(r.minLevel, r.uom), align: "right", wide: true },
          { label: "Pending orders", cell: (r) => (r.pendingQty ? formatQty(r.pendingQty, r.uom) : "—"), align: "right" },
          { label: "On hand", cell: (r) => formatQty(r.onHand, r.uom), align: "right" },
          { label: "Short by", cell: (r) => <span className="text-bad">{formatQty(r.shortfall, r.uom)}</span>, align: "right" },
        ]} />
      </div>
    </section>
  );
}

async function Slow() {
  const { rows, value90, value180 } = await slowMoving(90, 50);
  return (
    <section className="mt-6" aria-labelledby="slow">
      <h2 id="slow" className="text-base font-semibold">Slow and non-moving stock</h2>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-[12px] text-muted">No movement 90+ days</p>
          <p className="num text-lg font-semibold">{formatINR(value90)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="text-[12px] text-muted">No movement 180+ days</p>
          <p className="num text-lg font-semibold">{formatINR(value180)}</p>
        </div>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        Movement means a sale, delivery or purchase. Items used only in production may show here until production data is connected.
      </p>
      <div className="mt-3">
        <DataList<SlowItem> rows={rows} columns={[
          { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
          { label: "Last moved", cell: (r) => r.lastMovement ?? "Not since Apr 2025" },
          { label: "On hand", cell: (r) => formatQty(r.onHand, r.uom), align: "right", wide: true },
          { label: "Value", cell: (r) => formatINR(r.value), align: "right" },
        ]} />
      </div>
    </section>
  );
}
