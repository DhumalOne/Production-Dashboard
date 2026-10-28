import "server-only";
import { dbWeb } from "../db";
import type { DateRange } from "../period";
import { COMPANY } from "./home";

export type SalesDimension = "salesperson" | "customer" | "item" | "group";

export interface SalesRow {
  key: string;
  label: string;
  amount: number;
  amountPY: number;
  quantity: number | null;
  share: number; // of the period total, 0..1
  margin: number | null;
}

/** Sale for a period grouped by salesperson / customer / item / item group, with last year alongside. */
export async function salesBy(dim: SalesDimension, range: DateRange, py: DateRange, limit = 50): Promise<{ rows: SalesRow[]; total: number; totalPY: number }> {
  const sql = await dbWeb();
  const keyCol = { salesperson: sql`coalesce(slp_code::text, '-1')`, customer: sql`card_code`, item: sql`item_code`, group: sql`coalesce(item_group::text, '-')` }[dim];
  const labelCol = { salesperson: sql`coalesce(max(salesperson), 'No salesperson')`, customer: sql`max(card_name)`, item: sql`max(item_name)`, group: sql`coalesce(max(item_group_name), 'No group')` }[dim];
  const qty = dim === "item" ? sql`sum(quantity) filter (where doc_date between ${range.from} and ${range.to})` : sql`null::numeric`;
  const inPeriod = sql`doc_date between ${range.from} and ${range.to}`;
  const inEither = sql`(${inPeriod} or doc_date between ${py.from} and ${py.to})`;

  // Salesperson and customer come from the document header (document totals, as SAP's Sales Analysis and the
  // headline figure); item and group only exist on lines. Margin is always summed from lines.
  const header = dim === "salesperson" || dim === "customer";
  const rows = await sql<{ key: string; label: string; amount: number; amount_py: number; quantity: number | null; margin: number | null }[]>`
    ${header ? sql`
    with m as (
      select doc_type, doc_entry, sum(gross_margin) as gm from rpt.v_sales_lines
      where company = ${COMPANY} and not is_intercompany and ${inPeriod}
      group by 1, 2)
    select ${keyCol} as key, ${labelCol} as label,
           coalesce(sum(net_amount) filter (where ${inPeriod}), 0) as amount,
           coalesce(sum(net_amount) filter (where doc_date between ${py.from} and ${py.to}), 0) as amount_py,
           null::numeric as quantity, sum(m.gm) as margin
    from rpt.v_sales_docs d
    left join m on m.doc_type = d.doc_type and m.doc_entry = d.doc_entry` : sql`
    select ${keyCol} as key, ${labelCol} as label,
           coalesce(sum(net_amount) filter (where ${inPeriod}), 0) as amount,
           coalesce(sum(net_amount) filter (where doc_date between ${py.from} and ${py.to}), 0) as amount_py,
           ${qty} as quantity,
           sum(gross_margin) filter (where ${inPeriod}) as margin
    from rpt.v_sales_lines`}
    where company = ${COMPANY} and not is_intercompany and ${inEither}
    group by 1
    order by amount desc
    limit ${limit}`;

  const [totals] = await sql<{ total: number; total_py: number }[]>`
    select coalesce(sum(net_amount) filter (where doc_date between ${range.from} and ${range.to}), 0) as total,
           coalesce(sum(net_amount) filter (where doc_date between ${py.from} and ${py.to}), 0) as total_py
    from rpt.v_sales_docs
    where company = ${COMPANY} and not is_intercompany
      and (doc_date between ${range.from} and ${range.to} or doc_date between ${py.from} and ${py.to})`;

  return {
    total: totals.total,
    totalPY: totals.total_py,
    rows: rows.map((r) => ({
      key: r.key, label: r.label || r.key, amount: r.amount, amountPY: r.amount_py, quantity: r.quantity,
      margin: r.margin, share: totals.total ? r.amount / totals.total : 0,
    })),
  };
}

/** Monthly sale for the last 12 months, overall and for the top salespeople. */
export async function salesTrend(today: string, top = 5): Promise<{ months: string[]; series: { label: string; values: number[] }[] }> {
  const sql = await dbWeb();
  const [y, m] = today.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 12 + i, 1)).toISOString().slice(0, 7));
  const rows = await sql<{ salesperson: string; month: string; amount: number }[]>`
    select coalesce(salesperson, 'No salesperson') as salesperson, to_char(doc_date, 'YYYY-MM') as month, sum(net_amount) as amount
    from rpt.v_sales_docs
    where company = ${COMPANY} and not is_intercompany and doc_date >= ${months[0] + "-01"} and doc_date <= ${today}
    group by 1, 2`;
  const bySp = new Map<string, number>();
  rows.forEach((r) => bySp.set(r.salesperson, (bySp.get(r.salesperson) ?? 0) + r.amount));
  const leaders = [...bySp.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k]) => k);
  const total = months.map((mo) => rows.filter((r) => r.month === mo).reduce((s, r) => s + r.amount, 0));
  return {
    months,
    series: [
      { label: "All", values: total },
      ...leaders.map((sp) => ({ label: sp, values: months.map((mo) => rows.find((r) => r.salesperson === sp && r.month === mo)?.amount ?? 0) })),
    ],
  };
}

