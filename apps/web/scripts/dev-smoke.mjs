// Development smoke test against the LOCAL stack: real OTP sign-in via the local mail catcher (Mailpit),
// then loads the main pages with that session and checks they render data.
//   node --env-file=.env.local scripts/dev-smoke.mjs [baseUrl]
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const MAILPIT = "http://127.0.0.1:55424";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const email = process.env.ALLOWED_EMAILS.split(",")[0].trim();
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

// 1. A non-allowed address cannot get a code (sign-up is disabled in Supabase too).
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const stranger = await anon.auth.signInWithOtp({ email: "someone.else@example.com", options: { shouldCreateUser: false } });
check("stranger refused by Supabase", !!stranger.error, stranger.error?.message);

// 2. Allowed address: request a code and read it from Mailpit.
await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
const sent = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
check("code requested", !sent.error, sent.error?.message);
let code;
for (let i = 0; i < 20 && !code; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
  const msg = list.messages?.find((m) => m.To?.some((t) => t.Address === email));
  if (msg) {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
    check("email subject", full.Subject === "Your Dhumal Dashboard sign-in code", full.Subject);
    code = (full.Text || full.HTML).match(/\b(\d{6})\b/)?.[1];
  }
}
check("6-digit code in email", !!code);

// 3. Verify and build the cookie @supabase/ssr reads: sb-<ref>-auth-token = "base64-" + base64url(session JSON).
const { data, error } = code ? await anon.auth.verifyOtp({ email, token: code, type: "email" }) : { data: {}, error: { message: "no code" } };
check("code verified", !error, error?.message);
if (!data?.session) report();
const ref = new URL(url).hostname.split(".")[0];
const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
const chunks = value.match(/.{1,3180}/g);
const cookie = chunks.length === 1
  ? `sb-${ref}-auth-token=${value}`
  : chunks.map((c, i) => `sb-${ref}-auth-token.${i}=${c}`).join("; ");

