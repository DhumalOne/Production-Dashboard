import { NextResponse } from "next/server";
import { isAllowed } from "@/lib/auth";
import { dbWeb } from "@/lib/db";
import { COMPANY } from "@/lib/queries/home";
import { supabaseServer } from "@/lib/supabase/server";

// "Sync now" on Home. POST leaves a request for the office agent, GET reads how far it is (agent/dhumal_sync).

async function signedInEmail(): Promise<string | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  return email && isAllowed(email) ? email : null;
}

async function status() {
  const sql = await dbWeb();
  const [row] = await sql`select app.sync_status(${COMPANY}) as status`;
  return row.status as Record<string, unknown>;
}

const respond = (body: unknown) => NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
const signIn = () => NextResponse.json({ error: "Please sign in again." }, { status: 401 });

export async function GET() {
  if (!(await signedInEmail())) return signIn();
  return respond(await status());
}

export async function POST() {
  const email = await signedInEmail();
  if (!email) return signIn();
  const sql = await dbWeb();
  const [{ result }] = await sql<{ result: string }[]>`select app.request_sync(${COMPANY}, ${email}) as result`;
  const now = await status();
  return respond(result === "offline" ? { ...now, state: "offline" } : now);
}
