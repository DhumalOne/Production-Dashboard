import Link from "next/link";
import { AgingBar } from "@/components/aging-bar";
import { DataList } from "@/components/data-list";
import { formatINR } from "@/lib/format";
import { agingByParty, agingTotals, partyOpenItems, receivablesBySalesperson, type AgingRow, type OpenItem, type Side } from "@/lib/queries/aging";

const WORDS = {
  receivable: { title: "Receivables", total: "Total receivable", party: "Customer", base: "/money/receivables", advance: "customer advances" },
  payable: { title: "Payables", total: "Total payable", party: "Vendor", base: "/money/payables", advance: "advances paid to vendors" },
} as const;

export function AgingIntro({ side }: { side: Side }) {
  return (
    <p className="text-sm text-muted">
      Balances match SAP. Day buckets are <strong className="font-medium text-text">estimated</strong>: each{" "}
      {WORDS[side].party.toLowerCase()}&rsquo;s balance is matched to their most recent invoices.
    </p>
  );
}

export async function AgingTotals({ side }: { side: Side }) {
  const t = await agingTotals(side);
  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-4" aria-label={WORDS[side].total}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{WORDS[side].total}</p>
          <p className="num text-3xl font-semibold">{formatINR(t.balance)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted">Over 90 days</p>
          <p className="num text-xl font-semibold text-bad">{formatINR(t.over_90)}</p>
        </div>
      </div>
      <div className="mt-4"><AgingBar row={t} /></div>
      {t.advance < 0 && <p className="num mt-3 text-[13px] text-muted">Net of {WORDS[side].advance}: {formatINR(t.advance)}.</p>}
    </section>
  );
}

const LIMIT = 100;

export async function AgingList({ side, view, q, all }: { side: Side; view: "party" | "salesperson"; q?: string; all?: boolean }) {
  const w = WORDS[side];
  const [rows, totals] = await Promise.all([
    view === "salesperson" ? receivablesBySalesperson() : agingByParty(side, q, all || q ? 5000 : LIMIT),
    agingTotals(side),
  ]);
  const cut = view === "party" && !all && !q && rows.length === LIMIT;
  const bucket = (label: string, k: keyof AgingRow) => ({
    label, cell: (r: AgingRow) => formatINR(r[k] as number), align: "right" as const, wide: true,
    total: q ? undefined : formatINR(totals[k] as number),
  });
  return (
    <section className="mt-6" aria-label={`${w.title} by party`}>
      <div className="flex flex-wrap items-center gap-2">
        {side === "receivable" && (["party", "salesperson"] as const).map((v) => (
          <Link key={v} href={`${w.base}?view=${v}`} aria-current={v === view ? "true" : undefined}
                className={`flex h-11 items-center rounded-lg px-4 text-sm ${v === view ? "bg-accent-soft font-medium text-accent" : "bg-surface"}`}>
            {`By ${v === "party" ? "customer" : "salesperson"}`}
          </Link>
        ))}
        {view === "party" && (
          <form className="ml-auto w-full sm:w-72" role="search">
            <label htmlFor="q" className="sr-only">Search {w.party.toLowerCase()}</label>
            <input id="q" name="q" defaultValue={q} placeholder={`Search ${w.party.toLowerCase()} or code`} type="search"
                   className="h-11 w-full rounded-lg border border-border bg-surface px-3 outline-none focus:border-accent" />
          </form>
        )}
      </div>
      <div className="mt-3">
        <DataList<AgingRow>
          rows={rows}
          href={view === "party" ? (r) => `${side === "receivable" ? "/customers" : w.base}/${encodeURIComponent(r.key)}` : undefined}
          empty={q ? `No ${w.party.toLowerCase()} matches “${q}”.` : `No ${w.title.toLowerCase()}.`}
          totalLabel={cut ? `Total (all ${w.party.toLowerCase()}s)` : "Total"}
          showAll={cut ? { href: `${w.base}?all=1`, label: `Show all ${w.party.toLowerCase()}s (large page)` } : undefined}
          columns={[
            { label: view === "party" ? w.party : "Salesperson", cell: (r) => r.name },
            ...(view === "party" ? [{ label: "Code", cell: (r: AgingRow) => <span className="num">{r.key}</span>, wide: true }] : []),
            ...(side === "receivable" && view === "party" ? [{ label: "Salesperson", cell: (r: AgingRow) => r.salesperson ?? "—", wide: true }] : []),
            bucket("Not due", "not_due"),
            bucket("0–30", "d0_30"),
            bucket("31–60", "d31_60"),
            bucket("61–90", "d61_90"),
            bucket("91–120", "d91_120"),
            bucket("120+", "d120_plus"),
            { label: "90+", cell: (r) => formatINR(r.over_90), align: "right", phone: true },
            { label: "Balance", cell: (r) => formatINR(r.balance), align: "right", total: q ? undefined : formatINR(totals.balance) },
          ]}
        />
      </div>
    </section>
  );
}

const DOC_LABEL: Record<string, string> = {
  AR_INV: "Invoice", AP_INV: "A/P invoice", OLDER: "Older balance", ADVANCE: "Advance",
};

/** Open invoices of one party; `heading={false}` when the page already names the party (customer card). */
export async function OpenItems({ side, card, heading = true }: { side: Side; card: string; heading?: boolean }) {
  const { name, items } = await partyOpenItems(side, card);
  const total = items.reduce((s, i) => s + i.amount, 0);
  return (
    <>
      {heading && (
        <>
          <h1 className="text-xl font-semibold">{name}</h1>
          <p className="num text-sm text-muted">{card} · balance {formatINR(total, { exact: true })}</p>
        </>
      )}
      <div className={heading ? "mt-4" : "mt-3"}>
        <DataList<OpenItem> rows={items} empty="No open balance."
          href={side === "receivable" && items.some((i) => i.docType === "AR_INV" && i.docEntry)
            ? (i) => (i.docType === "AR_INV" && i.docEntry ? `/documents/AR_INV/${i.docEntry}` : `/customers/${encodeURIComponent(card)}`)
            : undefined}
          columns={[
          { label: "Document", cell: (i) => (i.docNum ? `${DOC_LABEL[i.docType] ?? i.docType} ${i.docNum}` : DOC_LABEL[i.docType] ?? i.docType) },
          { label: "Due", cell: (i) => i.dueDate ?? "—" },
          { label: "Days", cell: (i) => (i.daysOverdue == null ? "—" : i.daysOverdue <= 0 ? "Not due" : String(i.daysOverdue)) },
          { label: "Invoice date", cell: (i) => i.docDate ?? "—", wide: true },
          { label: "Open", cell: (i) => formatINR(i.amount, { exact: true }), align: "right" },
        ]} />
      </div>
      <p className="mt-3 text-[13px] text-muted">Open amounts are estimated from the balance, matched to the most recent invoices first.</p>
    </>
  );
}
