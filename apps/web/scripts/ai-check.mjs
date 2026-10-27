// Asks the PRD §5 example questions through the real /api/ask route and prints answer, queries and time.
// Uses the Claude API (costs a few rupees per run).  node --env-file=.env.local scripts/ai-check.mjs [baseUrl] [question...]
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://127.0.0.1:3100";
const custom = process.argv.slice(process.argv[2]?.startsWith("http") ? 3 : 2);
const QUESTIONS = custom.length ? custom : [
  "How much did we sell today, and how does it compare with the same day last year?",
  "Amol's sales this month vs last month.",
  "Top 10 items by sale this quarter.",
  "Which items are below minimum stock and also have pending orders?",
  "What is our total bank balance right now?",
  "Which item had the highest rejection this week?",
  "Open quotations for Sneha Farms.",
];

// Dev-only session: admin-generated one-time code for the allow-listed email (local Supabase).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = process.env.ALLOWED_EMAILS.split(",")[0].trim();
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data } = await anon.auth.verifyOtp({ email, token: link.properties.email_otp, type: "email" });
const cookie = `sb-${new URL(url).hostname.split(".")[0]}-auth-token=base64-${Buffer.from(JSON.stringify(data.session)).toString("base64url")}`;

const times = [];
for (const question of QUESTIONS) {
  const t = Date.now();
  const res = await fetch(`${BASE}/api/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ question, history: [] }),
  });
  const r = await res.json();
  times.push(Date.now() - t);
  console.log(`\nQ: ${question}\n   HTTP ${res.status} · ${((Date.now() - t) / 1000).toFixed(1)} s`);
  console.log(`A: ${(r.answer ?? r.error ?? "").replace(/\n/g, "\n   ")}`);
  for (const q of r.queries ?? []) console.log(`   · ${q.purpose} (${q.error ? "ERROR " + q.error : q.rows + " rows"})`);
  if (r.table) console.log(`   table: ${r.table.columns.join(", ")} · ${r.table.rows.length} rows`);
}
await anon.auth.signOut();
const sorted = [...times].sort((a, b) => a - b);
console.log(`\n${QUESTIONS.length} questions · median ${(sorted[Math.floor(sorted.length / 2)] / 1000).toFixed(1)} s · ` +
            `90th pct ${(sorted[Math.ceil(sorted.length * 0.9) - 1] / 1000).toFixed(1)} s (PRD target: under 8 s)`);
