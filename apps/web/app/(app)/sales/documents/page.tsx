import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataList } from "@/components/data-list";
import { formatINR } from "@/lib/format";
import { readPeriod, todayIST } from "@/lib/period";
import { salesDocuments, type SalesDimension, type SalesDoc } from "@/lib/queries/sales";

export const metadata = { title: "Sales documents · Dhumal Dashboard" };

const LABEL: Record<string, string> = { AR_INV: "Invoice", AR_CN: "Credit memo" };

export default function SalesDocumentsPage({ searchParams }: PageProps<"/sales/documents">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/sales/documents">["searchParams"] }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const by = one(sp.by) as SalesDimension | undefined;
  const key = one(sp.key);
  await connection();
  const { period, params } = readPeriod(sp, todayIST());
  const docs = await salesDocuments(period, { dim: by, key });
  return (
    <>
      <Link href={`/sales?${new URLSearchParams({ by: by ?? "salesperson", ...params })}`}
            className="inline-flex h-11 items-center text-sm text-accent">‹ Sales</Link>
      <h1 className="text-xl font-semibold">{one(sp.name) ?? "Documents"}</h1>
      <p className="text-sm text-muted">{period.label} · {docs.length}{docs.length === 200 ? "+" : ""} documents · SAP document numbers</p>
      <div className="mt-4">
        <DataList<SalesDoc> rows={docs} columns={[
          { label: "Document", cell: (d) => `${LABEL[d.docType] ?? d.docType} ${d.docNum}` },
          { label: "Date", cell: (d) => d.docDate },
          { label: "Customer", cell: (d) => d.cardName, wide: true },
          { label: "Salesperson", cell: (d) => d.salesperson ?? "—", wide: true },
          { label: "Amount", cell: (d) => formatINR(d.amount, { exact: true }), align: "right" },
        ]} />
      </div>
    </>
  );
}
