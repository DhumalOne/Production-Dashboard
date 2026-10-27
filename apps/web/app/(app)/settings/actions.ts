"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/** scope "global" ends the session on every device (PRD §2: "Sign out of all devices"). */
export async function signOut(scope: "local" | "global") {
  await requireUser();
  const supabase = await supabaseServer();
  await supabase.auth.signOut({ scope });
  redirect("/login");
}
