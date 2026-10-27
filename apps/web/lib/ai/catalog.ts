import "server-only";
import { dbAi } from "./sql";

// The model sees only this description of the reporting views (PRD §5: "a catalogue of approved
// reporting views and their column meanings"), built from the COMMENTs in the migrations so the
// screens, the catalogue and the database stay in step.

let cached: { text: string; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function catalog(): Promise<string> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.text;
  const rows = await dbAi()<{ rel: string; kind: string; rel_desc: string | null; col: string; type: string; col_desc: string | null }[]>`
    select c.relname as rel, c.relkind::text as kind, obj_description(c.oid, 'pg_class') as rel_desc,
           a.attname as col, format_type(a.atttypid, a.atttypmod) as type,
           col_description(c.oid, a.attnum) as col_desc
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'rpt' and c.relkind in ('v', 'r', 'm')
      and has_table_privilege(c.oid, 'select')
    order by c.relname, a.attnum`;
  const byRel = new Map<string, { desc: string | null; cols: string[] }>();
  for (const r of rows) {
    const e = byRel.get(r.rel) ?? { desc: r.rel_desc, cols: [] };
    e.cols.push(`${r.col} ${shortType(r.type)}${r.col_desc ? ` -- ${r.col_desc}` : ""}`);
    byRel.set(r.rel, e);
  }
  const text = [...byRel.entries()]
    .map(([rel, e]) => `rpt.${rel}${e.desc ? `\n  -- ${e.desc}` : ""}\n  ${e.cols.join("\n  ")}`)
    .join("\n\n");
  cached = { text, at: Date.now() };
  return text;
}

function shortType(t: string): string {
  return t.replace("character varying", "text").replace("timestamp with time zone", "timestamptz");
}
