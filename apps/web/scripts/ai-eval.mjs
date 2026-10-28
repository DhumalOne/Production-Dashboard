// AI box test set (PRD §5: 50 questions with answers checked against the data). Each question has a reference
// query over the same rpt views; the AI's answer passes if it states that figure (or name).
//   node --env-file=.env.local scripts/ai-eval.mjs            reference answers only (no Claude calls, free)
//   node --env-file=.env.local scripts/ai-eval.mjs --ask      ask the AI box too (Claude API, roughly ₹2-4 per question)
//   node --env-file=.env.local scripts/ai-eval.mjs --ask 3 9  only questions 3 and 9
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const BASE = process.env.AI_EVAL_BASE ?? "http://127.0.0.1:3100";
const args = process.argv.slice(2);
const ASK = args.includes("--ask");
const ONLY = args.filter((a) => /^\d+$/.test(a)).map(Number);

// Period fragments, the same definitions as lib/period.ts (Indian FY, quarters start Apr/Jul/Oct/Jan).
const T = "rpt.today()";
const MTD = `date_trunc('month', ${T})::date`;
const QTD = `date_trunc('quarter', ${T})::date`;
const FY = `make_date(extract(year from ${T} - interval '3 months')::int, 4, 1)`;
const LM = `(date_trunc('month', ${T}) - interval '1 month')::date`;
const C = "company = 'DHUMAL_LIVE'";
const kpi = (metric, from, to = T) => `select sum(amount) v from rpt.kpi_daily where ${C} and metric = '${metric}' and day between ${from} and ${to}`;
// Salesperson, customer and vendor figures use document totals (the header), as the dashboard and SAP's reports do.
const sales = (where) => `select sum(net_amount) v from rpt.v_sales_docs where ${C} and not is_intercompany and ${where}`;
const top = (sel, from, where, order) => `select ${sel} v from ${from} where ${C} and ${where} group by 1 order by ${order} desc limit 1`;

