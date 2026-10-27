import "server-only";
import { dbWeb } from "../db";
import type { DateRange } from "../period";
import { COMPANY } from "./home";

export interface QuoteRow { key: string; label: string; amount: number; quantity: number | null; share: number }

/** V9 Quotation Dashboard: quotation value by salesperson, item (with quantity) or customer, with contribution %. */
export async function quotationsBy(dim: "salesperson" | "item" | "customer", range: DateRange): Promise<{ rows: QuoteRow[]; total: number }> {
  const sql = dbWeb();
  const keyCol = { salesperson: sql`coalesce(slp_code::text, '-1')`, item: sql`item_code`, customer: sql`card_code` }[dim];
  const label = { salesperson: sql`coalesce(max(salesperson), 'No salesperson')`, item: sql`max(item_name)`, customer: sql`max(card_name)` }[dim];
  const rows = await sql<{ key: string; label: string; amount: number; quantity: number | null }[]>`
    select ${keyCol} as key, ${label} as label, sum(net_amount) as amount,
           ${dim === "item" ? sql`sum(quantity)` : sql`null::numeric`} as quantity
    from rpt.v_quotation_lines
    where company = ${COMPANY} and doc_date between ${range.from} and ${range.to}
    group by 1 order by amount desc`;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { total, rows: rows.map((r) => ({ ...r, label: r.label || r.key, share: total ? r.amount / total : 0 })) };
}

export async function quotationCount(): Promise<{ count: number; first: string | null; last: string | null }> {
  const sql = dbWeb();
  const [r] = await sql<{ count: number; first: string | null; last: string | null }[]>`
    select count(distinct doc_entry)::int as count, to_char(min(doc_date), 'YYYY-MM-DD') as first,
           to_char(max(doc_date), 'YYYY-MM-DD') as last
    from rpt.v_quotation_lines where company = ${COMPANY}`;
  return r;
}
