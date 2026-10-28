import re
from datetime import date
from urllib.parse import quote, urlencode

from dhumal_sync.registry import BY_NAME, shape
from dhumal_sync.sync import _with_last, entry_chunks, entry_filter, fetch_lines, next_watermark, plan_query

TODAY = date(2026, 10, 26)


def test_first_run_reads_everything():
    q = plan_query(BY_NAME["Invoices"], None, False, TODAY, 60)
    assert "$filter" not in q
    assert q["$orderby"] == "DocEntry asc"
    # Lines come separately through $crossjoin, so the header query must not pull all line fields.
    assert "DocumentLines" not in q["$select"]


def test_entry_filter_uses_range_or_list():
    assert entry_filter("Invoices", [5, 6, 7, 9]) == "Invoices/DocEntry ge 5 and Invoices/DocEntry le 9"
    assert entry_filter("Invoices", [1, 50, 900]) == \
        "(Invoices/DocEntry eq 1 or Invoices/DocEntry eq 50 or Invoices/DocEntry eq 900)"


def test_scattered_entries_fit_the_query_limit():
    # 28 Oct 2026: a day of changed purchase invoices made a 50-entry OR list exceed the 2,048-character limit.
    entity = BY_NAME["PurchaseInvoices"]
    coll, lines = entity.path, f"{entity.path}/DocumentLines"
    entries = list(range(1000, 21000, 100))  # 200 scattered DocEntries
    filters = entry_chunks(coll, entries)
    covered = [int(e) for f in filters for e in re.findall(r"eq (\d+)", f)]
    assert covered == entries
    for f in filters:
        query = urlencode({
            "$expand": f"{coll}($select=DocEntry),{lines}($select={','.join(entity.children['DocumentLines'])})",
            "$filter": f"{coll}/DocEntry eq {lines}/DocEntry and {f}",
            "$orderby": f"{coll}/DocEntry,{lines}/LineNum",
            "$top": 500,
        }, quote_via=quote)
        assert len(query) < 2048


def test_contiguous_entries_stay_one_range():
    assert entry_chunks("Invoices", list(range(1, 501))) == ["Invoices/DocEntry ge 1 and Invoices/DocEntry le 500"]


class FakeSL:
    def __init__(self, rows):
        self.rows, self.calls = rows, []

    def pages(self, path, params, page_size=None):
        self.calls.append((path, params))
        yield self.rows


def test_fetch_lines_attaches_only_selected_fields_to_headers():
    rows = [{"Invoices": {"DocEntry": 1}, "Invoices/DocumentLines": {"LineNum": 0, "ItemCode": "A"}},
            {"Invoices": {"DocEntry": 1}, "Invoices/DocumentLines": {"LineNum": 1, "ItemCode": "B"}},
            {"Invoices": {"DocEntry": 2}, "Invoices/DocumentLines": {"LineNum": 0, "ItemCode": "C"}}]
    sl = FakeSL(rows)
    headers = [{"DocEntry": 1}, {"DocEntry": 2}, {"DocEntry": 3}]
    fetch_lines(sl, BY_NAME["Invoices"], headers)
    assert [len(h["DocumentLines"]) for h in headers] == [2, 1, 0]
    path, params = sl.calls[0]
    assert path == "$crossjoin(Invoices,Invoices/DocumentLines)"
    assert "Invoices/DocumentLines($select=LineNum,ItemCode" in params["$expand"]
    assert "Invoices/DocEntry ge 1 and Invoices/DocEntry le 3" in params["$filter"]
    assert params["$orderby"] == "Invoices/DocEntry,Invoices/DocumentLines/LineNum"


def test_fetch_lines_drops_lines_repeated_across_pages():
    row = {"Invoices": {"DocEntry": 1}, "Invoices/DocumentLines": {"LineNum": 0, "ItemCode": "A"}}
    headers = [{"DocEntry": 1}]
    fetch_lines(FakeSL([row, row]), BY_NAME["Invoices"], headers)
    assert len(headers[0]["DocumentLines"]) == 1