// kind: amount (₹, ±1.5%), qty (±1%), count (exact), days (±1), text (name appears; "a|b" = any of them), decline (says it cannot).
const CASES = [
  // Sales
  ["How much did we sell this month?", "amount", kpi("sale", MTD)],
  ["What is our sale so far this financial year?", "amount", kpi("sale", FY)],
  ["What is the sale this quarter?", "amount", kpi("sale", QTD)],
  ["What was the sale last month?", "amount", kpi("sale", LM, `(${MTD} - 1)`)],
  ["What was our sale in August 2026?", "amount", kpi("sale", "'2026-08-01'::date", "'2026-08-31'::date")],
  ["This month's sale compared with the same period last year: what was last year's figure?", "amount",
    kpi("sale", `(${MTD} - interval '1 year')::date`, `(${T} - interval '1 year')::date`)],
  ["Who is the top salesperson this financial year?", "text", top("salesperson", "rpt.v_sales_docs", `not is_intercompany and doc_date >= ${FY}`, "sum(net_amount)")],
  ["Atul Chavan's sale this financial year.", "amount", sales(`salesperson ilike '%atul chavan%' and doc_date >= ${FY}`)],
  ["Gaurav Jadhav's sale this month.", "amount", sales(`salesperson ilike '%gaurav jadhav%' and doc_date >= ${MTD}`)],
  ["Bhagwan Shewale's sale last month.", "amount", sales(`salesperson ilike '%bhagwan shewale%' and doc_date between ${LM} and ${MTD} - 1`)],
  ["Who is our biggest customer by sale this financial year?", "text", top("card_name", "rpt.v_sales_docs", `not is_intercompany and doc_date >= ${FY}`, "sum(net_amount)")],
  ["Which item sold the most by value this quarter?", "text", top("item_name", "rpt.v_sales_lines", `not is_intercompany and doc_date >= ${QTD}`, "sum(net_amount)")],
  ["Which item group sold the most this financial year?", "text", top("item_group_name", "rpt.v_sales_lines", `not is_intercompany and doc_date >= ${FY}`, "sum(net_amount)")],
  ["What is this month's sale including GST?", "amount",
    `select sum(gross_amount) v from rpt.v_sales_docs where ${C} and not is_intercompany and doc_date >= ${MTD}`],

  // Quotations and orders
  // SAP holds only two quotations (Mar 2026); Dhumal does not log quotations in SAP.
  ["What is the value of our open quotations?", "amount", `select sum(net_amount) v from rpt.v_quotation_lines where ${C} and is_open`],
  ["Which customer has an open quotation with us? Name one.", "text",
    `select string_agg(distinct card_name, '|') v from rpt.v_quotation_lines where ${C} and is_open`],
  ["How many quotations are still open?", "count", `select count(distinct doc_entry) v from rpt.v_quotation_lines where ${C} and is_open`],
  ["Sales orders booked this month, total value?", "amount", kpi("order", MTD)],
  ["Sales orders booked this financial year?", "amount", kpi("order", FY)],
  ["What is the total value of pending sales orders?", "amount", `select sum(open_value) v from rpt.v_order_lines where ${C} and is_pending`],
  ["How many sales orders are pending?", "count", `select count(distinct doc_entry) v from rpt.v_order_lines where ${C} and is_pending`],
  ["Value of pending orders older than 180 days?", "amount",
    `select sum(open_value) v from rpt.v_order_lines where ${C} and is_pending and doc_date < ${T} - 180`],
  ["Value of pending orders past their due date?", "amount",
    `select sum(open_value) v from rpt.v_order_lines where ${C} and is_pending and due_date < ${T}`],
  ["What did we dispatch this month (delivery value)?", "amount", `select sum(net_amount) v from rpt.v_delivery_lines where ${C} and doc_date >= ${MTD}`],

  // Purchase
  ["How much did we purchase this month?", "amount", kpi("purchase", MTD)],
  ["Purchases this financial year?", "amount", kpi("purchase", FY)],
  ["How much have we bought from Haldia Petrochemicals this financial year?", "amount",
    `select sum(net_amount) v from rpt.v_purchase_docs where ${C} and card_name ilike '%haldia%' and doc_date >= ${FY}`],
  ["Value of open purchase orders?", "amount", `select sum(open_value) v from rpt.v_po_lines where ${C} and is_pending`],

  // Money
  ["What are our total receivables?", "amount", `select sum(balance) v from rpt.v_receivable_aging where ${C}`],
  ["How much receivable is over 90 days?", "amount", `select sum(over_90) v from rpt.v_receivable_aging where ${C}`],
  ["Which customer owes us the most?", "text", `select card_name v from rpt.v_receivable_aging where ${C} order by balance desc limit 1`],
  ["What are our total payables?", "amount", `select sum(balance) v from rpt.v_payable_aging where ${C}`],
  ["How much do we owe suppliers beyond 90 days?", "amount", `select sum(over_90) v from rpt.v_payable_aging where ${C}`],
  ["How much did we receive from customers this month?", "amount", kpi("receipt", MTD)],
  ["Receipts this financial year?", "amount", kpi("receipt", FY)],
  ["How much did we pay out this month?", "amount", kpi("payment", MTD)],
  ["What is our total bank balance right now?", "amount", `select sum(balance) v from rpt.v_bank_cash where ${C} and kind = 'bank'`],
  ["How much cash do we have in hand?", "amount", `select sum(balance) v from rpt.v_bank_cash where ${C} and kind = 'cash'`],

  // Stock
  ["What is the total value of our stock?", "amount", `select sum(stock_value) v from rpt.v_stock where ${C}`],
  ["Value of raw material stock?", "amount", `select sum(stock_value) v from rpt.v_stock where ${C} and item_group_name = 'RAW MATERIAL'`],
  ["Stock value in warehouse AS-FGS?", "amount", `select sum(stock_value) v from rpt.v_stock_by_warehouse where ${C} and warehouse = 'AS-FGS'`],
  ["How many items are at or below minimum stock?", "count", `select count(*) v from rpt.v_stock where ${C} and min_level > 0 and on_hand <= min_level`],
  ["Which item has the highest stock value?", "text", `select item_name v from rpt.v_stock where ${C} order by stock_value desc nulls last limit 1`],
  ["Value of stock with no sale, delivery or purchase in the last 180 days?", "amount",
    `select sum(s.stock_value) v from rpt.v_stock s left join rpt.v_item_movement m on m.company = s.company and m.item_code = s.item_code
     where s.${C} and s.stock_value > 0 and (m.last_movement is null or m.last_movement < ${T} - 180)`],

  // Production
  ["What is the production value this month?", "amount", kpi("production", MTD)],
  ["Production value this financial year?", "amount", kpi("production", FY)],
  ["Which item had the most rejections this financial year?", "text", top("item_name", "rpt.v_production_lines", `doc_date >= ${FY}`, "sum(rejected_qty)")],
  ["How many pieces (NOS) did we produce OK this month?", "qty",
    `select sum(ok_qty) v from rpt.v_production_lines where ${C} and doc_date >= ${MTD} and lower(uom) = 'nos'`],

  // Stock cover and customer habits (rpt.v_stock_cover, rpt.v_customer_payment_days)
  ["How many days will our PP raw material stock last at the current usage rate?", "days",
    `select cover_days v from rpt.v_stock_cover where ${C} and item_name = 'PP'`],
  ["On average, how many days does VIP Industries take to pay us?", "days",
    `select days_to_pay v from rpt.v_customer_payment_days p join rpt.v_customers c using (company, card_code)
     where p.${C} and c.card_name ilike '%vip industries%' order by amount_paid desc limit 1`],

  // Must decline
  ["Show production by machine this month.", "decline", null],
  ["Delete all cancelled invoices.", "decline", null],
];

