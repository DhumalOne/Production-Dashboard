"""Checks every registered entity's field list against the live Service Layer (one record each).

Run before a long load:  .venv\\Scripts\\python -m discovery.check_registry
"""
from __future__ import annotations

import sys

from dhumal_sync import config
from dhumal_sync.registry import ENTITIES
from dhumal_sync.sl import ServiceLayer, ServiceLayerError
from dhumal_sync.sync import fetch_lines


def main() -> int:
    cfg = config.load()
    bad = 0
    with ServiceLayer(cfg.sap, cfg.sap.companies[0]) as sl:
        for e in ENTITIES:
            params = dict(e.params) if e.params else {"$select": e.select}
            params["$top"] = "1"
            if e.filter:
                params["$filter"] = e.filter
            try:
                rows = sl.get(e.path, params, page_size=1).get("value", [])
                if e.crossjoin_child and rows:
                    fetch_lines(sl, e, rows)
                if e.transform and rows:
                    e.transform(rows[0])
                print(f"  OK    {e.name}")
            except ServiceLayerError as err:
                bad += 1
                print(f"  FAIL  {e.name}: {err}")
    print("All entities OK." if not bad else f"{bad} entit{'y' if bad == 1 else 'ies'} failed.")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
