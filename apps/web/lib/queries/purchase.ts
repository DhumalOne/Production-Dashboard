import "server-only";
import { dbWeb } from "../db";
import type { DateRange } from "../period";
import { COMPANY } from "./home";

export type PurchaseDimension = "buyer" | "vendor" | "item";

export interface PurchaseRow {
  key: string;
  label: string;
  amount: number;
  amountPY: number;
  quantity: number | null;
  price: number | null; // price after discount (items)
  share: number;
}

export async function purchaseBy(dim: PurchaseDimension, range: DateRange, py: DateRange, limit = 100) {
  const sql = dbWeb();
  const keyCol = { buyer: sql`coalesce(buyer_code::text, '-1')`, vendor: sql`vendor_code`, item: sql`item_code` }[dim];
  const label = { buyer: sql`coalesce(max(buyer), 'No buyer')`, vendor: sql`max(vendor_name)`, item: sql`max(item_name)` }[dim];
  const inPeriod = sql`doc_date between ${range.from} and ${range.to}`;
  const rows = await sql<{ key: string; label: string; amount: number; amount_py: number; quantity: number | null }[]>`
    select ${keyCol} as key, ${label} as label,
           coalesce(sum(net_amount) filter (where ${inPeriod}), 0) as amount,
           coalesce(sum(net_amount) filter (where doc_date between ${py.from} and ${py.to}), 0) as amount_py,
           ${dim === "item" ? sql`sum(quantity) filter (where ${inPeriod})` : sql`null::numeric`} as quantity
    from rpt.v_purchase_lines
    where company = ${COMPANY} and (${inPeriod} or doc_date between ${py.from} and ${py.to})
    group by 1 order by amount desc limit ${limit}`;
  const [t] = await sql<{ total: number; total_py: number }[]>`
    select coalesce(sum(net_amount) filter (where doc_date between ${range.from} and ${range.to}), 0) as total,
           coalesce(sum(net_amount) filter (where doc_date between ${py.from} and ${py.to}), 0) as total_py
    from rpt.v_purchase_docs
    where company = ${COMPANY} and (doc_date between ${range.from} and ${range.to} or doc_date between ${py.from} and ${py.to})`;
  return {
    total: t.total,
    totalPY: t.total_py,
    rows: rows.map<PurchaseRow>((r) => ({
      key: r.key, label: r.label || r.key, amount: r.amount, amountPY: r.amount_py, quantity: r.quantity,
      price: r.quantity ? r.amount / r.quantity : null, share: t.total ? r.amount / t.total : 0,
    })),
  };
}

export interface MonthSeries { key: string; label: string; values: number[]; prices?: (number | null)[] }

/** V9 Purchase Trend: buyers, top 5 vendors and top 10 items month by month (last 6 months). */
export async function purchaseTrend(today: string): Promise<{ months: string[]; buyers: MonthSeries[]; vendors: MonthSeries[]; items: MonthSeries[] }> {
  const sql = dbWeb();
  const months = lastMonths(today, 6);
  const from = months[0] + "-01";
  const rows = await sql<{ dim: string; key: string; label: string; month: string; amount: number; qty: number }[]>`
    with l as (
      select * from rpt.v_purchase_lines where company = ${COMPANY} and doc_date between ${from} and ${today}
    )
    select 'buyer' as dim, coalesce(buyer_code::text, '-1') as key, coalesce(max(buyer), 'No buyer') as label,
           to_char(doc_date, 'YYYY-MM') as month, sum(net_amount) as amount, 0 as qty from l group by 2, 4
    union all
    select 'vendor', vendor_code, max(vendor_name), to_char(doc_date, 'YYYY-MM'), sum(net_amount), 0 from l group by 2, 4
    union all
    select 'item', item_code, max(item_name), to_char(doc_date, 'YYYY-MM'), sum(net_amount), sum(quantity) from l group by 2, 4`;
  const build = (dim: string, top: number, withPrice = false): MonthSeries[] => {
    const totals = new Map<string, { label: string; total: number }>();
    rows.filter((r) => r.dim === dim).forEach((r) => {
      const t = totals.get(r.key) ?? { label: r.label, total: 0 };
      t.total += r.amount;
      totals.set(r.key, t);
    });
    return [...totals.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, top).map(([key, t]) => {
      const cell = (m: string) => rows.find((r) => r.dim === dim && r.key === key && r.month === m);
      return {
        key, label: t.label,
        values: months.map((m) => cell(m)?.amount ?? 0),
        ...(withPrice ? { prices: months.map((m) => { const c = cell(m); return c && c.qty ? c.amount / c.qty : null; }) } : {}),
      };
    });
  };
  return { months, buyers: build("buyer", 8), vendors: build("vendor", 5), items: build("item", 10, true) };
}

export interface OpenPO { docNum: number; docDate: string; dueDate: string | null; vendor: string; lines: number; openValue: number; overdue: boolean }

export async function openPurchaseOrders(limit = 100): Promise<{ rows: OpenPO[]; total: number; overdueValue: number }> {
  const sql = dbWeb();
  const rows = await sql<OpenPO[]>`
    select doc_num as "docNum", to_char(min(doc_date), 'YYYY-MM-DD') as "docDate", to_char(min(due_date), 'YYYY-MM-DD') as "dueDate",
           max(vendor_name) as vendor, count(*)::int as lines, sum(open_value) as "openValue",
           min(due_date) < rpt.today() as overdue
    from rpt.v_po_lines where company = ${COMPANY} and is_pending
    group by doc_num order by min(due_date) nulls last limit ${limit}`;
  const [t] = await sql<{ total: number; overdue: number }[]>`
    select coalesce(sum(open_value), 0) as total, coalesce(sum(open_value) filter (where due_date < rpt.today()), 0) as overdue
    from rpt.v_po_lines where company = ${COMPANY} and is_pending`;
  return { rows, total: t.total, overdueValue: t.overdue };
}

export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - n + i, 1)).toISOString().slice(0, 7));
}
