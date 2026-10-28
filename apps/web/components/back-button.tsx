"use client";

import { useRouter } from "next/navigation";

/** "‹ Back" to the previous screen; falls back to `fallback` when the page was opened directly. */
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
            className="inline-flex h-11 items-center text-sm text-accent">
      ‹ Back
    </button>
  );
}
