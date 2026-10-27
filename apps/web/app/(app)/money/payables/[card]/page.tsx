import Link from "next/link";
import { Suspense } from "react";
import { OpenItems } from "@/components/aging-screens";

export const metadata = { title: "Open A/P invoices · Dhumal Dashboard" };

export default function VendorPage({ params }: PageProps<"/money/payables/[card]">) {
  return (
    <main className="mx-auto max-w-4xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Link href="/money/payables" className="inline-flex h-11 items-center text-sm text-accent">‹ Payables</Link>
      <Suspense fallback={<div className="mt-2 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Body params={params} />
      </Suspense>
    </main>
  );
}

async function Body({ params }: { params: PageProps<"/money/payables/[card]">["params"] }) {
  return <OpenItems side="payable" card={decodeURIComponent((await params).card)} />;
}
