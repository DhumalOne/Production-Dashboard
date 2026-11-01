"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY, type ThemeChoice } from "@/lib/theme";

declare global {
  interface Window { __applyTheme?: () => void }
}

const CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system"; // Storage blocked: the theme simply follows the device.
  }
}

function choose(value: ThemeChoice) {
  try {
    if (value === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, value);
  } catch {
    return;
  }
  window.__applyTheme?.();
  listeners.forEach((l) => l());
}

export function ThemeChoicePicker() {
  const current = useSyncExternalStore(subscribe, read, () => "system");
  return (
    <>
      <h2 id="theme-choice" className="text-sm font-medium">Theme</h2>
      <p className="mt-1 text-[13px] text-muted">System follows this device&rsquo;s setting. Your choice applies on this device only.</p>
      <div role="radiogroup" aria-labelledby="theme-choice" className="mt-3 grid grid-cols-3 gap-2">
        {CHOICES.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={current === c.value} onClick={() => choose(c.value)}
                  className={`h-11 rounded-lg border text-sm font-medium ${current === c.value ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface"}`}>
            {c.label}
          </button>
        ))}
      </div>
    </>
  );
}
