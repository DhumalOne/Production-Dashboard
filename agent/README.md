# Dhumal sync agent

This agent reads SAP Business One through the Service Layer and pushes the data to the dashboard's cloud database. It runs on a Windows PC on the office LAN and only makes outbound HTTPS calls, so no firewall port is opened.

## Read-only guarantee
The agent **cannot change SAP data**:
- Every HTTP request passes through `_read_only_guard` in [dhumal_sync/sl.py](dhumal_sync/sl.py) before it is sent. Only `GET`, and `POST` to `Login`/`Logout`, are allowed. Anything else raises `ReadOnlyViolation` and never leaves the machine. This includes PATCH, PUT, DELETE, document actions such as `Cancel`, `$batch` and saved-query creation.
- [tests/test_read_only.py](tests/test_read_only.py) proves this. Run it after any change to `sl.py`.
- The SAP user should be read-only as well. The intended user is `DASHREAD`. **It is temporarily `manager`** because DASHREAD's data-ownership authorizations hide owned documents. Switch back before go-live (see `discovery/NOTES.md`).

## Setup
```powershell
cd agent
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy config.example.toml config.toml   # then fill in SAP + cloud settings
# Only the service account and the admin should be able to read the credentials:
icacls config.toml /inheritance:r /grant:r "$env:USERDOMAIN\$env:USERNAME:(F)" "NT AUTHORITY\SYSTEM:(F)"
```

## Run
| Command | What it does |
|---|---|
| `.venv\Scripts\python -m dhumal_sync --dry-run --once` | One cycle into `state/out/*.jsonl` (no cloud needed) |
| `.venv\Scripts\python -m dhumal_sync --once` | One incremental cycle to the cloud |
| `.venv\Scripts\python -m dhumal_sync --once --full` | Re-read everything |
| `.venv\Scripts\python -m dhumal_sync --only Invoices,Orders --once` | Selected entities only |
| `.venv\Scripts\python -m dhumal_sync --reset` | Forget watermarks; the next run is a full load |
| `.venv\Scripts\python -m dhumal_sync` | Run forever on the schedule (used by the service). Also asks the cloud every `poll_seconds` whether someone pressed "Sync now" on Home, and reports each cycle's progress back; this is outbound HTTPS too |
| `.venv\Scripts\python -m pytest tests -q` | Unit tests |

**Schedule:**
- A cycle runs every 15 min between 07:00 and 21:00.
- A full refresh runs at 02:00.
- A heartbeat is sent every 5 min.
- Logs go to `state/logs/sync.log`.

## What is synced
[dhumal_sync/registry.py](dhumal_sync/registry.py) lists every entity and its fields. Each entity uses one of three modes:
- **updated**: documents, business partners and items. Read incrementally by `UpdateDate`.
- **recent**: incoming and vendor payments, which have no `UpdateDate` in the Service Layer. New payments are read by `DocEntry`, and the last 60 days are re-read to catch cancellations.
- **snapshot**: BP balances, GL balances and per-warehouse stock. These change without `UpdateDate` moving, so the whole (filtered) set is re-sent each time.

Two Service Layer details to know:
- **Document lines come through `$crossjoin`.** Selecting `DocumentLines` on a header returns all ~290 fields of every line (11.6 MB per 100 invoices). The cross-join returns only the registered line fields (0.9 MB), and it needs `$orderby` for stable paging.
- **Stock comes from item-warehouse rows** (`WarehouseStock`, also a cross-join). This company values stock per warehouse, so the item-level average price is 0.

Run `.venv\Scripts\python -m discovery.check_registry` after changing any field list. It reads one record per entity from SAP and catches invalid fields (HTTP 400) before a long run.

A watermark only moves forward after the cloud accepts every batch. After a crash or network drop, the agent repeats the last run.

## Windows service
`install_service.ps1` registers the agent as a service with NSSM. It starts automatically, restarts on failure and runs as LocalSystem. Run it from an elevated PowerShell on the office PC that will host the agent.
