import "server-only";
import { dbWeb } from "../db";
import type { DateRange } from "../period";
import { COMPANY } from "./home";

export interface Account {
  code: string;
  name: string;
  kind: "bank" | "cash";
  balance: number;
}

/** Balance per bank and cash GL account (V9 "Cash Position"). */
export async function bankCashAccounts(): Promise<Account[]> {
  const sql = dbWeb();
  return sql<Account[]>`
    select code, name, kind, balance from rpt.v_bank_cash
    where company = ${COMPANY} and balance <> 0
    order by kind, balance desc`;
}

export interface PartyPayment {
  key: string;
  name: string;
  payType: string;
  total: number;
  onAccount: number;
  count: number;
}

/** Receipts by customer (in) or payments by vendor (out) for a period, with on-account amounts (V9 Receipt/Payment MTD). */
export async function paymentsByParty(direction: "in" | "out", range: DateRange, limit = 100): Promise<{ rows: PartyPayment[]; total: number; onAccount: number }> {
  const sql = dbWeb();
  const rows = await sql<PartyPayment[]>`
    select card_code as key, max(card_name) as name, max(pay_type) as "payType",
           sum(total) as total, sum(on_account) as "onAccount", count(*)::int as count
    from rpt.v_payments
    where company = ${COMPANY} and direction = ${direction} and doc_date between ${range.from} and ${range.to}
    group by card_code
    order by total desc
    limit ${limit}`;
  const [t] = await sql<{ total: number; on_account: number }[]>`
    select coalesce(sum(total), 0) as total, coalesce(sum(on_account), 0) as on_account
    from rpt.v_payments
    where company = ${COMPANY} and direction = ${direction} and doc_date between ${range.from} and ${range.to}`;
  return { rows, total: t.total, onAccount: t.on_account };
}

/** Totals by payment type, so account transfers (rAccount) can be told apart from customer/vendor payments. */
export async function paymentsByType(direction: "in" | "out", range: DateRange): Promise<{ payType: string; total: number }[]> {
  const sql = dbWeb();
  return sql<{ payType: string; total: number }[]>`
    select pay_type as "payType", sum(total) as total
    from rpt.v_payments
    where company = ${COMPANY} and direction = ${direction} and doc_date between ${range.from} and ${range.to}
    group by pay_type order by total desc`;
}
