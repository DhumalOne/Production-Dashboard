import "server-only";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase/server";

/** Addresses allowed to sign in (ALLOWED_EMAILS, comma-separated). Changing it locks out anyone removed. */
export function allowedEmails(): string[] {
  return (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowed(email: string | null | undefined): boolean {
  return !!email && allowedEmails().includes(email.trim().toLowerCase());
}

/**
 * Every page and action that reads business data calls this first. proxy.ts only does an
 * optimistic redirect; this is the real check (valid session AND still on the allow list).
 */
export async function requireUser(): Promise<{ email: string }> {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email || !isAllowed(email)) redirect("/login");
  return { email };
}
