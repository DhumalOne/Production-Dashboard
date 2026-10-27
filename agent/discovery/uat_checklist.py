"""Writes docs/uat-checklist.md with the dashboard's figures pre-filled for 5 test dates.

Accounts fills in the SAP report figure beside each one. Re-run after a re-sync to refresh:
    .venv\\Scripts\\python -m discovery.uat_checklist [postgres-url]
Reads the reporting views (rpt.*) - the same numbers the screens show.
"""
from __future__ import annotations

import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg

IST = ZoneInfo("Asia/Kolkata")

DB = sys.argv[1] if len(sys.argv) > 1 else "postgresql://postgres:postgres@127.0.0.1:55422/postgres"
OUT = Path(__file__).resolve().parents[2] / "docs" / "uat-checklist.md"
COMPANY = "DHUMAL_LIVE"

METRICS = [
    ("sale", "Sale", "Sales - A/R › Sales Reports › **Sales Analysis**: Invoices, by customer, posting date range, amounts without tax (credit memos deducted)"),
    ("order", "Orders", "Sales - A/R › Sales Reports › **Sales Analysis**: Orders, posting date range, without tax"),
    ("purchase", "Purchase", "Purchasing - A/P › Purchase Reports › **Purchase Analysis**: Invoices, posting date range, without tax (credit memos deducted)"),
    ("receipt", "Receipts", "Banking: **Incoming Payments** for the date range (all payment types), total"),
    ("payment", "Payments", "Banking: **Outgoing Payments** for the date range (all payment types), total"),
    ("production", "Production (OK value)", "Production: **Receipts from Production** for the date range, completed lines, total value"),
]


def fy_start(d: date) -> date:
    return date(d.year if d.month >= 4 else d.year - 1, 4, 1)


def inr(v: float | None) -> str:
    if v is None:
        return "—"
    s, n = ("−" if v < 0 else ""), round(abs(v))
    digits = str(n)
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return f"{s}₹{','.join(([head] if head else []) + groups + [tail]) if head or groups else tail}"


def test_dates(today: date) -> list[date]:
    last_month_end = today.replace(day=1) - timedelta(days=1)
    return [
        today - timedelta(days=1),                            # yesterday
        today - timedelta(days=7),                            # a week ago
        last_month_end,                                       # last month end
        (last_month_end.replace(day=1) - timedelta(days=1)),  # the month end before
        date(today.year if today.month >= 4 else today.year - 1, 3, 31),  # last financial year end
    ]


def main() -> None:
    with psycopg.connect(DB) as c:
        today = c.execute("select rpt.today()").fetchone()[0]
        last_sync = c.execute("select max(finished_at) from raw.sync_cycle where company = %s", (COMPANY,)).fetchone()[0]
        lines = [
            "# UAT checklist: dashboard vs SAP reports",
            "",
            f"Company DHUMAL_LIVE · dashboard figures generated {datetime.now(IST):%d %b %Y %H:%M} IST from data synced "
            f"{last_sync.astimezone(IST):%d %b %Y %H:%M} IST · regenerate with `agent: python -m discovery.uat_checklist`",
            "",
            "**How to use:** for each row, run the SAP report shown with the same dates, then write its total in the **SAP** column.",
            "A row passes when the difference is **₹0** (or explained, for example a document posted after the sync time).",
            "All amounts are **before GST**. Sale **excludes** the inter-company customers in `rpt.excluded_customer`, "
            "which is empty until Accounts signs off the list in [kpi-definitions.md](kpi-definitions.md).",
            "",
        ]
        for d in test_dates(today):
            ranges = [("Day", d, d), ("MTD", d.replace(day=1), d), ("YTD", fy_start(d), d)]
            lines += [f"## {d:%a %d %b %Y}", "", "| KPI | Range | Dashboard | SAP | Difference | OK? |", "|---|---|---|---|---|---|"]
            for key, label, _ in METRICS:
                for rname, start, end in ranges:
                    v = c.execute("select coalesce(sum(amount), 0) from rpt.kpi_daily where company = %s and metric = %s "
                                  "and day between %s and %s", (COMPANY, key, start, end)).fetchone()[0]
                    lines.append(f"| {label} | {rname} {start:%d %b}–{end:%d %b} | {inr(float(v))} | | | ☐ |")
            lines.append("")

        pos = c.execute("""select
            (select sum(balance) from rpt.v_receivable_aging where company = %(c)s),
            (select sum(balance) from rpt.v_payable_aging where company = %(c)s),
            (select sum(balance) from rpt.v_bank_cash where company = %(c)s and kind = 'bank'),
            (select sum(balance) from rpt.v_bank_cash where company = %(c)s and kind = 'cash'),
            (select sum(stock_value) from rpt.v_stock where company = %(c)s)""", {"c": COMPANY}).fetchone()
        lines += [
            f"## Position (balances as of the sync time; compare on {today:%d %b %Y})",
            "",
            "Balances can only be checked for **now**: past balances are not kept in the synced data.",
            "",
            "| KPI | SAP report | Dashboard | SAP | Difference | OK? |",
            "|---|---|---|---|---|---|",
            f"| Receivables | Sales - A/R › Sales Reports › **Customer Receivables Aging**, total | {inr(float(pos[0] or 0))} | | | ☐ |",
            f"| Payables | Purchasing - A/P › Purchase Reports › **Vendor Liabilities Aging**, total | {inr(float(pos[1] or 0))} | | | ☐ |",
            f"| Bank balance | Chart of Accounts / **Trial Balance**: accounts 1210… (pending sign-off of the list) | {inr(float(pos[2] or 0))} | | | ☐ |",
            f"| Cash balance | Chart of Accounts / **Trial Balance**: accounts 1211… | {inr(float(pos[3] or 0))} | | | ☐ |",
            f"| Inventory value | Inventory › Inventory Reports › **Inventory Audit Report** (or Inventory Valuation), total | {inr(float(pos[4] or 0))} | | | ☐ |",
            "",
            "## Where each KPI comes from in SAP",
            "",
            "| KPI | SAP report to compare with |",
            "|---|---|",
            *[f"| {label} | {how} |" for _, label, how in METRICS],
            "",
            "## Sign-off",
            "",
            "| Checked by | Date | Result |",
            "|---|---|---|",
            "| | | ☐ All rows match or are explained |",
            "",
        ]
    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {OUT} ({len(lines)} lines)")


if __name__ == "__main__":
    main()
