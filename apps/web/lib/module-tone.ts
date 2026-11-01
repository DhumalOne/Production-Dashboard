// Which colour (globals.css, m-*) belongs to an address. Quotations lead to sales, so they share its colour.
const TONES: [prefix: string, tone: string][] = [
  ["/sales", "m-sales"],
  ["/quotations", "m-sales"],
  ["/customers", "m-sales"],
  ["/money", "m-money"],
  ["/stock", "m-stock"],
  ["/purchase", "m-buy"],
  ["/production", "m-make"],
];

export function moduleTone(path: string): string {
  return TONES.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))?.[1] ?? "";
}
