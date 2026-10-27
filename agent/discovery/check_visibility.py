"""Compares what the sync user can see with the totals found during discovery (as manager, 26 Oct 2026).

Run from the agent folder:  .venv\\Scripts\\python -m discovery.check_visibility
To check a different SAP user than the one in config.toml:
    $env:CHECK_USER = 'DASHREAD'; $env:CHECK_PASSWORD = '...'; .venv\\Scripts\\python -m discovery.check_visibility
Small differences are expected (documents added since discovery); large gaps mean
branch or data-ownership authorizations are hiding records.
"""
from __future__ import annotations

import os
import sys

from dhumal_sync import config
from dhumal_sync.config import SapConfig
from dhumal_sync.sl import ServiceLayer, ServiceLayerError

DISCOVERY = {
    "Invoices": 21346, "CreditNotes": 921, "Quotations": 2, "Orders": 28542, "DeliveryNotes": 24320,
    "PurchaseInvoices": 25923, "PurchaseCreditNotes": 459, "PurchaseOrders": 12781,
    "IncomingPayments": 14389, "VendorPayments": 16905, "ProductionOrders": 26106,
    "InventoryGenEntries": 56785, "BusinessPartners": 9482, "Items": 18965, "ChartOfAccounts": 1392,
}


def main() -> int:
    cfg = config.load()
    if os.environ.get("CHECK_USER"):
        cfg.sap = SapConfig(**{**cfg.sap.__dict__, "user": os.environ["CHECK_USER"],
                               "password": os.environ.get("CHECK_PASSWORD", cfg.sap.password)})
    short = 0
    with ServiceLayer(cfg.sap, cfg.sap.companies[0]) as sl:
        print(f"{'collection':<22}{'discovery':>10}{cfg.sap.user:>10}   status")
        for coll, expected in DISCOVERY.items():
            try:
                n = sl.count(coll)
            except ServiceLayerError as e:
                print(f"{coll:<22}{expected:>10}{'error':>10}   {e}")
                short += 1
                continue
            ok = n >= expected * 0.99
            short += not ok
            print(f"{coll:<22}{expected:>10}{n:>10}   {'OK' if ok else 'MISSING ' + str(expected - n)}")
    print("\nAll visible." if not short else f"\n{short} collection(s) short.")
    return 1 if short else 0


if __name__ == "__main__":
    sys.exit(main())
