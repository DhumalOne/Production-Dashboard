import { timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { NextResponse, type NextRequest } from "next/server";
import type postgres from "postgres";
import { dbIngest } from "@/lib/db";

// The office sync agent posts here (outbound HTTPS from the office; nothing in the cloud can reach SAP).
// Body: JSON, usually gzipped, one of {type: "batch" | "cycle" | "heartbeat" | "poll" | "progress"} (see agent/dhumal_sync/sink.py).
// Auth: x-api-key must match one of INGEST_API_KEYS (comma-separated, so keys can be rotated).

export const maxDuration = 60;

const MAX_BODY_BYTES = 20 * 1024 * 1024;

function keyIsValid(given: string | null): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  return (process.env.INGEST_API_KEYS ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length >= 32)
    .some((k) => {
      const b = Buffer.from(k);
      return a.length === b.length && timingSafeEqual(a, b);
    });
}

export async function POST(request: NextRequest) {
  if (!keyIsValid(request.headers.get("x-api-key"))) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  let payload: unknown;
  try {
    let body = Buffer.from(await request.arrayBuffer());
    if (body.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "body too large" }, { status: 413 });
    }
    // The agent gzips; decompress unless the platform already did.
    if (request.headers.get("content-encoding")?.includes("gzip") && body[0] === 0x1f && body[1] === 0x8b) {
      body = gunzipSync(body, { maxOutputLength: 200 * 1024 * 1024 });
    }
    payload = JSON.parse(body.toString("utf8"));
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const type = (payload as { type?: unknown })?.type;
  if (type !== "batch" && type !== "cycle" && type !== "heartbeat" && type !== "poll" && type !== "progress") {
    return NextResponse.json({ error: "unknown payload type" }, { status: 400 });
  }

  try {
    const sql = dbIngest();
    const [row] = await sql`select raw.ingest(${sql.json(payload as postgres.JSONValue)}) as result`;
    return NextResponse.json(row.result);
  } catch (e) {
    console.error("ingest failed", e);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
