import { NextResponse, type NextRequest } from "next/server";
import { isAllowed } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

// Google sends the user back here. Exchange the one-time code for a session, then enforce the allow list:
// a valid Google account that is not on ALLOWED_EMAILS is signed straight out again.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // SITE_URL in production: behind Caddy, request.url holds the container's own address (0.0.0.0:3000).
  const to = (path: string) => NextResponse.redirect(new URL(path, process.env.SITE_URL || url.origin));
  if (!code) return to("/login?error=google");

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return to("/login?error=google");

  if (!isAllowed(data.user.email)) {
    await supabase.auth.signOut({ scope: "local" });
    return to("/login?error=not_authorised");
  }
  return to("/");
}
