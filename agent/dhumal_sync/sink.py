"""Where synced records go.

HttpSink posts gzipped JSON batches to the cloud ingest API (outbound HTTPS only).
FileSink writes the same batches to local JSONL files, for dry runs and debugging.

Batch payload:
    {"type": "batch", "company": ..., "entity": ..., "key": ...,
     "first": bool, "full": bool,                    # first batch of this run; run reads everything
     "snapshot": null | {"id": <uuid>, "final": bool}, "records": [...]}
For a snapshot, the cloud keeps only the records sent under the final snapshot id.
At the end of each cycle: {"type": "cycle", ...summary}.
"""
from __future__ import annotations

import gzip
import json
import logging
import time
from pathlib import Path
from typing import Protocol

import httpx

log = logging.getLogger(__name__)


class SinkError(RuntimeError):
    pass


class Sink(Protocol):
    def send(self, payload: dict) -> None: ...
    def heartbeat(self, payload: dict) -> None: ...
    def close(self) -> None: ...


class HttpSink:
    BACKOFF_SECONDS = (2, 5, 15, 30, 60)

    def __init__(self, ingest_url: str, heartbeat_url: str, api_key: str):
        if not (ingest_url and api_key):
            raise SystemExit("cloud.ingest_url and cloud.api_key must be set in config.toml (or use --dry-run).")
        self.ingest_url = ingest_url
        self.heartbeat_url = heartbeat_url
        self.http = httpx.Client(timeout=httpx.Timeout(120, connect=15),
                                 headers={"x-api-key": api_key, "User-Agent": "dhumal-sync"})

    def _post(self, url: str, payload: dict) -> None:
        body = gzip.compress(json.dumps(payload, separators=(",", ":"), default=str).encode())
        headers = {"Content-Type": "application/json", "Content-Encoding": "gzip"}
        for attempt, wait in enumerate((0, *self.BACKOFF_SECONDS)):
            if wait:
                log.warning("Cloud retry %d in %ss", attempt, wait)
                time.sleep(wait)
            try:
                r = self.http.post(url, content=body, headers=headers)
            except httpx.TransportError as e:
                log.warning("Cloud transport error: %r", e)
                continue
            if r.status_code < 300:
                return
            if r.status_code < 500 and r.status_code != 429:
                raise SinkError(f"Cloud rejected batch: HTTP {r.status_code} {r.text[:300]}")
        raise SinkError(f"Cloud unreachable after {len(self.BACKOFF_SECONDS)} retries")

    def send(self, payload: dict) -> None:
        self._post(self.ingest_url, payload)

    def heartbeat(self, payload: dict) -> None:
        if self.heartbeat_url:
            self._post(self.heartbeat_url, payload)

    def close(self) -> None:
        self.http.close()


class PgSink:
    """Development only: calls raw.ingest() on a Postgres database directly (e.g. local Supabase)."""

    def __init__(self, url: str):
        import psycopg  # optional dependency, only needed for this sink

        self.conn = psycopg.connect(url, autocommit=True)

    def send(self, payload: dict) -> None:
        self.conn.execute("select raw.ingest(%s::jsonb)", (json.dumps(payload, default=str),))

    def heartbeat(self, payload: dict) -> None:
        self.send(payload)

    def close(self) -> None:
        self.conn.close()


class FileSink:
    """Dry run: writes batches under state/out/<company>/<entity>.jsonl."""

    def __init__(self, root: Path):
        self.root = root

    def send(self, payload: dict) -> None:
        if payload["type"] != "batch":
            path = self.root / f"last_{payload['type']}.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
            return
        path = self.root / payload["company"] / f"{payload['entity']}.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        # A run that re-reads everything (snapshot or full load) starts the file afresh.
        restart = payload["first"] and (payload["full"] or payload["snapshot"])
        with path.open("w" if restart else "a", encoding="utf-8") as f:
            for rec in payload["records"]:
                f.write(json.dumps(rec, separators=(",", ":"), default=str) + "\n")

    def heartbeat(self, payload: dict) -> None:
        pass

    def close(self) -> None:
        pass
