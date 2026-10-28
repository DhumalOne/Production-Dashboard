import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AgingBar } from "@/components/aging-bar";
import { OpenItems } from "@/components/aging-screens";
import { DataList, Named } from "@/components/data-list";
import { Change } from "@/components/kpi";
import { TrendChart } from "@/components/trend-chart";
import { formatINR, formatQty } from "@/lib/format";
import { previousYear, resolvePeriod, todayIST } from "@/lib/period";
import {
  customerItems, customerPendingOrders, customerReceipts, customerSummary, customerTrend,
  type BoughtItem, type PendingLine, type Receipt,
} from "@/lib/queries/customer";

export const metadata = { title: "Customer · Dhumal Dashboard" };

type Params = PageProps<"/customers/[card]">["params"];

const code = async (params: Params) => decodeURIComponent((await params).card);
const Skeleton = ({ h = "h-48" }: { h?: string }) => <div className={`mt-4 ${h} animate-pulse rounded-xl bg-surface`} />;

/** One page per customer, for before a call: what they buy, what they owe, how they pay, what is pending. */
export default function CustomerCardPage({ params }: PageProps<"/customers/[card]">) {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/money/receivables" className="inline-flex h-11 items-center text-sm text-accent">‹ Receivables</Link>
      <Suspense fallback={<Skeleton h="h-72" />}><Summary params={params} /></Suspense>
      <Suspense fallback={<Skeleton />}><Trend params={params} /></Suspense>
      <Suspense fallback={<Skeleton />}><Items params={params} /></Suspense>
      <section className="mt-6" aria-labelledby="open">
        <h2 id="open" className="text-base font-semibold">Open invoices</h2>
        <Suspense fallback={<Skeleton />}><Open params={params} /></Suspense>
      </section>
      <Suspense fallback={<Skeleton />}><Pending params={params} /></Suspense>
      <Suspense fallback={<Skeleton />}><Receipts params={params} /></Suspense>
    </main>
  );
}

async function Summary({ params }: { params: Params }) {
  const card = await code(params);
  await connection();
  const fy = resolvePeriod("ytd", todayIST());
  const s = await customerSummary(card, fy, previousYear(fy));
  const name = s.info?.name ?? s.aging?.name ?? card;
  const balance = s.aging?.balance ?? 0;
  const facts = [s.info?.city, s.info?.salesperson ?? s.aging?.salesperson].filter(Boolean);
  return (
    <>
      <h1 className="text-xl font-semibold">{name}</h1>
      <p className="num text-sm text-muted">
        {card}{facts.length ? ` · ${facts.join(" · ")}` : ""}
        {s.info?.phone && <> · <a href={`tel:${s.info.phone.replace(/[^\d+]/g, "")}`} className="text-accent">{s.info.phone}</a></>}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`Sale ${fy.label.replace(" to date", "")}`}>
          <p className="num text-lg font-semibold">{formatINR(s.sale)}</p>
          <Change current={s.sale} previous={s.salePY} />
        </Tile>
        <Tile label="Owes us">
          <p className={`num text-lg font-semibold ${balance > 0 && s.aging?.over_90 ? "text-bad" : ""}`}>{formatINR(balance)}</p>
          <p className="num text-[13px] text-muted">
            {s.aging?.over_90 ? `${formatINR(s.aging.over_90)} over 90 days` : balance < 0 ? "Advance with us" : "Nothing over 90 days"}
          </p>
        </Tile>
        <Tile label="Pays in">
          <p className="num text-lg font-semibold">{s.daysToPay == null ? "—" : `${s.daysToPay} days`}</p>
          <p className="text-[13px] text-muted">
            {s.daysLate == null ? "No receipts in 12 months"
              : s.daysLate > 0 ? `${s.daysLate} days after due date` : "On time or early"}
          </p>
        </Tile>
        <Tile label="Pending orders">
          <p className="num text-lg font-semibold">{formatINR(s.pendingOrders)}</p>
          <p className="num text-[13px] text-muted">{s.pendingOrderCount} order{s.pendingOrderCount === 1 ? "" : "s"}</p>
        </Tile>
      </div>

      {s.aging && balance > 0 && <div className="mt-3 rounded-xl border border-border bg-surface p-4"><AgingBar row={s.aging} /></div>}
      <p className="mt-2 text-[13px] text-muted">
        {s.info?.creditLimit ? `Credit limit ${formatINR(s.info.creditLimit)}. ` : ""}
        {s.lastInvoice ? `Last invoice ${s.lastInvoice}. ` : "No invoice on record since April 2025. "}
        &ldquo;Pays in&rdquo; is the average over the last 12 months, weighted by amount.
      </p>
      <Link href={`/sales/documents?${new URLSearchParams({ by: "customer", key: card, name, p: "ytd" })}`}
            className="mt-1 inline-flex h-11 items-center text-sm text-accent">All invoices this year ›</Link>
    </>
  );
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[12px] text-muted">{label}</p>
      {children}
    </div>
  );
}

