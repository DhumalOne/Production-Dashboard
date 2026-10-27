"use client";

import { useEffect, useSyncExternalStore } from "react";

/** Registers the service worker (production builds only; dev uses fresh code every time). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** "Cached" label while offline: the page on screen is the last copy saved on this device (PRD §7). */
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-30 bg-warn-soft px-4 py-2 text-center text-sm text-warn">
      <span aria-hidden>⚠ </span>Offline: showing the last data loaded on this phone (cached). Numbers update when you reconnect.
    </div>
  );
}

/** Removes cached pages from this device (on sign-out), so business data does not stay behind. */
export async function clearOfflineCache() {
  try {
    navigator.serviceWorker?.controller?.postMessage("clear");
    if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch {
    // Nothing cached, or the browser blocks storage: nothing to clear.
  }
}
