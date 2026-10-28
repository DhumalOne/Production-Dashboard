import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackButton } from "@/components/back-button";
import { DataList, Named } from "@/components/data-list";
import { formatINR, formatQty } from "@/lib/format";
import { formatDay } from "@/lib/period";
import { DOC_TYPES, followOnDocuments, salesDocument, type DocLine, type DocType } from "@/lib/queries/document";

export const metadata = { title: "Document · Dhumal Dashboard" };

const NAME: Record<DocType, string> = {
  AR_INV: "Invoice", AR_CN: "Credit memo", DELIVERY: "Delivery", ORDER: "Sales order", QUOTE: "Quotation",
};
const href = (type: DocType, entry: number) => `/documents/${type}/${entry}`;

type Params = PageProps<"/documents/[type]/[entry]">["params"];

/** One sales document as in SAP: header, lines, and the chain quotation → order → delivery → invoice. */
export default function DocumentPage({ params }: PageProps<"/documents/[type]/[entry]">) {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body params={params} />
      </Suspense>
    </main>
  );
}

async function Body({ params }: { params: Params }) {
  const p = await params;
  const type = DOC_TYPES.find((t) => t === p.type);
  const entry = Number(p.entry);
  if (!type || !Number.isInteger(entry)) notFound();
  const doc = await salesDocument(type, entry);
  if (!doc) notFound();
  const { header: h, lines } = doc;

  // The documents this one came from, once each (an invoice usually has one delivery and one order).
  const sources = new Map<string, { type: DocType; entry: number; num: number; date: string | null }>();
  for (const l of lines) {
    if (l.orderEntry && l.orderNum) sources.set(`ORDER-${l.orderEntry}`, { type: "ORDER", entry: l.orderEntry, num: l.orderNum, date: l.orderDate });
    if (l.baseType && l.baseEntry && l.baseNum) sources.set(`${l.baseType}-${l.baseEntry}`, { type: l.baseType, entry: l.baseEntry, num: l.baseNum, date: l.baseDate });
  }
  const free = lines.filter((l) => !l.amount).length;
  const isOrder = type === "ORDER";

  return (
    <>
      <BackButton fallback="/sales" />
      <p className="text-sm text-muted">{NAME[type]}{h.isCancelled ? " · cancelled" : ""}</p>
      <h1 className="num text-xl font-semibold">{h.docNum}</h1>
      <p className="text-sm">
        <Link href={`/customers/${encodeURIComponent(h.cardCode)}`} className="text-accent">{h.cardName}</Link>
        <span className="text-muted"> · {formatDay(h.docDate)}{h.salesperson ? ` · ${h.salesperson}` : ""}</span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Before GST" value={formatINR(h.net, { exact: true })} />
        <Tile label="With GST" value={formatINR(h.gross, { exact: true })} />
        <Tile label={isOrder ? "Delivery due" : "Payment due"} value={h.dueDate ? formatDay(h.dueDate) : "—"} />
        <Tile label="Status" value={h.isCancelled ? "Cancelled" : h.isOpen ? (isOrder ? "Open" : type === "AR_INV" ? "Unpaid" : "Open") : (type === "AR_INV" ? "Paid" : "Closed")} />
      </div>

      {sources.size > 0 && (
        <section className="mt-4 rounded-xl border border-border bg-surface p-4" aria-labelledby="from">
          <h2 id="from" className="text-sm font-medium text-muted">Made from</h2>
          <ul className="mt-1 space-y-1">
            {[...sources.values()].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).map((s) => (
              <li key={`${s.type}-${s.entry}`}>
                <Link href={href(s.type, s.entry)} className="text-accent">{NAME[s.type]} <span className="num">{s.num}</span></Link>
                {s.date && <span className="text-sm text-muted"> · {formatDay(s.date)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <Suspense fallback={null}><FollowOn type={type} entry={entry} /></Suspense>

      <section className="mt-6" aria-labelledby="lines">
        <h2 id="lines" className="text-base font-semibold">What {type === "AR_CN" ? "was credited" : isOrder ? "was ordered" : "was sold"}</h2>
        <p className="text-sm text-muted">
          {lines.length} line{lines.length === 1 ? "" : "s"}
          {free > 0 ? ` · ${free} at ₹0 (parts included in a priced line)` : ""}
        </p>
        <div className="mt-3">
          <DataList<DocLine> rows={lines} empty="No lines synced for this document." columns={[
            { label: "Item", cell: (l) => <span className={l.amount ? "" : "text-muted"}><Named name={l.itemName} code={l.itemCode} /></span> },
            { label: "Qty", cell: (l) => formatQty(l.quantity, l.uom), align: "right" },
            ...(isOrder ? [{ label: "Still open", cell: (l: DocLine) => (l.openQty ? formatQty(l.openQty, l.uom) : "—"), align: "right" as const }] : []),
            { label: "Rate", cell: (l) => (l.price ? formatINR(l.price, { exact: true }) : "—"), align: "right", wide: true },
            { label: "Amount", cell: (l) => <span className={l.amount ? "" : "text-muted"}>{formatINR(l.amount, { exact: true })}</span>,
              align: "right", total: formatINR(h.net, { exact: true }) },
          ]} />
        </div>
        <p className="mt-2 text-[13px] text-muted">Amounts before GST, after any document discount.</p>
      </section>
    </>
  );
}

async function FollowOn({ type, entry }: { type: DocType; entry: number }) {
  const docs = await followOnDocuments(type, entry);
  if (docs.length === 0) return null;
  return (
    <section className="mt-3 rounded-xl border border-border bg-surface p-4" aria-labelledby="next">
      <h2 id="next" className="text-sm font-medium text-muted">{`Made from this ${NAME[type].toLowerCase()}`}</h2>
      <ul className="mt-1 space-y-1">
        {docs.map((d) => (
          <li key={`${d.docType}-${d.docEntry}`} className="flex justify-between gap-3">
            <span>
              <Link href={href(d.docType, d.docEntry)} className="text-accent">{NAME[d.docType]} <span className="num">{d.docNum}</span></Link>
              <span className="text-sm text-muted"> · {formatDay(d.docDate)}</span>
            </span>
            <span className="num text-sm">{formatINR(d.amount)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="num text-base font-semibold">{value}</p>
    </div>
  );
}
