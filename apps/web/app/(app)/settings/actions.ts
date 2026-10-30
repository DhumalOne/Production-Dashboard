"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dbWeb } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";

/** Turns the Claude API on or off for everyone; the layout (Ask box) and Home (briefing) re-render with it. */
export async function setAiEnabled(enabled: boolean) {
  const { email } = await requireUser();
  const sql = await dbWeb();
  await sql`select app.set_ai_enabled(${enabled === true}, ${email})`;
  revalidatePath("/", "layout");
}

/** scope "global" ends the session on every device (PRD §2: "Sign out of all devices"). */
export async function signOut(scope: "local" | "global") {
  await requireUser();
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope });
  redirect("/login");
}
