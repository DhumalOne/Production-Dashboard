import type { SyncStatus } from "@/lib/queries/home";

const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const dayTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** "Last synced HH:MM": amber after 30 minutes, red after 2 hours (PRD §4.1). */
export function SyncStamp({ status, now }: { status: SyncStatus; now: Date }) {
  if (!status.lastSyncAt) {
    return <span className="rounded-full bg-bad-soft px-3 py-1 text-[12px] text-bad">Not synced yet</span>;
  }
  const ageMin = (now.getTime() - status.lastSyncAt.getTime()) / 60_000;
  const sameDay = ageMin < 12 * 60;
  const text = `Last synced ${(sameDay ? time : dayTime).format(status.lastSyncAt)}`;
  const tone = ageMin > 120 || status.ok === false ? "bg-bad-soft text-bad" : ageMin > 30 ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted";
  return (
    <span className={`num rounded-full px-3 py-1 text-[12px] ${tone}`}>
      {ageMin > 120 && <span aria-hidden>⚠ </span>}
      {text}
      {status.ok === false && " (with errors)"}
    </span>
  );
}
