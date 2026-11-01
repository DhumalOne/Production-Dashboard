"use client";

import { usePathname } from "next/navigation";
import { moduleTone } from "@/lib/module-tone";

/** Gives everything inside a page the colour of its module. */
export function ModuleTheme({ children }: { children: React.ReactNode }) {
  return <div className={moduleTone(usePathname())}>{children}</div>;
}
