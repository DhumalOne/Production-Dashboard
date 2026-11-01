"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface SyncState {
  state: "idle" | "requested" | "running" | "offline";
  percent: number;
  entity: string | null;
  ok: boolean | null;
}

const OFFLINE = "The office sync agent is not responding, so no sync was started.";

/** "Sync now": asks the office agent for a sync, then shows its progress. Also shows a scheduled sync already running. */
export function SyncButton() {
  const router = useRouter();
  const [sync, setSync] = useState<SyncState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const wasActive = useRef(false);
  const active = sync?.state === "running" || sync?.state === "requested";
  // Until the agent takes the request, the stored percent is still the last sync's 100.
  const percent = sync?.state === "running" ? sync.percent : 0;

  function apply(next: SyncState) {
    const nowActive = next.state === "running" || next.state === "requested";
    if (wasActive.current && !nowActive) {
      setMessage(next.state === "offline" ? OFFLINE : next.ok === false ? "The sync finished with errors." : null);
      router.refresh(); // new figures and "Last synced" time
    } else if (next.state === "offline") {
      setMessage(OFFLINE);
    } else if (nowActive) {
      setMessage(null);
    }
    wasActive.current = nowActive;
    setSync(next);
  }
  const applyLatest = useRef(apply);
  useEffect(() => {
    applyLatest.current = apply;
  });

  useEffect(() => {
    const read = async () => {
      try {
        const res = await fetch("/api/sync");
        if (res.ok) applyLatest.current(await res.json());
      } catch {
        // Offline or a brief network drop: the next read tries again.
      }
    };
    read();
    const timer = setInterval(read, active ? 2000 : 30_000);
    return () => clearInterval(timer);
  }, [active]);

  async function start() {
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      if (!res.ok) throw new Error();
      apply(await res.json());
    } catch {
      setMessage("Could not reach the server. Please try again.");
    }
  }

  return (
    <>
      {active ? (
        <div role="progressbar" aria-label="Sync progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
             title={sync.entity ?? undefined}
             className="relative flex h-11 w-36 items-center justify-center overflow-hidden rounded-full border border-border bg-surface text-sm">
          <span className="absolute inset-y-0 left-0 bg-accent/25 transition-[width] duration-500" style={{ width: `${percent}%` }} />
          <span className="num relative font-medium">{sync.state === "requested" ? "Starting…" : `Syncing ${percent}%`}</span>
        </div>
      ) : (
        <button type="button" onClick={start} className="h-11 rounded-full border border-border bg-surface px-4 text-sm font-medium">
          Sync now
        </button>
      )}
      {message && <p role="alert" className="w-full text-right text-[12px] text-bad">{message}</p>}
    </>
  );
}