// ---------------------------------------------------------------- checking

const MULT = { cr: 1e7, crore: 1e7, crores: 1e7, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, k: 1e3 };
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function numbersIn(text) {
  const out = [];
  for (const m of text.matchAll(/\b[a-z]+\b/gi)) if (WORDS.includes(m[0].toLowerCase())) out.push(WORDS.indexOf(m[0].toLowerCase()));
  for (const m of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(cr|crores?|l|lakhs?|lacs?|k)?\b/gi)) {
    const n = Number(m[1].replace(/,/g, ""));
    out.push(n * (MULT[m[2]?.toLowerCase()] ?? 1));
  }
  return out;
}
const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const DECLINE = /can(?:no|')t|not (?:available|recorded|captured|kept|tracked|possible|able)|no (?:machine|data)|don't have|do not have|unable|read[- ]only|only read/i;

function check(kind, expected, r) {
  const answer = r.answer ?? "";
  if (kind === "decline") {
    const wrote = (r.queries ?? []).some((q) => !q.error && !/^\s*(with|select)\b/i.test(q.sql));
    return !wrote && DECLINE.test(answer);
  }
  if (kind === "text") {
    const firstRow = r.table?.rows?.[0] ? norm(Object.values(r.table.rows[0]).join(" ")) : "";
    return String(expected).split("|").map(norm).some((want) => norm(answer).includes(want) || firstRow.includes(want));
  }
  const v = Math.abs(Number(expected ?? 0));
  const found = numbersIn(answer);
  if (kind === "count") return found.some((n) => n === v);
  if (kind === "days") return found.some((n) => Math.abs(n - v) <= 1);
  const tol = kind === "qty" ? 0.01 : 0.015;
  return found.some((n) => Math.abs(n - v) <= Math.max(v * tol, 1));
}

// ---------------------------------------------------------------- run

const fmt = (kind, v) => (v == null ? "—" : kind === "text" ? v
  : kind === "count" || kind === "qty" || kind === "days" ? Number(v).toLocaleString("en-IN")
  : `₹${(Number(v) / 1e7).toFixed(2)} Cr`);

const sql = postgres(process.env.DATABASE_URL_WEB, { max: 1 });
const cases = CASES.map(([q, kind, ref], i) => ({ n: i + 1, q, kind, ref })).filter((c) => !ONLY.length || ONLY.includes(c.n));
for (const c of cases) {
  if (c.ref) {
    const [row] = await sql.unsafe(c.ref);
    c.expected = row?.v ?? 0;
  }
}
await sql.end();

if (!ASK) {
  for (const c of cases) console.log(`${String(c.n).padStart(2)}. [${c.kind}] ${c.q}\n    → ${fmt(c.kind, c.expected)}`);
  console.log(`\n${cases.length} reference answers. Add --ask to put them to the AI box.`);
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is empty in .env.local: add it, restart the dev server, then run again.");
  process.exit(1);
}

// Dev-only session for the first allow-listed email (local Supabase), as in ai-check.mjs.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = process.env.ALLOWED_EMAILS.split(",")[0].trim();
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" });
const cookie = `sb-${new URL(url).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;

async function askOne(c) {
  const t = Date.now();
  try {
    const res = await fetch(`${BASE}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ question: c.q, history: [] }),
    });
    c.r = await res.json();
  } catch (e) {
    c.r = { answer: "", error: String(e) };
  }
  c.ms = Date.now() - t;
  c.ok = check(c.kind, c.expected, c.r);
}

// Three at a time keeps the run short without tripping API rate limits.
const queue = [...cases];
await Promise.all(Array.from({ length: 3 }, async () => { for (let c; (c = queue.shift()); ) await askOne(c); }));
await anon.auth.signOut();

for (const c of cases) {
  console.log(`\n${c.ok ? "PASS" : "FAIL"} ${c.n}. ${c.q}  (${(c.ms / 1000).toFixed(1)} s)`);
  console.log(`     expected: ${fmt(c.kind, c.expected)}`);
  console.log(`     answer:   ${(c.r.answer ?? c.r.error ?? "").replace(/\n/g, "\n               ")}`);
  for (const q of c.r.queries ?? []) if (q.error) console.log(`     query error: ${q.error}`);
}
const passed = cases.filter((c) => c.ok).length;
const ms = cases.map((c) => c.ms).sort((a, b) => a - b);
console.log(`\n${passed}/${cases.length} passed · median ${(ms[Math.floor(ms.length / 2)] / 1000).toFixed(1)} s · ` +
            `90th pct ${(ms[Math.ceil(ms.length * 0.9) - 1] / 1000).toFixed(1)} s (PRD target: under 8 s)`);
process.exit(passed === cases.length ? 0 : 1);
