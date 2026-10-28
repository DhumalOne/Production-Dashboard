import "server-only";
import { dbWeb } from "../db";
import { dayCount, previousYear, resolvePeriod, type Period } from "../period";

export const COMPANY = "DHUMAL_LIVE";

export const METRICS = [
  { key: "sale", label: "Sale", href: "/sales" },
  { key: "quotation", label: "Quotations", href: "/quotations" },
  { key: "order", label: "Orders", href: "/stock/orders" },
  { key: "purchase", label: "Purchase", href: "/purchase" },
  { key: "receipt", label: "Receipts", href: "/money/cash" },
  { key: "payment", label: "Payments", href: "/money/cash" },
] as const;
export type MetricKey = (typeof METRICS)[number]["key"];

export interface KpiCard {
  key: MetricKey;
  label: string;
  href: string;
  period: number;
  periodPY: number;
  today: number;
  mtd: number;
  ytd: number;
  dailyAvg: number; // over the selected period
  months: { month: string; amount: number }[]; // last 6 months incl. current
}

export async function getKpis(period: Period, today: string): Promise<KpiCard[]> {
  const sql = await dbWeb();
  const mtd = resolvePeriod("mtd", today);
  const ytd = resolvePeriod("ytd", today);
  const py = previousYear(period);
  const sixStart = monthsBack(today, 5);

  const [totals, months] = await Promise.all([
    sql<{ metric: MetricKey; period: number; period_py: number; today: number; mtd: number; ytd: number }[]>`
      select metric,
             coalesce(sum(amount) filter (where day between ${period.from} and ${period.to}), 0) as period,
             coalesce(sum(amount) filter (where day between ${py.from} and ${py.to}), 0)         as period_py,
             coalesce(sum(amount) filter (where day = ${today}), 0)                             as today,
             coalesce(sum(amount) filter (where day between ${mtd.from} and ${today}), 0)       as mtd,
             coalesce(sum(amount) filter (where day between ${ytd.from} and ${today}), 0)       as ytd
      from rpt.kpi_daily
      where company = ${COMPANY} and day >= least(${py.from}::date, ${ytd.from}::date)
      group by metric`,
    sql<{ metric: MetricKey; month: string; amount: number }[]>`
      select metric, to_char(date_trunc('month', day), 'YYYY-MM') as month, sum(amount) as amount
      from rpt.kpi_daily
      where company = ${COMPANY} and day between ${sixStart} and ${today}
      group by 1, 2`,
  ]);

  const days = dayCount({ from: period.from, to: period.to });
  const monthKeys = Array.from({ length: 6 }, (_, i) => monthsBack(today, 5 - i).slice(0, 7));
  return METRICS.map((m) => {
    const t = totals.find((r) => r.metric === m.key);
    return {
      ...m,
      period: t?.period ?? 0,
      periodPY: t?.period_py ?? 0,
      today: t?.today ?? 0,
      mtd: t?.mtd ?? 0,
      ytd: t?.ytd ?? 0,
      dailyAvg: (t?.period ?? 0) / days,
      months: monthKeys.map((month) => ({
        month,
        amount: months.find((r) => r.metric === m.key && r.month === month)?.amount ?? 0,
      })),
    };
  });
}

export interface Position {
  inventory: number;
  receivables: number;
  payables: number;
  bank: number;
  cash: number;
  liquidity: number;
}

export async function getPosition(): Promise<Position> {
  const sql = await dbWeb();
  const [row] = await sql<Omit<Position, "liquidity">[]>`
    select
      (select coalesce(sum(stock_value), 0) from rpt.v_stock where company = ${COMPANY})                         as inventory,
      (select coalesce(sum(balance), 0) from rpt.v_receivable_aging where company = ${COMPANY})                  as receivables,
      (select coalesce(sum(balance), 0) from rpt.v_payable_aging where company = ${COMPANY})                     as payables,
      (select coalesce(sum(balance), 0) from rpt.v_bank_cash where company = ${COMPANY} and kind = 'bank')       as bank,
      (select coalesce(sum(balance), 0) from rpt.v_bank_cash where company = ${COMPANY} and kind = 'cash')       as cash`;
  return { ...row, liquidity: row.bank + row.cash };
}

export interface Alert {
  kind: "overdue_receivable" | "overdue_orders" | "sync_stale";
  title: string;
  detail: string;
  href: string;
  amount?: number;
}

/** Top items for "Needs attention" (PRD §6). Thresholds are v1 defaults; Settings will make them editable. */
export async function getAlerts(limit = 3): Promise<Alert[]> {
  const sql = await dbWeb();
  const [receivables, orders] = await Promise.all([
    sql<{ card_code: string; card_name: string; over_90: number }[]>`
      select card_code, card_name, over_90 from rpt.v_receivable_aging
      where company = ${COMPANY} and over_90 >= 500000
      order by over_90 desc limit ${limit}`,
    // Only orders from the last 180 days: thousands of older orders are still open in SAP but stale.
    sql<{ n: number; amount: number }[]>`
      select count(distinct doc_entry)::int as n, coalesce(sum(open_value), 0) as amount from rpt.v_order_lines
      where company = ${COMPANY} and is_pending and due_date < rpt.today() and doc_date >= rpt.today() - 180`,
  ]);
  const alerts: Alert[] = receivables.map((r) => ({
    kind: "overdue_receivable",
    title: r.card_name || r.card_code,
    detail: "owes over 90 days",
    href: `/money/receivables?q=${encodeURIComponent(r.card_code)}`,
    amount: r.over_90,
  }));
  if (orders[0]?.n) {
    alerts.push({
      kind: "overdue_orders",
      title: `${orders[0].n} sales orders past due date`,
      detail: "last 180 days, quantity still to deliver",
      href: "/stock/orders?view=pending&overdue=1",
      amount: orders[0].amount,
    });
  }
  return alerts.slice(0, limit);
}

export interface SyncStatus {
  lastSyncAt: Date | null;
  ok: boolean | null;
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const sql = await dbWeb();
  const [row] = await sql<{ last_sync_at: Date | null; last_sync_ok: boolean | null }[]>`
    select last_sync_at, last_sync_ok from rpt.v_sync_status where company = ${COMPANY}`;
  return { lastSyncAt: row?.last_sync_at ?? null, ok: row?.last_sync_ok ?? null };
}

function monthsBack(today: string, n: number): string {
  const [y, m] = today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 10);
}