// 4. Pages render with real data.
const pages = [
  ["/", ["Dhumal Industries", "Sale MTD", "Position now", "Receivables", "Needs attention", "₹"]],
  // Navigation: every module is listed directly (no "More" menu).
  ["/stock", ['aria-label="Modules"', "Receivables", "Payables", "Inventory", "Orders", "Purchase", "Quotations", "Production", "Settings",
              'href="/purchase"', 'href="/production"', 'href="/quotations"', 'href="/settings"']],
  ["/?p=ytd", ["YTD"]],
  ["/sales", ["Sales", "Salesperson", "Share", "₹"]],
  ["/sales?by=item&p=ytd", ["Item", "Qty"]],
  ["/money/receivables", ["Total receivable", "Over 90 days", "estimated"]],
  ["/money/receivables?view=salesperson", ["By salesperson"]],
  ["/settings", ["Sign out of all devices", email]],
  ["/customers/C004153", ["VIP Industries", "Open"]],
  ["/money/payables", ["Total payable", "Over 90 days", "Vendor"]],
  ["/money/cash", ["Total liquidity", "Receipts", "On account"]],
  ["/money/cash?dir=out&p=ytd", ["Payments", "GL accounts"]],
  ["/stock", ["Stock value", "By item category", "Top 50 items", "minimum stock", "Slow and non-moving", "/stock/items?category=", "/stock/items?warehouse="]],
  ["/", ["Today’s briefing", "Written by AI from these figures"]],
  // Document detail: invoice lines and the order / delivery behind them
  ["/documents/AR_INV/21398", ["260200682", "VIREN INDUSTRIES", "Made from", "Sales order", "262737829", "Delivery", "262729651",
                               "PRIMARY &amp; SECONDARY STRUCTURE", "was sold"]],
  ["/documents/ORDER/28595", ["262737829", "Made from this sales order", "260200682", "262729651", "was ordered", "Still open"]],
  ["/documents/DELIVERY/24396", ["262729651", "Made from this delivery", "260200682"]],
  ["/sales/documents?by=customer&key=C000207&p=ytd", ["/documents/AR_INV/"]],
  // Period picker: day, week, custom range on every screen
  ["/sales?p=week&d=2026-10-21", ["Week 19 – 25 Oct 2026", "Back to today"]],
  ["/sales?p=custom&from=2026-10-01&to=2026-10-15", ["1 – 15 Oct 2026", "Back to today"]],
  ["/sales?p=today&d=2026-10-20", ["Tue 20 Oct 2026"]],
  ["/?p=today&d=2026-10-20", ["Back to today", "Day"]],
  ["/production?p=week&d=2026-10-21", ["Daily item-wise production", "21 Oct 2026", "Week 19 – 25 Oct 2026"]],
  ["/money/cash?p=custom&from=2026-09-01&to=2026-09-30&dir=out", ["1 – 30 Sept 2026", "Payments"]],
  ["/purchase?p=ytd&d=2026-09-30", ["FY 2026-27 to date to 30 Sept 2026"]],
  ["/stock", ["Running out within 15 days","Uses per day", "On order"]],
  ["/customers/C000207", ["Owes us", "Pays in", "Pending orders", "What they buy", "Open invoices", "Recent receipts", "Sale, last 12 months"]],
  ["/money/receivables?q=C000207", ["/customers/C000207"]],
  ["/stock/items?category=110",["SPARES", "By warehouse", "Items by value", "Total"]],
  ["/stock/items?warehouse=AS-FGS", ["Warehouse", "By item category", "Items by value"]],
  ["/stock/items?category=110&warehouse=AS-FGS", ["SPARES", "in all warehouses", "All categories in", "Items by value"]],
  ["/stock/orders", ["Today’s orders", "Today’s dispatch"]],
  ["/stock/orders?view=pending", ["Open sales orders", "Over 180 days", "Balance"]],
  ["/stock/orders?view=pending&overdue=1&age=all", ["Overdue only"]],
  ["/stock/orders?view=shortage", ["Shortage", "On hand"]],
  ["/purchase", ["Purchase", "Open purchase orders", "Top 5 vendors", "price after discount"]],
  ["/purchase?by=item&p=ytd", ["Qty", "Price after discount"]],
  ["/purchase?by=vendor&p=ytd", ["HALDIA PETROCHEMICALS", "Total"]],
  ["/sales/items", ["Trends", "% off"]],
  ["/quotations", ["Quotations", "DhumalOne", "By salesperson", "By item", "By customer"]],
  ["/quotations?p=custom", ["No quotations in this period"]],
  // V9 column parity
  ["/money/receivables", ["Code", "Not due", "31–60", "61–90", "91–120", "120+", "Total", "Show all customers"]],
  ["/money/receivables?all=1", ["Total"]],
  ["/money/payables?all=1", ["Code", "120+", "Total"]],
  ["/sales?by=customer", ["Show all", "Total", "Last year"]],
  ["/sales/items", ["Salespeople, month by month", "Top 50 items", "% off"]],
  ["/stock/orders?view=today&d=2026-10-26", ["Order date", "Due date", "Balance value", "Order value", "Basic sale", "UoM", "2026-10-26"]],
  ["/stock/orders?view=pending", ["Rate", "Balance value", "On hand", "Show every line"]],
  ["/money/cash?dir=in&p=mtd", ["Customer code", "On account", "Total"]],
  ["/purchase?by=item&p=ytd", ["Price after discount", "Total"]],
  // Production
  ["/production?d=2026-10-25", ["Daily item-wise production", "Prod order", "Rej. %", "OK value", "Product-wise summary", "Top 5 rejection items", "Operator-wise summary", "Machine-wise summary"]],
  // As-of date
  ["/?d=2026-09-30&p=mtd", ["To 30 Sept 2026", "Production 2026-09-30", "Balances are as of now"]],
  ["/sales?d=2026-09-30", ["Month to date to 30 Sept 2026"]],
];
for (const [path, needles] of pages) {
  const t = Date.now();
  const res = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
  const html = await res.text();
  const missing = needles.filter((n) => !html.includes(n));
  // A Server Component that throws inside <Suspense> still returns 200; its error digest shows up in the stream.
  const serverError = /"digest":"\d+"/.test(html);
  check(`GET ${path}`, res.status === 200 && missing.length === 0 && !serverError,
        `HTTP ${res.status}, ${Date.now() - t} ms${missing.length ? `, missing: ${missing.join(" | ")}` : ""}${serverError ? ", SERVER ERROR in stream" : ""}`);
}

// The old "More" address no longer exists.
const gone = await fetch(BASE + "/more", { headers: { cookie }, redirect: "manual" });
check("old /more route removed", gone.status === 404, `HTTP ${gone.status}`);
const moved = await fetch(BASE + "/money/receivables/C004153", { headers: { cookie }, redirect: "manual" });
check("old receivable page goes to the customer card", moved.status === 307 && moved.headers.get("location")?.endsWith("/customers/C004153"),
      `HTTP ${moved.status} ${moved.headers.get("location")}`);

// 5. Sign out of all devices revokes the session.
await anon.auth.setSession(data.session);
await anon.auth.signOut({ scope: "global" });
const after = await fetch(BASE + "/", { headers: { cookie }, redirect: "manual" });
check("session revoked after global sign-out", after.status === 307, `HTTP ${after.status}`);

report();

function report() {
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
