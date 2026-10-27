import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every page request and sends signed-out visitors to /login.
// This is only an optimistic check; pages and actions re-check with requireUser() (lib/auth.ts).

const PUBLIC = ["/login"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() asks the Auth server, so "Sign out of all devices" takes effect on the next request.
  // (getClaims() only checks the token signature, which stays valid until the token expires.)
  const { data } = await supabase.auth.getUser();
  const signedIn = !!data?.user;
  const isPublic = PUBLIC.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (signedIn && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  // Not for the agent's ingest API, static files, the manifest, icons or the service worker.
  matcher: ["/((?!api/ingest|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"],
};
