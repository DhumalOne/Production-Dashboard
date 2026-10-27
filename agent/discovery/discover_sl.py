"""Read-only discovery through the SAP B1 Service Layer.

Run from the agent folder:  .venv\\Scripts\\python -m discovery.discover_sl
Uses the agent's guarded client, so only GET (plus POST Login / Logout) can be sent.
Writes discovery/output/report_sl.md (gitignored).
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

from dhumal_sync import config
from dhumal_sync.config import SapConfig
from dhumal_sync.sl import ServiceLayer, ServiceLayerError

OUT = Path(__file__).resolve().parent / "output"

# Service Layer collection -> SAP table, for counts and date ranges.
DOCS = {
    "Invoices": "OINV", "CreditNotes": "ORIN", "Quotations": "OQUT", "Orders": "ORDR",
    "DeliveryNotes": "ODLN", "PurchaseInvoices": "OPCH", "PurchaseCreditNotes": "ORPC",
    "PurchaseOrders": "OPOR", "IncomingPayments": "ORCT", "VendorPayments": "OVPM",
    "ProductionOrders": "OWOR", "InventoryGenEntries": "OIGN",
}
MASTERS = {"BusinessPartners": "OCRD", "Items": "OITM", "SalesPersons": "OSLP",
           "ItemGroups": "OITB", "Warehouses": "OWHS", "ChartOfAccounts": "OACT",
           "JournalEntries": "OJDT"}
UDF_TABLES = ["OWOR", "WOR1", "OIGN", "IGN1", "OITM", "OINV", "INV1"]


class ReadOnlyClient:
    """Convenience wrapper over the guarded ServiceLayer client for one-off scripts."""

    def __init__(self, user: str, password: str, company: str):
        cfg = config.load().sap
        self.sl = ServiceLayer(SapConfig(**{**cfg.__dict__, "user": user, "password": password}), company)
        try:
            self.sl.login()
        except ServiceLayerError as e:
            raise SystemExit(str(e))

    def get(self, path: str, **params) -> dict:
        return self.sl.get(path, params or None, page_size=500)

    def all(self, path: str, **params) -> list[dict]:
        return [r for page in self.sl.pages(path, params or None, page_size=500) for r in page]

    def count(self, coll: str, flt: str | None = None) -> str:
        try:
            return str(self.sl.count(coll, flt))
        except ServiceLayerError as e:
            return f"error {e}"[:80]

    def first(self, coll: str, field: str, desc: bool) -> str:
        try:
            v = self.get(coll, **{"$select": field, "$orderby": f"{field} {'desc' if desc else 'asc'}",
                                  "$top": "1"})["value"]
            return (v[0].get(field) or "")[:10] if v else ""
        except ServiceLayerError as e:
            return f"error {e}"[:80]

    def close(self):
        self.sl.close()


def table(rows: list, headers: list[str]) -> str:
    if not rows:
        return "_none_\n"
    lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
    lines += ["| " + " | ".join("" if v is None else str(v) for v in r) + " |" for r in rows]
    return "\n".join(lines) + "\n"


def main() -> None:
    cfg = config.load()
    company = cfg.sap.companies[0]
    sl = ReadOnlyClient(cfg.sap.user, cfg.sap.password, company)
    md = [f"# SAP B1 discovery (Service Layer), {datetime.now():%Y-%m-%d %H:%M}\n",
          f"Company DB: `{company}`, user `{cfg.sap.user}`\n"]
    def documents() -> str:
        rows = []
        for coll, t in DOCS.items():
            date_field = "PostingDate" if t == "OWOR" else "DocDate"
            rows.append((t, coll, sl.count(coll), sl.first(coll, date_field, False),
                         sl.first(coll, date_field, True), sl.first(coll, "UpdateDate", True)))
            print(f"  {t}: {rows[-1][2]}")
        return table(rows, ["table", "collection", "rows", "first date", "last date", "last update"])

    def masters() -> str:
        rows = []
        for c, t in MASTERS.items():
            rows.append((t, c, sl.count(c)))
            print(f"  {t}: {rows[-1][2]}")
        return table(rows, ["table", "collection", "rows"])

    def cash_accounts() -> str:
        accts = sl.all("ChartOfAccounts", **{"$select": "Code,Name,Balance,CashAccount,ActiveAccount,FormatCode",
                                             "$filter": "CashAccount eq 'tYES'"})
        return table([(a["Code"], a["Name"], a.get("Balance"), a.get("FormatCode"), a.get("ActiveAccount"))
                      for a in accts], ["Code", "Name", "Balance", "FormatCode", "Active"])

    def named_accounts() -> str:
        named = sl.all("ChartOfAccounts", **{"$select": "Code,Name,Balance,CashAccount,ActiveAccount",
                                             "$filter": "contains(Name,'Bank') or contains(Name,'BANK') or "
                                                        "contains(Name,'Cash') or contains(Name,'CASH')"})
        return table([(a["Code"], a["Name"], a.get("Balance"), a.get("CashAccount"), a.get("ActiveAccount"))
                      for a in named], ["Code", "Name", "Balance", "CashAccount", "Active"])

    def udfs() -> str:
        flt = " or ".join(f"TableName eq '{t}'" for t in UDF_TABLES)
        rows = sl.all("UserFieldsMD", **{"$select": "TableName,Name,Description,Type", "$filter": flt})
        return table(sorted((u["TableName"], f"U_{u['Name']}", u.get("Description"), u.get("Type")) for u in rows),
                     ["table", "field", "description", "type"])

    def item_groups() -> str:
        return table([(g["Number"], g["GroupName"]) for g in
                      sl.all("ItemGroups", **{"$select": "Number,GroupName"})], ["code", "name"])

    def salespersons() -> str:
        return table([(s["SalesEmployeeCode"], s["SalesEmployeeName"], s.get("Active")) for s in
                      sl.all("SalesPersons", **{"$select": "SalesEmployeeCode,SalesEmployeeName,Active"})],
                     ["code", "name", "active"])

    def warehouses() -> str:
        return table([(w["WarehouseCode"], w["WarehouseName"]) for w in
                      sl.all("Warehouses", **{"$select": "WarehouseCode,WarehouseName"})], ["code", "name"])

    def intercompany() -> str:
        return table([(b["CardCode"], b["CardName"], b.get("CardType")) for b in
                      sl.all("BusinessPartners", **{"$select": "CardCode,CardName,CardType",
                                                    "$filter": "contains(CardName,'Dhumal') or contains(CardName,'DHUMAL')"})],
                     ["CardCode", "CardName", "type"])

    sections = [
        ("Documents", documents),
        ("Master data", masters),
        ("Cash / bank GL accounts (CashAccount = tYES)", cash_accounts),
        ("Accounts with 'bank' or 'cash' in the name (to cross-check)", named_accounts),
        ("User-defined fields", udfs),
        ("Item groups", item_groups),
        ("Salespersons", salespersons),
        ("Warehouses", warehouses),
        ("Business partners named 'Dhumal' (inter-company candidates)", intercompany),
    ]
    try:
        for title, fn in sections:
            print(title)
            md.append(f"\n## {title}\n")
            try:
                md.append(fn())
            except (ServiceLayerError, KeyError) as e:
                detail = str(e)[:300]
                md.append(f"_error: {detail}_\n")
                print(f"  error: {detail}")
    finally:
        sl.close()

    OUT.mkdir(exist_ok=True)
    (OUT / "report_sl.md").write_text("\n".join(md), encoding="utf-8")
    print(f"Report: {OUT / 'report_sl.md'}")


if __name__ == "__main__":
    sys.exit(main())
