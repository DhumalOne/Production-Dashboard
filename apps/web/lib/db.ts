import "server-only";
import postgres from "postgres";

// Two connections with different database roles:
//   web    -> dash_web    : SELECT on the rpt schema only (screens, later the AI box uses its own role)
//   ingest -> dash_ingest : may only call raw.ingest()
// Both URLs come from the hosting provider's secret store, never from Git.

declare global {
  var __dbWeb: postgres.Sql | undefined;
  var __dbIngest: postgres.Sql | undefined;
}

function connect(url: string | undefined, name: string): postgres.Sql {
  if (!url) throw new Error(`${name} is not set`);
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    prepare: false, // works through Supabase's transaction pooler
    types: { numeric: { to: 1700, from: [1700], serialize: String, parse: Number } },
  });
}

export function dbWeb(): postgres.Sql {
  return (globalThis.__dbWeb ??= connect(process.env.DATABASE_URL_WEB, "DATABASE_URL_WEB"));
}

export function dbIngest(): postgres.Sql {
  return (globalThis.__dbIngest ??= connect(process.env.DATABASE_URL_INGEST, "DATABASE_URL_INGEST"));
}
