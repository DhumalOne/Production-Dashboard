"""Local SQLite state: per-entity watermarks, snapshot run times and how long each entity took.

A watermark only moves forward after the cloud has accepted every batch of a run, so a
power cut or network drop simply repeats the last run.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path


class Checkpoint:
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.executescript("""
            CREATE TABLE IF NOT EXISTS watermark (
                company TEXT, entity TEXT, value TEXT, updated_at TEXT,
                PRIMARY KEY (company, entity));
            CREATE TABLE IF NOT EXISTS last_run (
                company TEXT, entity TEXT, ran_at TEXT,
                PRIMARY KEY (company, entity));
            CREATE TABLE IF NOT EXISTS duration (
                company TEXT, entity TEXT, seconds REAL,
                PRIMARY KEY (company, entity));
        """)

    def get(self, company: str, entity: str) -> str | None:
        row = self.db.execute("SELECT value FROM watermark WHERE company=? AND entity=?",
                              (company, entity)).fetchone()
        return row[0] if row else None

    def set(self, company: str, entity: str, value: str) -> None:
        self.db.execute("INSERT INTO watermark VALUES (?,?,?,?) ON CONFLICT(company, entity) "
                        "DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
                        (company, entity, value, datetime.now().isoformat(timespec="seconds")))
        self.db.commit()

    def last_run(self, company: str, entity: str) -> datetime | None:
        row = self.db.execute("SELECT ran_at FROM last_run WHERE company=? AND entity=?",
                              (company, entity)).fetchone()
        return datetime.fromisoformat(row[0]) if row else None

    def mark_run(self, company: str, entity: str, when: datetime) -> None:
        self.db.execute("INSERT INTO last_run VALUES (?,?,?) ON CONFLICT(company, entity) "
                        "DO UPDATE SET ran_at=excluded.ran_at",
                        (company, entity, when.isoformat(timespec="seconds")))
        self.db.commit()

    def durations(self, company: str) -> dict[str, float]:
        """Seconds each entity took last time, used to weight the progress percentage."""
        return dict(self.db.execute("SELECT entity, seconds FROM duration WHERE company=?", (company,)).fetchall())

    def set_duration(self, company: str, entity: str, seconds: float) -> None:
        self.db.execute("INSERT INTO duration VALUES (?,?,?) ON CONFLICT(company, entity) "
                        "DO UPDATE SET seconds=excluded.seconds", (company, entity, seconds))
        self.db.commit()

    def reset(self, company: str, entity: str | None = None) -> None:
        q, args = "WHERE company=?", [company]
        if entity:
            q, args = q + " AND entity=?", args + [entity]
        self.db.execute(f"DELETE FROM watermark {q}", args)
        self.db.execute(f"DELETE FROM last_run {q}", args)
        self.db.commit()