/** V9 Sales Trend (left table): every salesperson's sale for each of the last 6 months. */
export async function salespersonMonths(asOf: string): Promise<{ months: string[]; rows: { key: string; label: string; values: number[] }[]; totals: number[] }> {
  const sql = await dbWeb();
  const [y, m] = asOf.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7));
  const rows = await sql<{ key: string; label: string; month: string; amount: number }[]>`
    select coalesce(slp_code::text, '-1') as key, coalesce(max(salesperson), 'No salesperson') as label,
           to_char(doc_date, 'YYYY-MM') as month, sum(net_amount) as amount
    from rpt.v_sales_docs
    where company = ${COMPANY} and not is_intercompany and doc_date between ${months[0] + "-01"} and ${asOf}
    group by 1, 3`;
  const people = new Map<string, { label: string; values: number[] }>();
  for (const r of rows) {
    const p = people.get(r.key) ?? { label: r.label, values: months.map(() => 0) };
    p.values[months.indexOf(r.month)] = r.amount;
    people.set(r.key, p);
  }
  const list = [...people.entries()].map(([key, p]) => ({ key, ...p }))
    .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
  return { months, rows: list, totals: months.map((_, i) => list.reduce((s, p) => s + p.values[i], 0)) };
}

export interface ItemMonth { amount: number; price: number | null; discountPct: number | null }
export interface ItemTrend { itemCode: string; itemName: string; total: number; months: ItemMonth[] }

/** V9 Sales Trend: top items month by month with price after discount and total discount % (last 6 months). */
export async function itemTrends(today: string, top = 50): Promise<{ months: string[]; items: ItemTrend[] }> {
  const sql = await dbWeb();
  const [y, m] = today.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, i) => new Date(Date.UTC(y, m - 6 + i, 1)).toISOString().slice(0, 7));
  const rows = await sql<{ item_code: string; item_name: string; month: string; amount: number; qty: number; list: number | null }[]>`
    with top as (
      select item_code from rpt.v_sales_lines
      where company = ${COMPANY} and not is_intercompany and doc_date between ${months[0] + "-01"} and ${today}
      group by item_code order by sum(net_amount) desc limit ${top}
    )
    select l.item_code, max(l.item_name) as item_name, to_char(l.doc_date, 'YYYY-MM') as month,
           sum(l.net_amount) as amount, sum(l.quantity) as qty, sum(l.list_amount) as list
    from rpt.v_sales_lines l join top using (item_code)
    where l.company = ${COMPANY} and not l.is_intercompany and l.doc_date between ${months[0] + "-01"} and ${today}
    group by 1, 3`;
  const byItem = new Map<string, ItemTrend>();
  for (const r of rows) {
    const t = byItem.get(r.item_code) ?? { itemCode: r.item_code, itemName: r.item_name, total: 0, months: months.map(() => ({ amount: 0, price: null, discountPct: null })) };
    const i = months.indexOf(r.month);
    t.months[i] = {
      amount: r.amount,
      price: r.qty ? r.amount / r.qty : null,
      discountPct: r.list ? Math.max(0, 1 - r.amount / r.list) * 100 : null,
    };
    t.total += r.amount;
    byItem.set(r.item_code, t);
  }
  return { months, items: [...byItem.values()].sort((a, b) => b.total - a.total) };
}

export interface SalesDoc {
  docType: string;
  docEntry: number;
  docNum: number;
  docDate: string;
  cardName: string;
  salesperson: string | null;
  amount: number;
}

/** Documents behind a number: every row taps through to the SAP document number (PRD §4.10). */
export async function salesDocuments(range: DateRange, filter: { dim?: SalesDimension; key?: string }, limit = 200): Promise<SalesDoc[]> {
  const sql = await dbWeb();
  const cond =
    filter.dim === "salesperson" && filter.key ? sql`and coalesce(slp_code::text, '-1') = ${filter.key}` :
    filter.dim === "customer" && filter.key ? sql`and card_code = ${filter.key}` :
    filter.dim === "item" && filter.key ? sql`and (company, doc_type, doc_entry) in (
        select company, doc_type, doc_entry from rpt.v_sales_lines where company = ${COMPANY} and item_code = ${filter.key})` :
    sql``;
  return sql<SalesDoc[]>`
    select doc_type as "docType", doc_entry as "docEntry", doc_num as "docNum", to_char(doc_date, 'YYYY-MM-DD') as "docDate",
           card_name as "cardName", salesperson, net_amount as amount
    from rpt.v_sales_docs
    where company = ${COMPANY} and not is_intercompany and doc_date between ${range.from} and ${range.to} ${cond}
    order by doc_date desc, doc_num desc
    limit ${limit}`;
}
