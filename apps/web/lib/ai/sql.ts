import "server-only";
import postgres from "postgres";

// Runs SQL written by the model (PRD §5). Defence in depth:
//   1. one statement, SELECT/WITH only (checked here)
//   2. READ ONLY transaction, 10 s statement timeout, 500-row cap (enforced here)
//   3. login role dash_ai: SELECT on the rpt reporting views only (enforced by Postgres)

export const ROW_CAP = 500;
const TIMEOUT = "10s";

declare global {
  var __dbAi: postgres.Sql | undefined;
}

export function dbAi(): postgres.Sql {
  if (!process.env.DATABASE_URL_AI) throw new Error("DATABASE_URL_AI is not set");
  return (globalThis.__dbAi ??= postgres(process.env.DATABASE_URL_AI, {
    max: 3,
    idle_timeout: 20,
    prepare: false,
    types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } },
  }));
}

export class SqlRejected extends Error {}

/** Returns the statement without a trailing semicolon, or throws SqlRejected with a reason the model can act on. */
export function checkSql(raw: string): string {
  const sql = raw.trim().replace(/;\s*$/, "").trim();
  if (!sql) throw new SqlRejected("Empty query.");
  if (sql.includes(";")) throw new SqlRejected("Send exactly one statement, without semicolons.");
  if (!/^(select|with)\b/i.test(sql)) throw new SqlRejected("Only SELECT queries (optionally starting with WITH) are allowed.");
  const code = stripStrings(sql);
  // Writes would fail anyway (read-only transaction, SELECT-only role); this gives the model a clear reason.
  const verb = code.match(/\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|copy|call|lock|vacuum|refresh)\b/i);
  if (verb) throw new SqlRejected(`"${verb[1]}" is not allowed: only read-only SELECT queries.`);
  if (/\bselect\b[\s\S]*?\binto\b/i.test(code)) throw new SqlRejected("SELECT ... INTO is not allowed.");
  return sql;
}

function stripStrings(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  ms: number;
}

export async function runReadOnly(raw: string): Promise<QueryResult> {
  const sql = checkSql(raw);
  const db = dbAi();
  const started = Date.now();
  const rows = await db.begin("read only", async (tx) => {
    await tx.unsafe(`set local statement_timeout = '${TIMEOUT}'`);
    return tx.unsafe(`select * from (${sql}) as answer limit ${ROW_CAP + 1}`);
  });
  const list = Array.from(rows as Iterable<Record<string, unknown>>).map(plain);
  return {
    columns: rows.columns?.map((c) => c.name) ?? Object.keys(list[0] ?? {}),
    rows: list.slice(0, ROW_CAP),
    truncated: list.length > ROW_CAP,
    ms: Date.now() - started,
  };
}

/** JSON-safe values (dates as YYYY-MM-DD, bigints as numbers). */
function plain(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "bigint" ? Number(v) : v;
  }
  return out;
}
