import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Change, KpiSkeleton, KpiTile } from "@/components/kpi";
import { PeriodPicker } from "@/components/period-picker";
import { SyncStamp } from "@/components/sync-stamp";
import { aiEnabled } from "@/lib/ai/switch";
import { morningBriefing, syncState } from "@/lib/briefing";
import { formatINR } from "@/lib/format";
import { readPeriod, resolvePeriod, todayIST } from "@/lib/period";
import { getAlerts, getKpis, getPosition, getSyncStatus } from "@/lib/queries/home";
import { productionTotals } from "@/lib/queries/production";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** `today` below is the as-of date (?d=, V9's "Date" cell); `realToday` is the actual date in India. */
async function periodFrom(searchParams: SP) {
  const sp = await searchParams;
  await connection();
  const { key, asOf, today: realToday, period, params } = readPeriod(sp, todayIST());
  return { key, today: asOf, realToday, period, params };
}

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Suspense fallback={<div className="h-28" />}>
        <Header searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<div className="mt-4 h-28 animate-pulse rounded-xl bg-surface" />}>
        <MorningBriefing searchParams={searchParams} />
      </Suspense>

      <section aria-labelledby="kpis" className="mt-4">
        <h2 id="kpis" className="sr-only">Key figures</h2>
        <Suspense fallback={<KpiGridSkeleton />}>
          <KpiGrid searchParams={searchParams} />
        </Suspense>
      </section>

      <section aria-labelledby="position" className="mt-6">
        <h2 id="position" className="text-base font-semibold">Position now</h2>
        <Suspense fallback={<div className="mt-2 h-24 animate-pulse rounded-xl bg-surface" />}>
          <PositionStrip searchParams={searchParams} />
        </Suspense>
      </section>

      <section aria-labelledby="attention" className="mt-6">
        <h2 id="attention" className="text-base font-semibold">Needs attention</h2>
        <Suspense fallback={<div className="mt-2 h-32 animate-pulse rounded-xl bg-surface" />}>
          <Attention />
        </Suspense>
      </section>
    </main>
  );
}

async function Header({ searchParams }: { searchParams: SP }) {
  const { key, today, realToday, period } = await periodFrom(searchParams);
  const status = await getSyncStatus();
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dhumal Industries</h1>
        <SyncStamp status={status} now={new Date()} />
      </div>
      <PeriodPicker value={{ key, asOf: today }} today={realToday} range={period} />
    </header>
  );
}

/** Three lines written from today's figures (lib/briefing.ts). Only for the real today, not a past as-of date. */
async function MorningBriefing({ searchParams }: { searchParams: SP }) {
  const { today, realToday } = await periodFrom(searchParams);
  if (today !== realToday) return null;
  const { lastSyncAt } = await getSyncStatus();
  if (!lastSyncAt) return null;
  const b = await morningBriefing(realToday, ...syncState(lastSyncAt), await aiEnabled());
  return (
    <section aria-labelledby="briefing" className="mt-4 rounded-xl border border-accent/30 bg-accent-soft p-4">
      <h2 id="briefing" className="text-[12px] font-medium uppercase tracking-wide text-accent">Today&rsquo;s briefing</h2>
      <ul className="mt-2 space-y-1.5 text-[15px] leading-snug">
        {b.lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <details className="mt-2 text-[13px] text-muted">
        <summary className="cursor-pointer select-none">{b.byAi ? "Written by AI from these figures" : "Figures"}</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">{b.facts.map((f) => <li key={f}>{f}</li>)}</ul>
      </details>
    </section>
  );
}

async function KpiGrid({ searchParams }: { searchParams: SP }) {
  const { key, today, realToday, period, params } = await periodFrom(searchParams);
  const kpis = await getKpis(period, today);
  const query = `?${new URLSearchParams(params)}`;
  const sale = kpis.find((k) => k.key === "sale")!;
  const short = {
    today: today === realToday ? "Today" : "Day", week: "Week", mtd: "MTD", qtd: "QTD", ytd: "YTD", custom: period.label,
  }[key];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface p-3">
        <div>
          <p className="text-sm text-muted">Sale MTD</p>
          <p className="num text-lg font-semibold">{formatINR(sale.mtd)}</p>
          <SaleGrowth which="mtd" today={today} />
        </div>
        <div>
          <p className="text-sm text-muted">Sale YTD</p>
          <p className="num text-lg font-semibold">{formatINR(sale.ytd)}</p>
          <SaleGrowth which="ytd" today={today} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {kpis.map((k) => <KpiTile key={k.key} kpi={k} periodLabel={short} query={query} />)}
      </div>
    </>
  );
}

async function SaleGrowth({ which, today }: { which: "mtd" | "ytd"; today: string }) {
  const [sale] = (await getKpis(resolvePeriod(which, today), today)).filter((k) => k.key === "sale");
  return <Change current={sale.period} previous={sale.periodPY} />;
}

async function PositionStrip({ searchParams }: { searchParams: SP }) {
  const { today, realToday } = await periodFrom(searchParams);
  const [p, production] = await Promise.all([getPosition(), productionTotals({ from: today, to: today })]);
  const items = [
    {
      label: today === realToday ? "Today’s production" : `Production ${today}`,
      value: production.okValue,
      href: `/production${today !== realToday ? `?d=${today}` : ""}`,
    },
    { label: "Receivables", value: p.receivables, href: "/money/receivables" },
    { label: "Payables", value: p.payables, href: "/money/payables" },
    { label: "Inventory", value: p.inventory, href: "/stock" },
    { label: "Bank", value: p.bank, href: "/money/cash" },
    { label: "Cash", value: p.cash, href: "/money/cash" },
    { label: "Total liquidity", value: p.liquidity, href: "/money/cash" },
  ];
  return (
    <ul className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4 lg:grid-cols-7">
      {items.map((i) => (
        <li key={i.label} className="bg-surface">
          <Link href={i.href} className="block p-3 hover:bg-surface-2">
            <p className="text-[12px] text-muted">{i.label}</p>
            <p className={`num text-base font-semibold ${i.value < 0 ? "text-bad" : ""}`}>{formatINR(i.value)}</p>
          </Link>
        </li>
      ))}
      {today !== realToday && (
        <li className="col-span-full bg-surface px-3 py-2 text-[12px] text-muted">
          Balances are as of now; SAP does not keep past balances in the synced data. Production is for {today}.
        </li>
      )}
    </ul>
  );
}

async function Attention() {
  const alerts = await getAlerts(3);
  if (alerts.length === 0) {
    return <p className="mt-2 rounded-xl border border-border bg-surface p-4 text-sm text-muted">Nothing needs attention right now.</p>;
  }
  return (
    <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {alerts.map((a) => (
        <li key={a.title}>
          <Link href={a.href} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{a.title}</p>
              <p className="text-sm text-muted">{a.detail}</p>
            </div>
            {a.amount != null && <span className="num shrink-0 font-semibold text-bad">{formatINR(a.amount)}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function KpiGridSkeleton() {
  return (
    <>
      <div className="h-24 animate-pulse rounded-xl border border-border bg-surface" />
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => <KpiSkeleton key={i} />)}
      </div>
    </>
  );
}
