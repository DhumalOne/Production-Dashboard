import "server-only";
import { dbWeb } from "../db";
import { COMPANY } from "./home";

export type Side = "receivable" | "payable";

export const BUCKETS = [
  { key: "not_due", label: "Not due" },
  { key: "d0_30", label: "0–30" },
  { key: "d31_60", label: "31–60" },
  { key: "d61_90", label: "61–90" },
  { key: "d91_120", label: "91–120" },
  { key: "d120_plus", label: "120+" },
] as const;

export interface AgingRow {
  key: string;
  name: string;
  salesperson: string | null;
  not_due: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d91_120: number;
  d120_plus: number;
  over_90: number;
  advance: number;
  balance: number;
}

const view = (sql: ReturnType<typeof dbWeb>, side: Side) =>
  side === "receivable" ? sql`rpt.v_receivable_aging` : sql`rpt.v_payable_aging`;

const SUMS = (sql: ReturnType<typeof dbWeb>) => sql`
  sum(not_due) as not_due, sum(d0_30) as d0_30, sum(d31_60) as d31_60, sum(d61_90) as d61_90,
  sum(d91_120) as d91_120, sum(d120_plus) as d120_plus, sum(over_90) as over_90, sum(advance) as advance,
  sum(balance) as balance`;

export async function agingTotals(side: Side): Promise<AgingRow> {
  const sql = dbWeb();
  const [row] = await sql<AgingRow[]>`
    select 'all' as key, 'All' as name, null as salesperson, ${SUMS(sql)}
    from ${view(sql, side)} where company = ${COMPANY}`;
  return row;
}

export async function agingByParty(side: Side, q: string | undefined, limit = 100): Promise<AgingRow[]> {
  const sql = dbWeb();
  const search = q ? sql`and (card_code ilike ${q + "%"} or card_name ilike ${"%" + q + "%"})` : sql``;
  const sp = side === "receivable" ? sql`salesperson` : sql`null::text`;
  return sql<AgingRow[]>`
    select card_code as key, coalesce(card_name, card_code) as name, ${sp} as salesperson,
           not_due, d0_30, d31_60, d61_90, d91_120, d120_plus, over_90, advance, balance
    from ${view(sql, side)}
    where company = ${COMPANY} and balance <> 0 ${search}
    order by over_90 desc, balance desc
    limit ${limit}`;
}

export async function receivablesBySalesperson(): Promise<AgingRow[]> {
  const sql = dbWeb();
  return sql<AgingRow[]>`
    select coalesce(salesperson, 'No salesperson') as key, coalesce(salesperson, 'No salesperson') as name,
           null as salesperson, ${SUMS(sql)}
    from rpt.v_receivable_aging where company = ${COMPANY}
    group by 1 order by over_90 desc`;
}

export interface OpenItem {
  docType: string;
  docEntry: number | null;
  docNum: number | null;
  docDate: string | null;
  dueDate: string | null;
  daysOverdue: number | null;
  bucket: string;
  amount: number;
}

export async function partyOpenItems(side: Side, cardCode: string): Promise<{ name: string; items: OpenItem[] }> {
  const sql = dbWeb();
  const items = await sql<(OpenItem & { card_name: string | null })[]>`
    select doc_type as "docType", doc_entry as "docEntry", doc_num as "docNum", to_char(doc_date, 'YYYY-MM-DD') as "docDate",
           to_char(due_date, 'YYYY-MM-DD') as "dueDate", days_overdue as "daysOverdue", bucket,
           open_amount as amount, card_name
    from rpt.v_open_items
    where company = ${COMPANY} and side = ${side} and card_code = ${cardCode}
    order by due_date nulls first`;
  return { name: items[0]?.card_name ?? cardCode, items };
}
