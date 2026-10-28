"""What is synced from the Service Layer, which fields, and how.

Modes
- updated:  incremental on UpdateDate/CreationDate (documents, business partners, items).
- recent:   entities with no UpdateDate (payments). New ones by DocEntry, plus a re-read of the
            last `recent_days` by DocDate to pick up cancellations.
- snapshot: the full (filtered) set is re-sent and the cloud drops anything not seen. Used for
            values that change without UpdateDate moving: open balances, GL balances, stock.

The nightly full refresh re-reads every entity from scratch.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

Mode = Literal["updated", "recent", "snapshot"]


@dataclass(frozen=True)
class Entity:
    name: str                                   # name stored in the cloud
    path: str                                   # Service Layer collection
    key: str
    mode: Mode
    fields: tuple[str, ...]
    children: dict[str, tuple[str, ...]] = field(default_factory=dict)  # nested collections to keep
    filter: str = ""                            # static filter (snapshots)
    every_minutes: int = 0                      # snapshot cadence in office hours; 0 = every cycle
    page_size: int | None = None
    derive: Callable[[dict], None] | None = None
    # Child collection fetched separately through $crossjoin, which can select only the line fields
    # needed (selecting DocumentLines on the header returns all ~290 line fields: ~13x more data).
    crossjoin_child: str = ""
    # For query-defined entities (e.g. a $crossjoin): fixed OData params used instead of $select/$orderby,
    # and a function that turns one result row into a flat record.
    params: dict[str, str] | None = None
    transform: Callable[[dict], dict] | None = None
    # "recent" mode: the date field re-read for the last N days (new records come by key > watermark).
    date_field: str = "DocDate"

    @property
    def select(self) -> str:
        return ",".join((*self.fields, *(c for c in self.children if c != self.crossjoin_child)))


DOC_FIELDS = ("DocEntry", "DocNum", "DocDate", "DocDueDate", "TaxDate", "CardCode", "CardName",
              "SalesPersonCode", "DocumentsOwner", "DocTotal", "VatSum", "TotalDiscount", "DiscountPercent",
              "RoundingDiffAmount", "PaidToDate", "DocumentStatus", "Cancelled", "CancelStatus",
              "DocCurrency", "DocRate", "CreationDate", "UpdateDate")
LINE_FIELDS = ("LineNum", "ItemCode", "ItemDescription", "Quantity", "MeasureUnit", "InventoryQuantity",
               "Price", "UnitPrice", "DiscountPercent", "LineTotal", "TaxTotal", "GrossBuyPrice",
               "WarehouseCode", "SalesPersonCode", "LineStatus", "RemainingOpenQuantity", "OpenAmount",
               "ShipDate", "BaseType", "BaseEntry", "BaseLine")

PAY_FIELDS = ("DocEntry", "DocNum", "DocDate", "DueDate", "CardCode", "CardName", "DocType",
              "CashSum", "TransferSum", "CashAccount", "TransferAccount", "CheckAccount",
              "Cancelled", "DocCurrency", "Remarks", "BPLID")
PAY_CHILDREN = {
    "PaymentInvoices": ("DocEntry", "InvoiceType", "SumApplied"),
    "PaymentAccounts": ("AccountCode", "SumPaid"),
    "PaymentChecks": ("CheckSum",),
    "PaymentCreditCards": ("CreditSum",),
}


def _payment_totals(rec: dict) -> None:
    """Total paid = cash + transfer + cheques + cards; on-account = total - applied to documents."""
    checks = sum(c.get("CheckSum") or 0 for c in rec.pop("PaymentChecks", []) or [])
    cards = sum(c.get("CreditSum") or 0 for c in rec.pop("PaymentCreditCards", []) or [])
    total = (rec.get("CashSum") or 0) + (rec.get("TransferSum") or 0) + checks + cards
    applied = sum(i.get("SumApplied") or 0 for i in rec.get("PaymentInvoices") or [])
    rec["CheckSumTotal"] = round(checks, 2)
    rec["CreditSumTotal"] = round(cards, 2)
    rec["Total"] = round(total, 2)
    rec["OnAccount"] = round(total - applied, 2)


_WHS = "Items/ItemWarehouseInfoCollection"
WHS_FIELDS = ("Key", "ItemCode", "WarehouseCode", "InStock", "Committed", "Ordered", "MinimalStock",
              "StandardAveragePrice")


def _warehouse_row(row: dict) -> dict:
    w = row[_WHS]
    return {**w, "ItemCode": row["Items"]["ItemCode"], "Key": f"{row['Items']['ItemCode']}|{w['WarehouseCode']}"}


def _document(name: str, paid: bool = False) -> Entity:
    # PaidToDate only exists on invoices and credit memos; asking for it elsewhere is an HTTP 400.
    fields = DOC_FIELDS if paid else tuple(f for f in DOC_FIELDS if f != "PaidToDate")
    return Entity(name, name, "DocEntry", "updated", fields, {"DocumentLines": LINE_FIELDS},
                  page_size=200, crossjoin_child="DocumentLines")


ENTITIES: list[Entity] = [
    # Documents with lines
    _document("Invoices", paid=True),
    _document("CreditNotes", paid=True),
    _document("Quotations"),
    _document("Orders"),
    _document("DeliveryNotes"),
    _document("PurchaseInvoices", paid=True),
    _document("PurchaseCreditNotes", paid=True),
    _document("PurchaseOrders"),
    # Payments (no UpdateDate in the Service Layer)
    Entity("IncomingPayments", "IncomingPayments", "DocEntry", "recent", PAY_FIELDS, PAY_CHILDREN,
           derive=_payment_totals),
    Entity("VendorPayments", "VendorPayments", "DocEntry", "recent", PAY_FIELDS, PAY_CHILDREN,
           derive=_payment_totals),
    # Production (V9 Production Report). Receipts from production are InventoryGenEntries whose lines are based
    # on a production order (BaseType 202); TransactionType tells completed (OK) from rejected quantity.
    Entity("ProductionReceipts", "InventoryGenEntries", "DocEntry", "updated",
           ("DocEntry", "DocNum", "DocDate", "Comments", "CreationDate", "UpdateDate"),
           {"DocumentLines": ("LineNum", "ItemCode", "ItemDescription", "Quantity", "MeasureUnit", "Price",
                              "LineTotal", "WarehouseCode", "BaseType", "BaseEntry", "BaseLine",
                              "TransactionType", "U_Shift", "U_PRDOPERATOR", "U_SETUPOPERATOR", "U_Supervisor")},
           page_size=200, crossjoin_child="DocumentLines"),
    # Goods issues: material leaving stock, mostly issues for production (BaseType 202). With deliveries this is
    # an item's usage, from which stock cover (days) is worked out.
    Entity("GoodsIssues", "InventoryGenExits", "DocEntry", "updated",
           ("DocEntry", "DocNum", "DocDate", "CreationDate", "UpdateDate"),
           {"DocumentLines": ("LineNum", "ItemCode", "Quantity", "MeasureUnit", "LineTotal", "WarehouseCode",
                              "BaseType", "BaseEntry")},
           page_size=200, crossjoin_child="DocumentLines"),
    Entity("ProductionOrders", "ProductionOrders", "AbsoluteEntry", "recent",
           ("AbsoluteEntry", "DocumentNumber", "ItemNo", "ProductDescription", "ProductionOrderStatus",
            "ProductionOrderType", "PlannedQuantity", "CompletedQuantity", "RejectedQuantity", "PostingDate",
            "DueDate", "Warehouse", "InventoryUOM"),
           page_size=500, date_field="PostingDate"),
    # Master data
    Entity("BusinessPartners", "BusinessPartners", "CardCode", "updated",
           ("CardCode", "CardName", "CardType", "GroupCode", "SalesPersonCode", "City", "Phone1",
            "CreditLimit", "PayTermsGrpCode", "Valid", "Frozen", "CreateDate", "UpdateDate"), page_size=500),
    Entity("Items", "Items", "ItemCode", "updated",
           ("ItemCode", "ItemName", "ItemsGroupCode", "InventoryUOM", "SalesUnit", "MinInventory",
            "InventoryItem", "SalesItem", "PurchaseItem", "Valid", "Frozen", "U_MainGrp",
            "CreateDate", "UpdateDate"), page_size=500),
    Entity("SalesPersons", "SalesPersons", "SalesEmployeeCode", "snapshot",
           ("SalesEmployeeCode", "SalesEmployeeName", "Active"), every_minutes=60, page_size=500),
    Entity("ItemGroups", "ItemGroups", "Number", "snapshot", ("Number", "GroupName"),
           every_minutes=60, page_size=500),
    Entity("Warehouses", "Warehouses", "WarehouseCode", "snapshot", ("WarehouseCode", "WarehouseName"),
           every_minutes=60, page_size=500),
    # Balances that move without UpdateDate changing
    Entity("ChartOfAccounts", "ChartOfAccounts", "Code", "snapshot",
           ("Code", "Name", "FormatCode", "Balance", "CashAccount", "ActiveAccount", "AccountLevel",
            "FatherAccountKey", "AccountType"), page_size=500),
    Entity("BPBalances", "BusinessPartners", "CardCode", "snapshot",
           ("CardCode", "CardType", "CurrentAccountBalance", "OpenOrdersBalance", "OpenDeliveryNotesBalance"),
           filter="CurrentAccountBalance ne 0", page_size=500),
    # Stock is valued per warehouse in this company (item-level AvgStdPrice is 0), so read item-warehouse rows.
    Entity("WarehouseStock", f"$crossjoin(Items,{_WHS})", "Key", "snapshot", WHS_FIELDS,
           params={
               "$expand": f"Items($select=ItemCode),{_WHS}($select={','.join(WHS_FIELDS[2:])})",
               "$filter": f"Items/ItemCode eq {_WHS}/ItemCode and ({_WHS}/InStock ne 0 or {_WHS}/MinimalStock gt 0)",
               "$orderby": f"Items/ItemCode,{_WHS}/WarehouseCode",
           },
           transform=_warehouse_row, every_minutes=60, page_size=500),
]

BY_NAME = {e.name: e for e in ENTITIES}


def shape(entity: Entity, rec: dict) -> dict:
    """Keeps only the registered fields (and child fields) and adds derived values."""
    if entity.transform:
        rec = entity.transform(rec)
    out = {f: rec.get(f) for f in entity.fields}
    for child, child_fields in entity.children.items():
        out[child] = [{f: row.get(f) for f in child_fields} for row in rec.get(child) or []]
    if entity.derive:
        entity.derive(out)
    return out
