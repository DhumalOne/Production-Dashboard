"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Every module is one tap away (no "More" menu). Icons are 24px line drawings.
const MODULES = [
  { href: "/", label: "Home", group: "", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/sales", label: "Sales", group: "Sales", icon: "M4 19V9m6 10V5m6 14v-7m4 7H2" },
  { href: "/money/receivables", label: "Receivables", group: "Money", icon: "M12 3v12m0 0-4-4m4 4 4-4M4 21h16" },
  { href: "/money/payables", label: "Payables", group: "Money", icon: "M12 15V3m0 0L8 7m4-4 4 4M4 21h16" },
  { href: "/money/cash", label: "Cash & bank", group: "Money", icon: "M3 7h18v10H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6 10v4m12-4v4" },
  { href: "/stock", label: "Inventory", group: "Stock", icon: "M3 8l9-5 9 5v8l-9 5-9-5zM3 8l9 5 9-5M12 13v8" },
  { href: "/stock/orders", label: "Orders", group: "Stock", icon: "M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18a2 2 0 1 0 0-.01M17 18a2 2 0 1 0 0-.01" },
  { href: "/purchase", label: "Purchase", group: "Operations", icon: "M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6M9 20h.01M17 20h.01" },
  { href: "/quotations", label: "Quotations", group: "Operations", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" },
  { href: "/production", label: "Production", group: "Operations", icon: "M3 21V10l6 4V10l6 4V6l6 4v11zM7 17h2m4 0h2" },
  { href: "/settings", label: "Settings", group: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" },
];

/** The module whose address is the longest match for the current page ("/stock/orders" beats "/stock"). */
function activeHref(pathname: string): string {
  if (pathname === "/" || !pathname) return pathname === "/" ? "/" : "";
  const hits = MODULES.filter((m) => m.href !== "/" && (pathname === m.href || pathname.startsWith(m.href + "/")));
  return hits.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "";
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function BottomNav() {
  return <BottomNavView pathname={usePathname()} />;
}

export function SideNav() {
  return <SideNavView pathname={usePathname()} />;
}

/** Phone: all modules in one bar that scrolls sideways; the current one is scrolled into view. */
export function BottomNavView({ pathname }: { pathname: string }) {
  const current = activeHref(pathname);
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);
  return (
    <nav aria-label="Modules" className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="flex snap-x overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MODULES.map((m) => {
          const on = m.href === current;
          return (
            <li key={m.href} className="snap-start">
              <Link href={m.href} ref={on ? activeRef : undefined} aria-current={on ? "page" : undefined}
                    className={`flex h-14 min-w-[76px] flex-col items-center justify-center gap-0.5 px-2 text-[12px] whitespace-nowrap ${on ? "text-accent" : "text-muted"}`}>
                <Icon d={m.icon} />
                {m.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Fade at the right edge: there are more modules to swipe to. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface" />
    </nav>
  );
}

/** Desktop: every module listed, grouped. */
export function SideNavView({ pathname }: { pathname: string }) {
  const current = activeHref(pathname);
  const groups = [...new Set(MODULES.map((m) => m.group))];
  return (
    <nav aria-label="Modules" className="sticky top-0 hidden h-dvh w-56 shrink-0 overflow-y-auto border-r border-border bg-surface px-3 py-5 md:block">
      <p className="px-3 pb-4 text-lg font-semibold">Dhumal</p>
      {groups.map((g) => (
        <div key={g || "top"} className="mb-3">
          {g && <p className="px-3 pb-1 text-[12px] font-medium uppercase tracking-wide text-muted">{g}</p>}
          <ul className="space-y-0.5">
            {MODULES.filter((m) => m.group === g).map((m) => {
              const on = m.href === current;
              return (
                <li key={m.href}>
                  <Link href={m.href} aria-current={on ? "page" : undefined}
                        className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm ${on ? "bg-accent-soft font-medium text-accent" : "text-text hover:bg-surface-2"}`}>
                    <Icon d={m.icon} />
                    {m.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
