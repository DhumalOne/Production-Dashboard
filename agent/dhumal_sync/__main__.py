"""Dhumal sync agent.

    python -m dhumal_sync                 run forever on the schedule in config.toml
    python -m dhumal_sync --once          one incremental cycle, then exit
    python -m dhumal_sync --once --full   one full re-read of everything
    python -m dhumal_sync --dry-run ...   write to state/out/*.jsonl instead of the cloud
    python -m dhumal_sync --only Invoices,Orders --once
    python -m dhumal_sync --reset         forget watermarks (next run is a full load)
"""
from __future__ import annotations

import argparse
import logging
import socket
import threading
import time
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler

from . import config
from .checkpoint import Checkpoint
from .config import STATE_DIR, Config
from .registry import BY_NAME
from .sink import FileSink, HttpSink, PgSink, Sink
from .sl import ServiceLayer
from .sync import run_cycle

VERSION = "0.1.0"
log = logging.getLogger("dhumal_sync")


def setup_logging() -> None:
    (STATE_DIR / "logs").mkdir(parents=True, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
    file = RotatingFileHandler(STATE_DIR / "logs" / "sync.log", maxBytes=5_000_000, backupCount=10,
                               encoding="utf-8")
    console = logging.StreamHandler()
    for h in (file, console):
        h.setFormatter(fmt)
        logging.getLogger().addHandler(h)
    logging.getLogger().setLevel(logging.INFO)
    logging.getLogger("httpx").setLevel(logging.WARNING)


def _hm(s: str) -> tuple[int, int]:
    h, m = s.split(":")
    return int(h), int(m)


def in_office_hours(cfg: Config, now: datetime) -> bool:
    start, end = _hm(cfg.schedule.office_start), _hm(cfg.schedule.office_end)
    return start <= (now.hour, now.minute) < end


def cycle(cfg: Config, sink: Sink, cp: Checkpoint, full: bool, only: set[str] | None) -> bool:
    ok = True
    for company in cfg.sap.companies:
        log.info("%s cycle for %s", "Full" if full else "Incremental", company)
        with ServiceLayer(cfg.sap, company) as sl:
            result = run_cycle(sl, sink, cp, company, full, cfg.schedule.recent_days, only)
        secs = (result.finished_at - result.started_at).total_seconds()
        log.info("Cycle for %s %s in %.0fs", company, "OK" if result.ok else "WITH ERRORS", secs)
        ok &= result.ok
    return ok


def heartbeat_loop(cfg: Config, sink: Sink, state: dict, stop: threading.Event) -> None:
    while not stop.wait(cfg.schedule.heartbeat_minutes * 60):
        try:
            sink.heartbeat({"type": "heartbeat", "host": socket.gethostname(), "version": VERSION,
                            "at": datetime.now().isoformat(timespec="seconds"), **state})
        except Exception as e:
            log.warning("Heartbeat failed: %s", e)


def run_forever(cfg: Config, sink: Sink, cp: Checkpoint) -> None:
    state = {"last_cycle_at": None, "last_cycle_ok": None}
    stop = threading.Event()
    threading.Thread(target=heartbeat_loop, args=(cfg, sink, state, stop), daemon=True).start()
    interval = timedelta(minutes=cfg.schedule.interval_minutes)
    full_h, full_m = _hm(cfg.schedule.full_refresh_at)
    next_run = datetime.now()
    last_full_day = None
    log.info("Agent %s started; every %s in office hours, full refresh at %s",
             VERSION, interval, cfg.schedule.full_refresh_at)
    try:
        while True:
            now = datetime.now()
            due_full = (now.hour, now.minute) >= (full_h, full_m) and last_full_day != now.date() \
                and (now.hour, now.minute) < (full_h + 1, full_m)
            if due_full or (in_office_hours(cfg, now) and now >= next_run):
                try:
                    ok = cycle(cfg, sink, cp, full=due_full, only=None)
                except Exception:
                    log.exception("Cycle failed")
                    ok = False
                state.update(last_cycle_at=datetime.now().isoformat(timespec="seconds"), last_cycle_ok=ok)
                if due_full:
                    last_full_day = now.date()
                next_run = now + interval
            time.sleep(20)
    finally:
        stop.set()


def main() -> None:
    p = argparse.ArgumentParser(prog="dhumal_sync", description="Read-only SAP B1 -> cloud sync agent")
    p.add_argument("--once", action="store_true", help="run one cycle and exit")
    p.add_argument("--full", action="store_true", help="re-read everything, ignoring watermarks")
    p.add_argument("--dry-run", action="store_true", help="write to state/out instead of the cloud")
    p.add_argument("--db", metavar="URL", help="development: ingest straight into this Postgres database")
    p.add_argument("--only", help="comma-separated entity names")
    p.add_argument("--reset", action="store_true", help="forget watermarks for --only entities (or all)")
    args = p.parse_args()

    setup_logging()
    cfg = config.load()
    only = set(args.only.split(",")) if args.only else None
    if only and (unknown := only - BY_NAME.keys()):
        raise SystemExit(f"Unknown entities: {', '.join(sorted(unknown))}. Known: {', '.join(BY_NAME)}")

    state_db = STATE_DIR / ("dry_run.db" if args.dry_run else "dev_db.db" if args.db else "state.db")
    cp = Checkpoint(state_db)
    if args.reset:
        for company in cfg.sap.companies:
            for name in only or [None]:
                cp.reset(company, name)
        log.info("Watermarks reset")
        return

    if args.dry_run:
        sink: Sink = FileSink(STATE_DIR / "out")
    elif args.db:
        sink = PgSink(args.db)
    else:
        sink = HttpSink(cfg.cloud.ingest_url, cfg.cloud.heartbeat_url, cfg.cloud.api_key)
    try:
        if args.once:
            raise SystemExit(0 if cycle(cfg, sink, cp, args.full, only) else 1)
        run_forever(cfg, sink, cp)
    finally:
        sink.close()


if __name__ == "__main__":
    main()
