import Link from "next/link";

/** Section tabs inside a bottom-nav tab, e.g. Money: Receivables · Payables · Cash & bank. */
export function SubNav({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <nav aria-label="Section" className="-mx-4 mt-1 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border">
        {items.map((i) => {
          const on = i.href === current;
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={on ? "page" : undefined}
                    className={`flex h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm ${
                      on ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-text"}`}>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const MONEY_TABS = [
  { href: "/money/receivables", label: "Receivables" },
  { href: "/money/payables", label: "Payables" },
  { href: "/money/cash", label: "Cash & bank" },
];

export const STOCK_TABS = [
  { href: "/stock", label: "Inventory" },
  { href: "/stock/orders", label: "Orders & dispatch" },
];

export const SALES_TABS = [
  { href: "/sales", label: "Overview" },
  { href: "/sales/items", label: "Trends" },
];