def test_updated_entity_filters_on_watermark_day():
    q = plan_query(BY_NAME["Invoices"], "2026-10-25", False, TODAY, 60)
    assert q["$filter"] == "UpdateDate ge 2026-10-25"


def test_full_run_ignores_watermark():
    q = plan_query(BY_NAME["Invoices"], "2026-10-25", True, TODAY, 60)
    assert "$filter" not in q


def test_recent_entity_reads_new_and_last_n_days():
    q = plan_query(BY_NAME["IncomingPayments"], "14389", False, TODAY, 60)
    assert q["$filter"] == "(DocEntry gt 14389 or DocDate ge 2026-08-27)"


def test_recent_entity_uses_its_own_key_and_date_field():
    q = plan_query(BY_NAME["ProductionOrders"], "26119", False, TODAY, 60)
    assert q["$filter"] == "(AbsoluteEntry gt 26119 or PostingDate ge 2026-08-27)"
    assert next_watermark(BY_NAME["ProductionOrders"], [{"AbsoluteEntry": 26200}], "26119") == "26200"


def test_snapshot_keeps_static_filter_only():
    q = plan_query(BY_NAME["BPBalances"], "x", False, TODAY, 60)
    assert q["$filter"] == "(CurrentAccountBalance ne 0)"


def test_warehouse_stock_is_a_fixed_crossjoin_snapshot():
    e = BY_NAME["WarehouseStock"]
    q = plan_query(e, "x", False, TODAY, 60)
    assert e.path.startswith("$crossjoin(Items,") and "$select" not in q and "StandardAveragePrice" in q["$expand"]
    row = {"Items": {"ItemCode": "A1"},
           "Items/ItemWarehouseInfoCollection": {"WarehouseCode": "W1", "InStock": 5.0, "Committed": 0.0,
                                                 "Ordered": 0.0, "MinimalStock": 1.0, "StandardAveragePrice": 30.0}}
    assert shape(e, row) == {"Key": "A1|W1", "ItemCode": "A1", "WarehouseCode": "W1", "InStock": 5.0, "Committed": 0.0,
                             "Ordered": 0.0, "MinimalStock": 1.0, "StandardAveragePrice": 30.0}


def test_watermarks():
    inv = BY_NAME["Invoices"]
    recs = [{"UpdateDate": "2026-10-24T00:00:00Z"}, {"UpdateDate": "2026-10-26T00:00:00Z"}]
    assert next_watermark(inv, recs, "2026-10-25") == "2026-10-26"
    assert next_watermark(inv, [], "2026-10-25") == "2026-10-25"
    pay = BY_NAME["IncomingPayments"]
    assert next_watermark(pay, [{"DocEntry": 5}, {"DocEntry": 9}], "7") == "9"
    assert next_watermark(pay, [], None) is None


def test_with_last_flags_final_page_and_empty_sets():
    assert list(_with_last(iter([[1], [2], [3]]))) == [([1], False), ([2], False), ([3], True)]
    assert list(_with_last(iter([]))) == [([], True)]


def test_payment_totals():
    raw = {"DocEntry": 1, "CashSum": 100.0, "TransferSum": 50.0, "Cancelled": "tNO",
           "PaymentChecks": [{"CheckSum": 25.0, "Bank": "x"}], "PaymentCreditCards": [],
           "PaymentInvoices": [{"DocEntry": 7, "InvoiceType": "it_Invoice", "SumApplied": 120.0}],
           "PaymentAccounts": [], "Unwanted": "dropped"}
    rec = shape(BY_NAME["IncomingPayments"], raw)
    assert rec["Total"] == 175.0
    assert rec["OnAccount"] == 55.0
    assert "PaymentChecks" not in rec and "Unwanted" not in rec
    assert rec["PaymentInvoices"] == [{"DocEntry": 7, "InvoiceType": "it_Invoice", "SumApplied": 120.0}]
