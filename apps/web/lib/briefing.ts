import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { cacheLife } from "next/cache";
import { dbWeb } from "./db";
import { formatINR, formatQty } from "./format";
import { todayIST } from "./period";
import { COMPANY } from "./queries/home";

// Morning briefing on Home: the figures come from fixed queries below; Claude only turns them into three
// plain sentences (no tools, no database access). Rewritten at most every two hours, and again each day.

const MODEL = "claude-opus-5-5";

export interface Briefing { lines: string[]; facts: string[]; byAi: boolean }

/**
 * `syncedDay` is the India date of the last SAP sync: days from then on may be incomplete, so "last day" figures
 * use the last day before it. `staleSince` (e.g. "27 Oct 11:53") is set when the sync is more than two hours old.
 */
async function facts(day: string, syncedDay: string, staleSince: string | null): Promise<string[]> {
  const sql = dbWeb();
  const upto = syncedDay < day ? syncedDay : day; // first day that may be incomplete
  const [[sale], [mtd], [money], [cash], low, [prod]] = await Promise.all([
    sql<{ last_day: string | null; last_amt: number | null; avg30: number | null; today: number }[]>`
      with d as (select day, amount from rpt.kpi_daily where company = ${COMPANY} and metric = 'sale' and day > ${upto}::date - 31 and day < ${upto}::date)
      select to_char((select max(day) from d), 'YYYY-MM-DD') as last_day,
             (select amount from d order by day desc limit 1) as last_amt,
             (select avg(amount) from d) as avg30,
             coalesce((select sum(amount) from rpt.kpi_daily where company = ${COMPANY} and metric = 'sale' and day = ${day}::date), 0) as today`,
    sql<{ mtd: number; mtd_py: number }[]>`
      select coalesce(sum(amount) filter (where day between date_trunc('month', ${day}::date) and ${day}::date), 0) as mtd,
             coalesce(sum(amount) filter (where day between date_trunc('month', ${day}::date) - interval '1 year'
                                                 and ${day}::date - interval '1 year'), 0) as mtd_py
      from rpt.kpi_daily where company = ${COMPANY} and metric = 'sale'`,
    sql<{ due7: number; over90: number; receipts7: number }[]>`
      select coalesce((select sum(open_amount) from rpt.v_open_items where company = ${COMPANY} and side = 'receivable'
                         and due_date between ${day}::date and ${day}::date + 7), 0) as due7,
             coalesce((select sum(over_90) from rpt.v_receivable_aging where company = ${COMPANY}), 0) as over90,
             coalesce((select sum(amount) from rpt.kpi_daily where company = ${COMPANY} and metric = 'receipt'
                         and day >= ${upto}::date - 7 and day < ${upto}::date), 0) as receipts7`,
    sql<{ liquidity: number }[]>`select coalesce(sum(balance), 0) as liquidity from rpt.v_bank_cash where company = ${COMPANY}`,
    sql<{ name: string; days: number; uom: string | null; on_hand: number }[]>`
      select coalesce(item_name, item_code) as name, cover_days as days, uom, on_hand
      from rpt.v_stock_cover
      where company = ${COMPANY} and cover_days < 7 and used_90d > 0 and coalesce(ordered, 0) = 0
      order by daily_use * coalesce(avg_price, 0) desc limit 3`,
    sql<{ ok_value: number; produced: number; rejected: number; day: string | null }[]>`
      select coalesce(sum(ok_value), 0) as ok_value, coalesce(sum(production_qty), 0) as produced,
             coalesce(sum(rejected_qty), 0) as rejected, to_char(max(doc_date), 'YYYY-MM-DD') as day
      from rpt.v_production_lines
      where company = ${COMPANY} and doc_date = (select max(doc_date) from rpt.v_production_lines
                                               where company = ${COMPANY} and doc_date < ${upto}::date)`,
  ]);
  const out: string[] = [];
  if (staleSince) out.push(`WARNING: SAP data was last synced ${staleSince}; recent figures are incomplete`);
  if (sale.last_day && sale.last_amt != null) {
    const vsAvg = sale.avg30 ? Math.round(((sale.last_amt - sale.avg30) / sale.avg30) * 100) : null;
    out.push(`Sale on ${sale.last_day}: ${formatINR(sale.last_amt)}` +
             (vsAvg != null ? ` (${vsAvg >= 0 ? "+" : ""}${vsAvg}% vs the 30-day daily average of ${formatINR(sale.avg30)})` : ""));
  }
  if (sale.today) out.push(`Sale so far today (${day}): ${formatINR(sale.today)}`);
  const growth = mtd.mtd_py ? Math.round(((mtd.mtd - mtd.mtd_py) / mtd.mtd_py) * 100) : null;
  out.push(`Sale month to date: ${formatINR(mtd.mtd)}` +
           (growth != null ? ` (${growth >= 0 ? "+" : ""}${growth}% vs same dates last year, ${formatINR(mtd.mtd_py)})` : ""));
  out.push(`Customer receipts in the 7 days before ${upto}: ${formatINR(money.receipts7)}`);
  out.push(`Customer invoices falling due in the next 7 days: ${formatINR(money.due7)}`);
  out.push(`Receivables over 90 days: ${formatINR(money.over90)}`);
  out.push(`Bank and cash together (overdrafts negative): ${formatINR(cash.liquidity)}`);
  if (low.length) {
    out.push(`Running out within 7 days with nothing on order: ` +
             low.map((l) => `${l.name} (${formatQty(l.on_hand, l.uom)} left, about ${Math.floor(l.days)} days)`).join("; "));
  } else {
    out.push("No important item runs out within 7 days without a purchase order");
  }
  if (prod.day) {
    const rej = prod.produced ? ((prod.rejected / prod.produced) * 100).toFixed(1) : null;
    out.push(`Production on ${prod.day}: ${formatINR(prod.ok_value)} OK` + (rej ? `, rejection ${rej}%` : ""));
  }
  return out;
}

