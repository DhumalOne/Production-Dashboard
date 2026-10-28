import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DataList } from "@/components/data-list";
import { PeriodPicker } from "@/components/period-picker";
import { MONEY_TABS, SubNav } from "@/components/sub-nav";
import { formatINR } from "@/lib/format";
import { readPeriod, todayIST } from "@/lib/period";
import { bankCashAccounts, paymentsByParty, paymentsByType, type Account, type PartyPayment } from "@/lib/queries/money";

export const metadata = { title: "Cash & bank · Dhumal Dashboard" };

const TYPE_LABEL: Record<string, string> = { rCustomer: "Customers", rSupplier: "Vendors", rAccount: "GL accounts (transfers, expenses)" };

export default function CashPage({ searchParams }: PageProps<"/money/cash">) {
  return (
    <main className="mx-auto max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold">Money</h1>
      <SubNav items={MONEY_TABS} current="/money/cash" />
      <Suspense fallback={<div className="mt-4 h-64 animate-pulse rounded-xl bg-surface" />}>
        <Balances />
      </Suspense>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-xl bg-surface" />}>
        <Flows searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Balances() {
  const accounts = await bankCashAccounts();
  const sum = (k: Account["kind"]) => accounts.filter((a) => a.kind === k).reduce((s, a) => s + a.balance, 0);
  const bank = sum("bank"), cash = sum("cash");
  return (
    <section className="mt-4" aria-label="Bank and cash balances">
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {[["Bank", bank], ["Cash", cash], ["Total liquidity", bank + cash]].map(([label, v]) => (
          <div key={label as string} className="bg-surface p-3">
            <p className="text-[12px] text-muted">{label}</p>
            <p className={`num text-lg font-semibold ${(v as number) < 0 ? "text-bad" : ""}`}>{formatINR(v as number)}</p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        Accounts with codes 1210… are treated as bank and 1211… as cash, until Accounts confirms the list.
        Negative balances are overdraft or cash-credit accounts.
      </p>
      <div className="mt-3">
        <DataList<Account> rows={accounts} columns={[
          { label: "Account", cell: (a) => a.name },
          { label: "Type", cell: (a) => (a.kind === "bank" ? "Bank" : "Cash") },
          { label: "Balance", cell: (a) => <span className={a.balance < 0 ? "text-bad" : ""}>{formatINR(a.balance)}</span>, align: "right" },
        ]} />
      </div>
    </section>
  );
}

async function Flows({ searchParams }: { searchParams: PageProps<"/money/cash">["searchParams"] }) {
  const sp = await searchParams;
  const dir = sp.dir === "out" ? "out" : "in";
  await connection();
  const { key, asOf, today, period, params } = readPeriod(sp, todayIST());
  const all = sp.all === "1";
  const [data, types] = await Promise.all([paymentsByParty(dir, period, all ? 5000 : 100), paymentsByType(dir, period)]);
  const keep = { dir, ...params };
  const cut = !all && data.rows.length === 100;
  const word = dir === "in" ? { title: "Receipts", party: "Received from" } : { title: "Payments", party: "Paid to" };
  return (
    <section className="mt-8" aria-label={word.title}>
      <div className="flex flex-wrap items-center gap-2">
        {(["in", "out"] as const).map((d) => (
          <Link key={d} href={`/money/cash?${new URLSearchParams({ ...keep, dir: d })}`} scroll={false} aria-current={d === dir ? "true" : undefined}
                className={`flex h-11 items-center rounded-lg px-4 text-sm ${d === dir ? "bg-accent-soft font-medium text-accent" : "bg-surface"}`}>
            {d === "in" ? "Receipts" : "Payments"}
          </Link>
        ))}
      </div>
      <div className="mt-3"><PeriodPicker value={{ key, asOf }} today={today} range={period} /></div>
      <div className="mt-3 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-muted">{word.title}, {period.label.toLowerCase()}</p>
        <p className="num text-3xl font-semibold">{formatINR(data.total)}</p>
        <p className="num text-sm text-muted">On account (not applied to an invoice): {formatINR(data.onAccount)}</p>
        <ul className="num mt-3 space-y-1 text-[13px]">
          {types.map((t) => (
            <li key={t.payType} className="flex justify-between gap-3">
              <span className="text-muted">{TYPE_LABEL[t.payType] ?? t.payType}</span><span>{formatINR(t.total)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-3">
        <DataList<PartyPayment> rows={data.rows}
          totalLabel={cut ? "Total (all)" : "Total"}
          showAll={cut ? { href: `/money/cash?${new URLSearchParams({ ...keep, all: "1" })}` } : undefined}
          columns={[
            { label: word.party, cell: (r) => r.name || r.key },
            { label: dir === "in" ? "Customer code" : "Vendor code", cell: (r) => <span className="num">{r.key}</span>, wide: true },
            { label: "Type", cell: (r) => TYPE_LABEL[r.payType]?.split(" ")[0] ?? r.payType, wide: true },
            { label: "Payments", cell: (r) => String(r.count), align: "right", wide: true },
            { label: "On account", cell: (r) => formatINR(r.onAccount), align: "right", total: formatINR(data.onAccount) },
            { label: "Amount", cell: (r) => formatINR(r.total), align: "right", total: formatINR(data.total) },
          ]} />
      </div>
    </section>
  );
}
