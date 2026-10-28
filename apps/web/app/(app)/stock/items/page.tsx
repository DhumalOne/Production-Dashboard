import Link from "next/link";
import { Suspense } from "react";
import { DataList, Named } from "@/components/data-list";
import { formatINR, formatQty } from "@/lib/format";
import { stockDetail, type StockFilter, type StockItem } from "@/lib/queries/stock";
import { ShareBars } from "../share-bars";

export const metadata = { title: "Stock items · Dhumal Dashboard" };

const LIMIT = 100;

export default function StockItemsPage({ searchParams }: PageProps<"/stock/items">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/stock/items">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const category = one(sp.category);
  const warehouse = one(sp.warehouse);
  const filter: StockFilter | null = category ? { category } : warehouse ? { warehouse } : null;
  const back = <Link href="/stock" className="inline-flex h-11 items-center text-sm text-accent">‹ Inventory</Link>;
  if (!filter) return <>{back}<p className="text-sm text-muted">Pick a category or warehouse on the Inventory page.</p></>;

  const { title, items, split, total } = await stockDetail(filter);
  const byCategory = "category" in filter;
  const all = one(sp.all) === "1";
  const shown = all ? items : items.slice(0, LIMIT);
  return (
    <>
      {back}
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{byCategory ? "Item category" : "Warehouse"} · {items.length} items in stock</p>
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">Stock value</p>
        <p className="num text-3xl font-semibold">{formatINR(total)}</p>
        <p className="text-[13px] text-muted">At each warehouse&rsquo;s average cost.</p>
      </div>

      {split.length > 1 && (
        <section className="mt-6" aria-labelledby="split">
          <h2 id="split" className="text-base font-semibold">{byCategory ? "By warehouse" : "By item category"}</h2>
          <ShareBars rows={split} href={(r) => `/stock/items?${new URLSearchParams(byCategory ? { warehouse: r.key } : { category: r.key })}`} />
        </section>
      )}

      <section className="mt-6" aria-labelledby="items">
        <h2 id="items" className="text-base font-semibold">Items by value</h2>
        {!all && items.length > LIMIT && <p className="text-sm text-muted">Top {LIMIT} of {items.length}</p>}
        <div className="mt-3">
          <DataList<StockItem> rows={shown} empty="No stock on hand here."
            showAll={!all && items.length > LIMIT ? { href: `/stock/items?${new URLSearchParams({ ...filter, all: "1" })}`, label: `Show all ${items.length} items` } : undefined}
            columns={[
            { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
            { label: "Category", cell: (r) => r.category ?? "—", wide: true },
            { label: "On hand", cell: (r) => formatQty(r.onHand, r.uom), align: "right" },
            { label: "Avg cost", cell: (r) => (r.avgPrice == null ? "—" : formatINR(r.avgPrice, { exact: true })), align: "right", wide: true },
            { label: "Value", cell: (r) => formatINR(r.value), align: "right", total: formatINR(total) },
          ]} />
        </div>
      </section>
    </>
  );
}
