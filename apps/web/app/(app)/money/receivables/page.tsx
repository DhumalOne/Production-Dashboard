import { Suspense } from "react";
import { AgingIntro, AgingList, AgingTotals } from "@/components/aging-screens";
import { MONEY_TABS, SubNav } from "@/components/sub-nav";

export const metadata = { title: "Receivables · Dhumal Dashboard" };

export default function ReceivablesPage({ searchParams }: PageProps<"/money/receivables">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Money</h1>
      <SubNav items={MONEY_TABS} current="/money/receivables" />
      <div className="mt-3"><AgingIntro side="receivable" /></div>
      <Suspense fallback={<div className="mt-4 h-40 animate-pulse rounded-xl bg-surface" />}>
        <AgingTotals side="receivable" />
      </Suspense>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/money/receivables">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() || undefined : undefined;
  return <AgingList side="receivable" view={sp.view === "salesperson" ? "salesperson" : "party"} q={q} all={sp.all === "1"} />;
}
