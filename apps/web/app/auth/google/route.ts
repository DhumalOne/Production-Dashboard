import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Sign in with Google: only @dhumal.com Google accounts are offered; /auth/callback checks the allow list.
// A route rather than a server action: the sign-in service shares this site's address (/auth/v1), and Next.js
// treats an action's redirect to its own host as one of its pages, so the browser would never reach Google.
export async function POST(request: Request) {
  // SITE_URL in production; locally, the address this request came in on. Supabase only accepts
  // return addresses on its allow list, so a forged Host header cannot redirect elsewhere.
  const origin = process.env.SITE_URL || new URL(request.url).origin;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { hd: process.env.GOOGLE_WORKSPACE_DOMAIN ?? "dhumal.com", prompt: "select_account" },
    },
  });
  // 303: the browser follows with a GET.
  return NextResponse.redirect(error || !data.url ? new URL("/login?error=google", origin) : data.url, 303);
}