async function Trend({ params }: { params: Params }) {
  const card = await code(params);
  await connection();
  const t = await customerTrend(card, todayIST());
  return <section className="mt-4"><TrendChart months={t.months} values={t.values} label="Sale, last 12 months" /></section>;
}

async function Items({ params }: { params: Params }) {
  const card = await code(params);
  await connection();
  const fy = resolvePeriod("ytd", todayIST());
  const rows = await customerItems(card, fy);
  return (
    <section className="mt-6" aria-labelledby="items">
      <h2 id="items" className="text-base font-semibold">What they buy ({fy.label})</h2>
      <div className="mt-3">
        <DataList<BoughtItem> rows={rows} empty="Nothing bought this financial year." columns={[
          { label: "Item", cell: (r) => <Named name={r.itemName} code={r.itemCode} /> },
          { label: "Qty", cell: (r) => formatQty(r.quantity, r.uom), align: "right" },
          { label: "Sale", cell: (r) => formatINR(r.amount), align: "right" },
        ]} />
      </div>
    </section>
  );
}

async function Open({ params }: { params: Params }) {
  return <OpenItems side="receivable" card={await code(params)} heading={false} />;
}

async function Pending({ params }: { params: Params }) {
  const rows = await customerPendingOrders(await code(params));
  return (
    <section className="mt-6" aria-labelledby="pending">
      <h2 id="pending" className="text-base font-semibold">Pending orders</h2>
      <div className="mt-3">
        <DataList<PendingLine> rows={rows} empty="No pending orders." columns={[
          { label: "Item", cell: (r) => r.itemName },
          { label: "Order", cell: (r) => <span className="num">{r.docNum}</span>, wide: true },
          { label: "Due", cell: (r) => <span className={r.overdue ? "text-bad" : ""}>{r.dueDate ?? "—"}</span> },
          { label: "Open qty", cell: (r) => formatQty(r.openQty, r.uom), align: "right", wide: true },
          { label: "Open value", cell: (r) => formatINR(r.openValue), align: "right" },
        ]} />
      </div>
    </section>
  );
}

async function Receipts({ params }: { params: Params }) {
  const rows = await customerReceipts(await code(params));
  return (
    <section className="mt-6 mb-6" aria-labelledby="receipts">
      <h2 id="receipts" className="text-base font-semibold">Recent receipts</h2>
      <div className="mt-3">
        <DataList<Receipt> rows={rows} empty="No receipts on record." columns={[
          { label: "Date", cell: (r) => r.docDate },
          { label: "Receipt", cell: (r) => <span className="num">{r.docNum}</span> },
          { label: "Amount", cell: (r) => formatINR(r.amount, { exact: true }), align: "right" },
        ]} />
      </div>
    </section>
  );
}