const RULES = `You write the three-line morning briefing at the top of the managing director's dashboard for Dhumal
Industries. You get a list of facts with figures. Write exactly three short sentences, one per line, no bullets,
no headings, no markdown:
1. How sales are going (the most notable of: yesterday vs average, month vs last year).
2. Money: the most important point about collections, receivables or cash.
3. The one thing that most needs attention today (stock running out, a weak spot, or production).
If the facts start with a WARNING, the first sentence says the data is out of date and since when; then give the
other two points.
Use only the figures given, written exactly as given (₹ with L / Cr). Never invent or recalculate numbers.
Plain, direct business English for an Indian manufacturer. Each sentence under 25 words.`;

const SINCE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
});

/** The sync arguments for morningBriefing: India date of the last sync, and "since" text when over two hours old. */
export function syncState(lastSyncAt: Date, now = new Date()): [syncedDay: string, staleSince: string | null] {
  const stale = now.getTime() - lastSyncAt.getTime() > 2 * 60 * 60 * 1000;
  return [todayIST(lastSyncAt), stale ? SINCE.format(lastSyncAt) : null];
}

let client: Anthropic | null = null;

/** Cached per day; within a day re-made at most every two hours as new SAP data arrives. */
export async function morningBriefing(day: string, syncedDay: string, staleSince: string | null): Promise<Briefing> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 2 * 60 * 60, expire: 24 * 60 * 60 });
  const f = await facts(day, syncedDay, staleSince);
  if (!process.env.ANTHROPIC_API_KEY) return { lines: f.slice(0, 3), facts: f, byAi: false };
  try {
    client ??= new Anthropic({ timeout: 30_000, maxRetries: 1 });
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000, // includes the model's reasoning, not just the three lines
      output_config: { effort: "low" },
      system: RULES,
      messages: [{ role: "user", content: `Today is ${day}. Facts:\n- ${f.join("\n- ")}` }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text).join("\n");
    const lines = text.split("\n").map((l) => l.replace(/^(?:[-•*]|\d+[.)])\s+/, "").trim()).filter(Boolean).slice(0, 3);
    if (msg.stop_reason !== "end_turn" || lines.length === 0) throw new Error(`briefing: ${msg.stop_reason}`);
    return { lines, facts: f, byAi: true };
  } catch (e) {
    console.error("Morning briefing:", e instanceof Error ? e.message : e);
    return { lines: f.slice(0, 3), facts: f, byAi: false };
  }
}
