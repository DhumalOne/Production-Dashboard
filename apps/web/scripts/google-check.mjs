// Checks the "Sign in with Google" wiring up to Google's own page (no Google account needed).
//   node --env-file=.env.local scripts/google-check.mjs [baseUrl]
import { createClient } from "@supabase/supabase-js";

const BASE = process.argv[2] ?? "http://127.0.0.1:3100";
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok, detail });

// 1. Supabase builds a Google authorize URL restricted to the Workspace domain.
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await anon.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: `${BASE}/auth/callback`, skipBrowserRedirect: true, queryParams: { hd: "dhumal.com", prompt: "select_account" } },
});
check("Supabase starts Google sign-in", !error && !!data?.url, error?.message ?? "");
if (data?.url) {
  const r = await fetch(data.url, { redirect: "manual" });
  const loc = r.headers.get("location") ?? "";
  check("hands off to Google", r.status >= 300 && r.status < 400 && loc.startsWith("https://accounts.google.com/"), `HTTP ${r.status} → ${loc.slice(0, 60)}`);
  check("limited to @dhumal.com accounts", /[?&]hd=dhumal\.com/.test(loc));
  check("asks which account to use", /[?&]prompt=select_account/.test(loc));
  check("Google returns to Supabase callback", /redirect_uri=[^&]*%2Fauth%2Fv1%2Fcallback/.test(loc));
  const clientId = decodeURIComponent(loc.match(/[?&]client_id=([^&]*)/)?.[1] ?? "");
  const configured = /\.apps\.googleusercontent\.com$/.test(clientId);
  check("Google client ID is configured", configured,
        configured ? "" : clientId ? `got "${clientId.slice(0, 45)}": set the Google client ID` : "empty: set the Google client ID");
}

// 2. The app's callback refuses visits without a valid code.
const cb = await fetch(`${BASE}/auth/callback`, { redirect: "manual" });
check("callback without code goes back to sign-in", cb.status === 307 && (cb.headers.get("location") ?? "").includes("/login?error=google"), `HTTP ${cb.status} ${cb.headers.get("location")}`);
const bad = await fetch(`${BASE}/auth/callback?code=forged`, { redirect: "manual" });
check("callback with a forged code is refused", bad.status === 307 && (bad.headers.get("location") ?? "").includes("/login?error"), `HTTP ${bad.status} ${bad.headers.get("location")}`);

// 3. Sign-in page.
const page = await (await fetch(`${BASE}/login`)).text();
check("sign-in page shows the Google button", page.includes("Sign in with Google") && page.includes("@dhumal.com"));
check("email code kept as a backup", page.includes("Other ways to sign in"));
const denied = await (await fetch(`${BASE}/login?error=not_authorised`)).text();
check("not-authorised message", denied.includes("not authorised for the dashboard"));

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
