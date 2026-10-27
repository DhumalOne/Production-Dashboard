import Link from "next/link";
import { Suspense } from "react";
import { OpenItems } from "@/components/aging-screens";

export const metadata = { title: "Open invoices · Dhumal Dashboard" };

export default function CustomerPage({ params }: PageProps<"/money/receivables/[card]">) {
  return (
    <main className="mx-auto max-w-4xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/money/receivables" className="inline-flex h-11 items-center text-sm text-accent">‹ Receivables</Link>
      <Suspense fallback={<div className="mt-2 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body params={params} />
      </Suspense>
    </main>
  );
}

async function Body({ params }: { params: PageProps<"/money/receivables/[card]">["params"] }) {
  return <OpenItems side="receivable" card={decodeURIComponent((await params).card)} />;
}
