"""One sync cycle: read each registered entity from the Service Layer and push it to the sink."""
from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from urllib.parse import quote

from .checkpoint import Checkpoint
from .registry import ENTITIES, Entity, shape
from .sink import Sink
from .sl import ServiceLayer

log = logging.getLogger(__name__)


@dataclass
class EntityResult:
    entity: str
    records: int = 0
    seconds: float = 0.0
    skipped: bool = False
    error: str | None = None


@dataclass
class CycleResult:
    company: str
    full: bool
    started_at: datetime
    finished_at: datetime | None = None
    entities: list[EntityResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(e.error is None for e in self.entities)

    def payload(self) -> dict:
        return {
            "type": "cycle", "company": self.company, "full": self.full, "ok": self.ok,
            "started_at": self.started_at.isoformat(timespec="seconds"),
            "finished_at": self.finished_at.isoformat(timespec="seconds") if self.finished_at else None,
            "entities": [e.__dict__ for e in self.entities],
        }


class Progress:
    """Tells the dashboard how far a cycle is. Nothing here may ever stop the sync itself.

    An entity's total is unknown until it has been read, so the percentage counts finished entities, each
    weighted by how long it took last time. It stays below 100 until the cycle is really finished.
    """
    TICK_SECONDS = 15   # during a long entity, still say "alive" this often

    def __init__(self, sink: Sink, company: str, entities: list[Entity], durations: dict[str, float]):
        self.sink, self.company = sink, company
        self.weights = {e.name: max(durations.get(e.name, 1.0), 0.2) for e in entities}
        self.total = sum(self.weights.values()) or 1.0
        self.done = 0.0
        self.entity: str | None = None
        self.sent_at = 0.0

    @property
    def percent(self) -> int:
        return min(99, int(100 * self.done / self.total))

    def _report(self, state: str) -> None:
        self.sent_at = time.monotonic()
        report_progress(self.sink, self.company, state, percent=self.percent, entity=self.entity)

    def start(self) -> None:
        self._report("start")

    def begin(self, entity: str) -> None:
        self.entity = entity
        self._report("running")

    def tick(self) -> None:
        if time.monotonic() - self.sent_at >= self.TICK_SECONDS:
            self._report("running")

    def finished(self, entity: str) -> None:
        self.done += self.weights[entity]


def report_progress(sink: Sink, company: str, state: str, **fields) -> None:
    try:
        sink.report({"type": "progress", "company": company, "state": state, **fields})
    except Exception as e:
        log.warning("Progress not reported: %s", e)


def plan_query(entity: Entity, watermark: str | None, full: bool, today: date,
               recent_days: int) -> dict:
    """Builds the OData query for this run of an entity."""
    if entity.params:  # query-defined snapshot (e.g. $crossjoin): always the full, fixed query
        return dict(entity.params)
    params = {"$select": entity.select, "$orderby": f"{entity.key} asc"}
    filters = [f"({entity.filter})"] if entity.filter else []
    if not full and watermark:
        if entity.mode == "updated":
            filters.append(f"UpdateDate ge {watermark}")
        elif entity.mode == "recent":
            since = (today - timedelta(days=recent_days)).isoformat()
            filters.append(f"({entity.key} gt {watermark} or {entity.date_field} ge {since})")
    if filters:
        params["$filter"] = " and ".join(filters)
    return params


def next_watermark(entity: Entity, records: Iterable[dict], current: str | None) -> str | None:
    """Updated: latest UpdateDate seen (the same day is re-read next time). Recent: highest DocEntry."""
    if entity.mode == "updated":
        dates = [r["UpdateDate"][:10] for r in records if r.get("UpdateDate")]
        return max([*dates, *([current] if current else [])], default=None)
    if entity.mode == "recent":
        entries = [int(r[entity.key]) for r in records] + ([int(current)] if current else [])
        return str(max(entries)) if entries else None
    return None


def entry_filter(prefix: str, entries: list[int]) -> str:
    """OData filter for a set of DocEntries: a range when they are (nearly) contiguous, else an OR list."""
    lo, hi = min(entries), max(entries)
    if hi - lo + 1 <= 2 * len(entries):
        return f"{prefix}/DocEntry ge {lo} and {prefix}/DocEntry le {hi}"
    return "(" + " or ".join(f"{prefix}/DocEntry eq {e}" for e in sorted(entries)) + ")"


def entry_chunks(prefix: str, entries: list[int], max_len: int = 1000) -> list[str]:
    """Filters covering the sorted DocEntries, each short enough, once URL-encoded, to stay inside the Service
    Layer's 2,048-character query limit together with $expand and $orderby."""
    chunks: list[list[int]] = []
    current: list[int] = []
    for e in entries:
        if current and len(quote(entry_filter(prefix, [*current, e]))) > max_len:
            chunks.append(current)
            current = [e]
        else:
            current.append(e)
    if current:
        chunks.append(current)
    return [entry_filter(prefix, c) for c in chunks]


def fetch_lines(sl: ServiceLayer, entity: Entity, headers: list[dict]) -> None:
    """Attaches entity.crossjoin_child lines to each header, reading only the registered line fields."""
    child = entity.crossjoin_child
    by_entry = {int(h["DocEntry"]): h for h in headers}
    for h in headers:
        h[child] = []
    if not by_entry:
        return
    coll, lines = entity.path, f"{entity.path}/{child}"
    for chunk_filter in entry_chunks(coll, sorted(by_entry)):
        params = {
            "$expand": f"{coll}($select=DocEntry),{lines}($select={','.join(entity.children[child])})",
            "$filter": f"{coll}/DocEntry eq {lines}/DocEntry and {chunk_filter}",
            # A fixed order keeps paging stable; without it pages can repeat or skip lines.
            "$orderby": f"{coll}/DocEntry,{lines}/LineNum",
        }
        seen: set[tuple[int, int]] = set()
        for page in sl.pages(f"$crossjoin({coll},{lines})", params, page_size=500):
            for row in page:
                entry, line = int(row[coll]["DocEntry"]), row[lines]
                if (entry, line.get("LineNum")) in seen:
                    continue
                seen.add((entry, line.get("LineNum")))
                header = by_entry.get(entry)
                if header is not None:
                    header[child].append(line)


def _with_last(pages: Iterator[list[dict]]) -> Iterator[tuple[list[dict], bool]]:
    """Yields (page, is_last) so the final batch of a snapshot can be flagged."""
    prev = next(pages, None)
    if prev is None:
        yield [], True
        return
    for page in pages:
        yield prev, False
        prev = page
    yield prev, True


def run_entity(sl: ServiceLayer, sink: Sink, cp: Checkpoint, company: str, entity: Entity,
               full: bool, now: datetime, recent_days: int, fresh: bool = False,
               on_page: Callable[[], None] = lambda: None) -> EntityResult:
    result = EntityResult(entity.name)
    if entity.mode == "snapshot" and entity.every_minutes and not (full or fresh):
        last = cp.last_run(company, entity.name)
        if last and now - last < timedelta(minutes=entity.every_minutes):
            result.skipped = True
            return result

    started = time.monotonic()
    watermark = cp.get(company, entity.name)
    params = plan_query(entity, watermark, full, now.date(), recent_days)
    is_full = full or entity.mode == "snapshot" or not watermark
    snapshot = {"id": str(uuid.uuid4())} if entity.mode == "snapshot" else None
    new_mark = watermark
    first = True

    for page, last in _with_last(sl.pages(entity.path, params, entity.page_size)):
        if entity.crossjoin_child:
            fetch_lines(sl, entity, page)
        records = [shape(entity, r) for r in page]
        sink.send({
            "type": "batch", "company": company, "entity": entity.name, "key": entity.key,
            "first": first, "full": is_full,
            "snapshot": {**snapshot, "final": last} if snapshot else None,
            "records": records,
        })
        first = False
        result.records += len(records)
        new_mark = next_watermark(entity, records, new_mark)
        if result.records and result.records % 5000 < len(records):
            log.info("%-22s %6d records so far", entity.name, result.records)
        on_page()

    # Only after every batch was accepted.
    if new_mark and new_mark != watermark:
        cp.set(company, entity.name, new_mark)
    cp.mark_run(company, entity.name, now)
    result.seconds = round(time.monotonic() - started, 1)
    return result


def run_cycle(sl: ServiceLayer, sink: Sink, cp: Checkpoint, company: str, full: bool,
              recent_days: int, only: set[str] | None = None, fresh: bool = False) -> CycleResult:
    """`fresh` (someone pressed "Sync now") also re-reads snapshots that are not due yet, such as stock."""
    cycle = CycleResult(company, full, datetime.now())
    entities = [e for e in ENTITIES if not only or e.name in only]
    progress = Progress(sink, company, entities, cp.durations(company))
    progress.start()
    for entity in entities:
        progress.begin(entity.name)
        try:
            res = run_entity(sl, sink, cp, company, entity, full, cycle.started_at, recent_days, fresh, progress.tick)
        except Exception as e:  # one failing entity must not stop the others
            log.exception("Sync of %s failed", entity.name)
            res = EntityResult(entity.name, error=f"{type(e).__name__}: {e}"[:500])
        if not res.skipped:
            log.info("%-22s %6d records %6.1fs%s", entity.name, res.records, res.seconds,
                     f"  ERROR {res.error}" if res.error else "")
            if not res.error:
                cp.set_duration(company, entity.name, res.seconds)
        cycle.entities.append(res)
        progress.finished(entity.name)
    cycle.finished_at = datetime.now()
    sink.send(cycle.payload())
    report_progress(sink, company, "done", ok=cycle.ok)
    return cycle
