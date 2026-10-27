"""Lists a user's SAP B1 General Authorizations, read through the Service Layer as an admin user.

Read-only: GET only (plus Login/Logout). The admin password comes from the
SAP_ADMIN_PASSWORD environment variable and is never stored.

Run from the agent folder:
    $env:SAP_ADMIN_PASSWORD = '...'; .venv\\Scripts\\python -m discovery.check_permissions DASHREAD
"""
from __future__ import annotations

import os
import sys
from collections import Counter

from dhumal_sync import config
from discovery.discover_sl import ReadOnlyClient

ADMIN_USER = "manager"


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    target = args[0] if args else "DASHREAD"
    password = os.environ.get("SAP_ADMIN_PASSWORD")
    if not password:
        raise SystemExit("Set SAP_ADMIN_PASSWORD first.")
    cfg = config.load()
    sl = ReadOnlyClient(ADMIN_USER, password, cfg.sap.companies[0])
    try:
        users = sl.get("Users", **{"$filter": f"UserCode eq '{target}'", "$select": "InternalKey"})["value"]
        if not users:
            raise SystemExit(f"User {target} not found.")
        # $select drops the UserPermission collection, so fetch the full record.
        user = sl.get(f"Users({users[0]['InternalKey']})")
        perms = user.get("UserPermission") or []
        # Human-readable names for the permission IDs.
        tree = {t["PermissionID"]: t.get("Name") or "" for t in
                sl.all("UserPermissionTree", **{"$select": "PermissionID,Name"})}
    finally:
        sl.close()

    print(f"{user['UserCode']} (InternalKey {user['InternalKey']}), Superuser: {user.get('Superuser')}")
    print("Counts:", dict(Counter(p["Permission"] for p in perms)))
    if "--all" in sys.argv:
        for level in ("boper_ReadOnly", "boper_None", "boper_Various"):
            ids = sorted(p["PermissionID"] for p in perms if p["Permission"] == level)
            print(f"\n{level} ({len(ids)}):")
            print("  " + ", ".join(f"{i}{' (' + tree[i] + ')' if tree.get(i) else ''}" for i in ids))
    full = [p for p in perms if p["Permission"] == "boper_Full"]
    print(f"\nFull authorization on {len(full)} item(s):")
    for p in sorted(full, key=lambda p: p["PermissionID"]):
        print(f"  {p['PermissionID']:<12} {tree.get(p['PermissionID'], '')}")
    return 1 if full or user.get("Superuser") == "tYES" else 0


if __name__ == "__main__":
    sys.exit(main())
