"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowed } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/** Sign in with Google: only @dhumal.com Google accounts are offered; /auth/callback checks the allow list. */
export async function signInWithGoogle(): Promise<void> {
  // SITE_URL in production; locally, the address this request came in on. Supabase only accepts
  // return addresses on its allow list, so a forged Host header cannot redirect elsewhere.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (/^(127\.0\.0\.1|localhost)(:|$)/.test(host) ? "http" : "https");
  const origin = process.env.SITE_URL || `${proto}://${host}`;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      queryParams: { hd: process.env.GOOGLE_WORKSPACE_DOMAIN ?? "dhumal.com", prompt: "select_account" },
    },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export type LoginState = { step: "email" | "code"; email?: string; error?: string; info?: string };

export async function sendCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!email.includes("@")) return { step: "email", error: "Enter your email address." };
  // Checked before anything is sent: other addresses never receive a code.
  if (!isAllowed(email)) return { step: "email", email, error: "This email is not authorised for the dashboard." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) {
    const wait = /seconds|rate/i.test(error.message);
    return { step: wait ? "code" : "email", email, error: wait ? "A code was sent recently. Check your email or wait a minute." : "Could not send the code. Try again in a minute." };
  }
  return { step: "code", email, info: `We emailed a 6-digit code to ${email}.` };
}

export async function verifyCode(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("code") ?? "").replace(/\D/g, "");
  if (!isAllowed(email)) return { step: "email", error: "This email is not authorised for the dashboard." };
  if (token.length !== 6) return { step: "code", email, error: "Enter the 6-digit code from the email." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "That code is wrong or has expired. Request a new one." };
  redirect("/");
}
