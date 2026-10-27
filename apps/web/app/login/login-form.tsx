"use client";

import { useActionState } from "react";
import { sendCode, verifyCode, type LoginState } from "./actions";

const input =
  "mt-1 block h-12 w-full rounded-lg border border-border bg-surface px-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30";
const button =
  "mt-4 h-12 w-full rounded-lg bg-accent font-medium text-white disabled:opacity-60 dark:text-bg";

export function LoginForm() {
  const [sent, send, sending] = useActionState<LoginState, FormData>(sendCode, { step: "email" });
  const [checked, verify, verifying] = useActionState<LoginState, FormData>(verifyCode, { step: "code" });

  if (sent.step === "email") {
    return (
      <form action={send} className="mt-8">
        <label htmlFor="email" className="text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required
               defaultValue={sent.email} className={input} />
        {sent.error && <p role="alert" className="mt-2 text-sm text-bad">{sent.error}</p>}
        <button className={button} disabled={sending}>{sending ? "Sending…" : "Email me a code"}</button>
      </form>
    );
  }

  return (
    <form action={verify} className="mt-8">
      <input type="hidden" name="email" value={sent.email} />
      <p className="text-sm text-muted">{sent.info ?? `Code sent to ${sent.email}.`}</p>
      <label htmlFor="code" className="mt-4 block text-sm font-medium">6-digit code</label>
      <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*"
             maxLength={7} required autoFocus className={`${input} num tracking-[0.3em]`} />
      {(checked.error ?? sent.error) && (
        <p role="alert" className="mt-2 text-sm text-bad">{checked.error ?? sent.error}</p>
      )}
      <button className={button} disabled={verifying}>{verifying ? "Checking…" : "Sign in"}</button>
      <button type="button" onClick={() => location.reload()} className="mt-3 h-11 w-full text-sm text-accent">
        Use a different email or resend
      </button>
    </form>
  );
}
