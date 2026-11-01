import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Dhumal Dashboard" };

const ERRORS: Record<string, string> = {
  not_authorised: "This Google account is not authorised for the dashboard. Ask the dashboard administrator to add it.",
  google: "Google sign-in did not complete. Please try again.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Dhumal Dashboard</h1>
      <p className="mt-1 text-muted">Sign in once on this device. You stay signed in for 90 days.</p>

      <Suspense>
        <ErrorNote searchParams={searchParams} />
      </Suspense>

      <form method="post" action="/auth/google" className="mt-8">
        <button className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-border bg-surface font-medium hover:bg-surface-2">
          <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Sign in with Google
        </button>
      </form>
      <p className="mt-2 text-center text-[13px] text-muted">Use your @dhumal.com account.</p>

      {/* Emailed codes need a mail server; EMAIL_CODES=off (set at build time) shows Google only. */}
      {process.env.EMAIL_CODES !== "off" && (
        <details className="mt-8 text-sm">
          <summary className="flex h-11 cursor-pointer items-center text-muted">Other ways to sign in</summary>
          <LoginForm />
        </details>
      )}
    </main>
  );
}

async function ErrorNote({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const e = (await searchParams).error;
  const message = typeof e === "string" ? ERRORS[e] : undefined;
  return message ? <p role="alert" className="mt-4 rounded-lg bg-bad-soft p-3 text-sm text-bad">{message}</p> : null;
}
