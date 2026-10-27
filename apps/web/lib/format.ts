// Indian number formatting: ₹ with lakh / crore, Indian digit grouping.

const LAKH = 1e5;
const CRORE = 1e7;
const grouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function trim(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

/** ₹2.76 Cr, ₹45.2 L, ₹8,450. Negative values get a minus sign (never colour alone). */
export function formatINR(value: number | null | undefined, opts: { exact?: boolean } = {}): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (opts.exact || abs < LAKH) return `${sign}₹${grouping.format(Math.round(abs))}`;
  if (abs < CRORE) return `${sign}₹${trim(abs / LAKH, abs < 10 * LAKH ? 2 : 1)} L`;
  return `${sign}₹${trim(abs / CRORE, abs < 100 * CRORE ? 2 : 1)} Cr`;
}

/** 1,23,456.5 KGS */
export function formatQty(value: number | null | undefined, unit?: string | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const n = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
  return unit ? `${n} ${unit}` : n;
}

/** +12.4% / −3.1% / — when there is no base to compare with. */
export function formatChange(current: number, previous: number): { text: string; direction: "up" | "down" | "flat" | "none" } {
  if (!previous) return { text: "—", direction: "none" };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.05) return { text: "0.0%", direction: "flat" };
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`, direction: pct > 0 ? "up" : "down" };
}
