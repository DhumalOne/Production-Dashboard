import { Suspense } from "react";
import { aiEnabled } from "@/lib/ai/switch";
import { requireUser } from "@/lib/auth";
import { AiSwitch } from "./ai-switch";
import { SignOutButtons } from "./sign-out";
import { ThemeChoicePicker } from "./theme-choice";

export const metadata = { title: "Settings · Dhumal Dashboard" };

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Settings</h1>
      <section className="mt-4 rounded-xl border border-border bg-surface p-4" aria-label="Account">
        <Suspense fallback={<p className="h-6" />}>
          <Account />
        </Suspense>
        <SignOutButtons />
      </section>
      <section className="mt-4 rounded-xl border border-border bg-surface p-4" aria-label="Theme">
        <ThemeChoicePicker />
      </section>
      <section className="mt-4 rounded-xl border border-border bg-surface p-4" aria-label="AI">
        <Suspense fallback={<p className="h-16" />}>
          <Ai />
        </Suspense>
      </section>
    </main>
  );
}

async function Ai() {
  await requireUser();
  return <AiSwitch enabled={await aiEnabled()} />;
}

async function Account() {
  const { email } = await requireUser();
  return <p className="text-sm">Signed in as <span className="font-medium">{email}</span></p>;
}
