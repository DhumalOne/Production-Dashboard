import "server-only";
import { dbWeb } from "../db";
import type { DateRange } from "../period";
import type { AgingRow } from "./aging";
import { COMPANY } from "./home";

export interface CustomerInfo {
  code: string;
  name: string;
  city: string | null;
  phone: string | null;
  creditLimit: number | null;
  salesperson: string | null;
  isActive: boolean | null;
}

export interface CustomerSummary {
  info: CustomerInfo | null;
  sale: number;
  salePY: number;
  pendingOrders: number;
  pendingOrderCount: number;
  daysToPay: number | null;
  daysLate: number | null;
  aging: AgingRow | null;
  lastInvoice: string | null;
}

/** Everything on the top of the customer card: who they are, what they buy, what they owe, how they pay. */
export async function customerSummary(code: string, fy: DateRange, fyPY: DateRange): Promise<CustomerSummary> {
  const sql = dbWeb();
  const [[info], [s], [o], [p], [aging]] = await Promise.all([
    sql<CustomerInfo[]>`
      select card_code as code, coalesce(card_name, card_code) as name, city, phone, credit_limit as "creditLimit",
             salesperson, is_active as "isActive"
      from rpt.v_customers where company = ${COMPANY} and card_code = ${code}`,
    sql<{ sale: number; sale_py: number; last_invoice: string | null }[]>`
      select coalesce(sum(net_amount) filter (where doc_date between ${fy.from} and ${fy.to}), 0) as sale,
             coalesce(sum(net_amount) filter (where doc_date between ${fyPY.from} and ${fyPY.to}), 0) as sale_py,
             to_char(max(doc_date) filter (where doc_type = 'AR_INV'), 'YYYY-MM-DD') as last_invoice
      from rpt.v_sales_docs where company = ${COMPANY} and card_code = ${code}`,
    sql<{ value: number; orders: number }[]>`
      select coalesce(sum(open_value), 0) as value, count(distinct doc_entry)::int as orders
      from rpt.v_order_lines where company = ${COMPANY} and card_code = ${code} and is_pending`,
    sql<{ days_to_pay: number | null; days_late: number | null }[]>`
      select days_to_pay, days_late from rpt.v_customer_payment_days where company = ${COMPANY} and card_code = ${code}`,
    sql<AgingRow[]>`
      select card_code as key, coalesce(card_name, card_code) as name, salesperson,
             not_due, d0_30, d31_60, d61_90, d91_120, d120_plus, over_90, advance, balance
      from rpt.v_receivable_aging where company = ${COMPANY} and card_code = ${code}`,
  ]);
  return {
    info: info ?? null, sale: s.sale, salePY: s.sale_py, lastInvoice: s.last_invoice,
    pendingOrders: o.value, pendingOrderCount: o.orders,
    daysToPay: p?.days_to_pay ?? null, daysLate: p?.days_late ?? null, aging: aging ?? null,
  };
}

/** Sale per month for the last 12 months (oldest first). */
export async function customerTrend(code: string, today: string): Promise<{ months: string[]; values: number[] }> {
  const sql = dbWeb();
  const [y, m] = today.split("-").map(Number);
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(y, m - 12 + i, 1)).toISOString().slice(0, 7));
  const rows = await sql<{ month: string; amount: number }[]>`
    select to_char(doc_date, 'YYYY-MM') as month, sum(net_amount) as amount
    from rpt.v_sales_docs
    where company = ${COMPANY} and card_code = ${code} and doc_date >= ${months[0] + "-01"} and doc_date <= ${today}
    group by 1`;
  const by = new Map(rows.map((r) => [r.month, r.amount]));
  return { months, values: months.map((mo) => by.get(mo) ?? 0) };
}

export interface BoughtItem { itemCode: string; itemName: string; uom: string | null; quantity: number; amount: number }

export async function customerItems(code: string, range: DateRange, limit = 10): Promise<BoughtItem[]> {
  const sql = dbWeb();
  return sql<BoughtItem[]>`
    select item_code as "itemCode", coalesce(max(item_name), item_code) as "itemName", max(uom) as uom,
           sum(quantity) as quantity, sum(net_amount) as amount
    from rpt.v_sales_lines
    where company = ${COMPANY} and card_code = ${code} and doc_date between ${range.from} and ${range.to}
    group by item_code order by amount desc limit ${limit}`;
}

export interface PendingLine {
  docNum: number; docDate: string; dueDate: string | null; itemName: string; uom: string | null;
  openQty: number; openValue: number; overdue: boolean;
}

export async function customerPendingOrders(code: string, limit = 20): Promise<PendingLine[]> {
  const sql = dbWeb();
  return sql<PendingLine[]>`
    select doc_num as "docNum", to_char(doc_date, 'YYYY-MM-DD') as "docDate", to_char(due_date, 'YYYY-MM-DD') as "dueDate",
           coalesce(item_name, item_code) as "itemName", uom, open_qty as "openQty", open_value as "openValue",
           coalesce(due_date < rpt.today(), false) as overdue
    from rpt.v_order_lines
    where company = ${COMPANY} and card_code = ${code} and is_pending
    order by due_date nulls last, doc_num limit ${limit}`;
}

export interface Receipt { docNum: number; docDate: string; amount: number }

export async function customerReceipts(code: string, limit = 10): Promise<Receipt[]> {
  const sql = dbWeb();
  return sql<Receipt[]>`
    select doc_num as "docNum", to_char(doc_date, 'YYYY-MM-DD') as "docDate", total as amount
    from rpt.v_payments
    where company = ${COMPANY} and direction = 'in' and card_code = ${code}
    order by doc_date desc, doc_num desc limit ${limit}`;
}
