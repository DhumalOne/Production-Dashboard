import { Suspense } from "react";
import { AgingIntro, AgingList, AgingTotals } from "@/components/aging-screens";
import { MONEY_TABS, SubNav } from "@/components/sub-nav";

export const metadata = { title: "Payables · Dhumal Dashboard" };

export default function PayablesPage({ searchParams }: PageProps<"/money/payables">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Money</h1>
      <SubNav items={MONEY_TABS} current="/money/payables" />
      <div className="mt-3"><AgingIntro side="payable" /></div>
      <Suspense fallback={<div className="mt-4 h-40 animate-pulse rounded-xl bg-surface" />}>
        <AgingTotals side="payable" />
      </Suspense>
      <Suspense fallback={<div className="mt-4 h-96 animate-pulse rounded-xl bg-surface" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/money/payables">["searchParams"] }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() || undefined : undefined;
  return <AgingList side="payable" view="party" q={q} all={sp.all === "1"} />;
}
