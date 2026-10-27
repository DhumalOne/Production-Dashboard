# Roadmap: V9 workbook → new dashboard

Each sheet of "Dhumal Management Dashboard V9" (last data Feb 2016) and the screen that replaces it. Status as of 27 Oct 2026 (local build, not yet deployed).

| V9 sheet | Screen | Status |
|---|---|---|
| Main Page | Home (with as-of date) | **Built**, including today's production. Company filter waits on Q-MD-2 |
| Sales Dashboard | Sales › Overview (salesperson, customer, item, item group, with share and last year) | **Built** |
| Sales Trend | Sales › Trends (every salesperson × 6 months; top 50 items × 6 months with sale, price after discount, discount %) | **Built** |
| Quotation Dashboard | Quotations (by salesperson, item, customer with contribution %) | **Built**. SAP has only 2 quotations (Q-ACC-7) |
| Purchase Dashboard | Purchase (vendor, item with price after discount, buyer; open POs with overdue) | **Built** |
| Purchase Trend | Purchase (buyers, top 5 vendors, top 10 items × 6 months with price after discount) | **Built** |
| Receipt MTD / Payment MTD | Money › Cash & bank (receipts by customer, payments by vendor, on-account, split by payment type) | **Built** |
| Receivable Aging | Money › Receivables (customer, salesperson, open items) | **Built**, with estimated buckets (Q-IT-1) |
| Payable Aging | Money › Payables (vendor, open items) | **Built**, with estimated buckets (Q-IT-1) |
| Cash Position: balances | Money › Cash & bank | **Built**. Account list pending Accounts sign-off |
| Cash Position: future cash flow | — | **Blocked**: needs journal-line open amounts (Q-IT-1) |
| Inventory | Stock › Inventory (category, warehouse, top 50, below minimum with pending orders, slow-moving 90/180 days) | **Built** |
| Today's Order | Stock › Orders › Today (orders and dispatch) | **Built** |
| Pending Order | Stock › Orders › Pending (age breakdown, balance, on hand, "can ship now", overdue) and › Shortages | **Built**. Many stale open orders exist in SAP (Q-ACC-8) |
| Production Report | Production: daily item-wise (order, receipt, shift, unit cost, production/OK/rejected qty, values, rejection %), product-wise summary, top 5 rejection items | **Built** for item- and product-wise. **Operator-wise:** SAP has the fields but they are empty on every production receipt. **Machine-wise:** no source (Q-PRD-1) |
| Setup (hidden) | Not needed; periods are computed (Indian FY, IST) | — |

## Before the demo on 13 Nov
- [ ] Deploy to Supabase and Vercel in Mumbai (Q-IT-4, Q-MD-1).
- [x] Installable on a phone: manifest, icons, offline cache with a "cached" banner; cache cleared on sign-out (`apps/web/scripts/pwa-check.mjs`).
- [ ] Install the agent as a Windows service on the office PC (Q-IT-2). `agent/install_service.ps1` is ready; it refuses to install until the cloud settings exist, and runs one test cycle first.
- [ ] Run the UAT checklist with Accounts: [uat-checklist.md](uat-checklist.md) has the dashboard figures pre-filled for 5 dates (`python -m discovery.uat_checklist` refreshes them).

## After the demo (PRD §5–6)
- AI box: text-to-SQL over the `rpt` views, read-only role, shows its query.
- Alerts and the 9 AM email summary.
- Excel and PDF export.
- Audit log.
- Switch the agent from `manager` to a read-only SAP user (Q-IT-3).
- If Q-IT-1 is approved: exact aging and the future cash-flow forecast.

## Open questions
See [open-questions.md](open-questions.md).
