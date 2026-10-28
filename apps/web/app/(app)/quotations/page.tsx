import { connection } from "next/server";
import { Suspense } from "react";
import { DataList, Named } from "@/components/data-list";
import { PeriodPicker } from "@/components/period-picker";
import { formatINR, formatQty } from "@/lib/format";
import { readPeriod, todayIST } from "@/lib/period";
import { quotationCount, quotationsBy, type QuoteRow } from "@/lib/queries/quotations";

export const metadata = { title: "Quotations · Dhumal Dashboard" };

export default function QuotationsPage({ searchParams }: PageProps<"/quotations">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Quotations</h1>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/quotations">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const { key, asOf, today, period } = readPeriod(sp, todayIST(), "ytd");
  const [bySp, byItem, byCustomer, n] = await Promise.all([
    quotationsBy("salesperson", period), quotationsBy("item", period), quotationsBy("customer", period), quotationCount(),
  ]);
  const share = (r: QuoteRow) => `${(r.share * 100).toFixed(1)}%`;
  return (
    <>
      <p className="mt-1 rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm">
        Sales quotations are rarely entered in SAP: {n.count} in total{n.first ? ` (${n.first} to ${n.last})` : ""}. In 2016 the V9 workbook had
        about 2,500 quotation lines. If quotes are now made elsewhere (for example the DhumalOne quotation tool), this screen can read
        them from there once that is agreed.
      </p>
      <div className="mt-4"><PeriodPicker value={{ key, asOf }} today={today} range={period} /></div>
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">Quotation value, {period.label.toLowerCase()}</p>
        <p className="num text-3xl font-semibold">{formatINR(bySp.total)}</p>
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="qs">
          <h2 id="qs" className="mb-2 text-base font-semibold">By salesperson</h2>
          <DataList rows={bySp.rows} empty="No quotations in this period." columns={[
            { label: "Salesperson", cell: (r) => r.label },
            { label: "Contribution", cell: share, align: "right", total: "100%" },
            { label: "Amount", cell: (r) => formatINR(r.amount), align: "right", total: formatINR(bySp.total) },
          ]} />
        </section>
        <section aria-labelledby="qi">
          <h2 id="qi" className="mb-2 text-base font-semibold">By item</h2>
          <DataList rows={byItem.rows} empty="No quotations in this period." columns={[
            { label: "Item", cell: (r) => <Named name={r.label} code={r.key} /> },
            { label: "Qty", cell: (r) => formatQty(r.quantity), align: "right" },
            { label: "Contribution", cell: share, align: "right", wide: true, total: "100%" },
            { label: "Amount", cell: (r) => formatINR(r.amount), align: "right", total: formatINR(byItem.total) },
          ]} />
        </section>
        <section aria-labelledby="qc">
          <h2 id="qc" className="mb-2 text-base font-semibold">By customer</h2>
          <DataList rows={byCustomer.rows} empty="No quotations in this period." columns={[
            { label: "Customer", cell: (r) => <Named name={r.label} code={r.key} /> },
            { label: "Contribution", cell: share, align: "right", total: "100%" },
            { label: "Amount", cell: (r) => formatINR(r.amount), align: "right", total: formatINR(byCustomer.total) },
          ]} />
        </section>
      </div>
    </>
  );
}
