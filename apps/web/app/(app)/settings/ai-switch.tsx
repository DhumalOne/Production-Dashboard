"use client";

import { useState, useTransition } from "react";
import { setAiEnabled } from "./actions";

export function AiSwitch({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);
  const toggle = () => start(async () => {
    setError(false);
    try {
      await setAiEnabled(!enabled);
    } catch {
      setError(true);
    }
  });
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="ai-switch" className="text-sm font-medium">AI (Claude API)</h2>
          <p className="mt-1 text-[13px] text-muted">
            {enabled
              ? "On: the Ask box and the written morning briefing use the Claude API."
              : "Off: no Claude API calls. The Ask box is hidden and the briefing shows plain figures."}
            {" "}This applies to everyone.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={enabled} aria-labelledby="ai-switch" disabled={pending} onClick={toggle}
                className="flex h-11 shrink-0 items-center disabled:opacity-60">
          <span className={`flex h-6 w-11 items-center rounded-full p-0.5 transition-colors ${enabled ? "bg-accent" : "bg-border"}`}>
            <span className={`size-5 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : ""}`} />
          </span>
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-[13px] text-bad">Could not change this. Please try again.</p>}
    </>
  );
}
