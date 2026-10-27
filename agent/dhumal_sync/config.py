"""Loads agent/config.toml. Credentials live only in that file on the office machine."""
from __future__ import annotations

import tomllib
from dataclasses import dataclass, field
from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PATH = AGENT_DIR / "config.toml"
STATE_DIR = AGENT_DIR / "state"


@dataclass
class SapConfig:
    base_url: str
    user: str
    password: str
    companies: list[str] = field(default_factory=list)
    ca_file: str = ""
    page_size: int = 100            # documents per Service Layer page
    page_delay_ms: int = 200        # pause between pages, to keep load on SAP low


@dataclass
class CloudConfig:
    ingest_url: str = ""
    heartbeat_url: str = ""
    api_key: str = ""


@dataclass
class ScheduleConfig:
    interval_minutes: int = 15
    office_start: str = "07:00"
    office_end: str = "21:00"
    full_refresh_at: str = "02:00"
    heartbeat_minutes: int = 5
    recent_days: int = 60           # re-read window for entities without UpdateDate


@dataclass
class Config:
    sap: SapConfig
    cloud: CloudConfig
    schedule: ScheduleConfig


def load(path: Path = DEFAULT_PATH) -> Config:
    if not path.exists():
        raise SystemExit(f"Missing {path}. Copy config.example.toml to config.toml and fill it in.")
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    return Config(
        sap=SapConfig(**data["sap"]),
        cloud=CloudConfig(**data.get("cloud", {})),
        schedule=ScheduleConfig(**data.get("schedule", {})),
    )
