"use client";

import { useTransition } from "react";
import { signOut } from "./actions";

export function SignOutButtons() {
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
      <button type="button" disabled={pending} onClick={() => start(() => signOut("local"))}
              className="h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-60">
        Sign out of this device
      </button>
      <button type="button" disabled={pending}
              onClick={() => confirm("Sign out on every phone and computer? You will need a new code on each.") && start(() => signOut("global"))}
              className="h-11 rounded-lg border border-bad/40 px-4 text-sm text-bad disabled:opacity-60">
        Sign out of all devices
      </button>
    </div>
  );
}
