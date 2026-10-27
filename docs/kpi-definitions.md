# Management Dashboard: KPI definitions (DRAFT for Accounts sign-off)

**Company:** DHUMAL_LIVE · **Prepared:** 27 Oct 2026 · **Sign-off needed by:** Fri 30 Oct 2026

The dashboard and the "Ask anything" box both use these definitions, so they always show the same numbers. Please mark each line **Agree** or write the correction.

## General rules
| Rule | Proposal | Agree / correction |
|---|---|---|
| Financial year | 1 April to 31 March (FY 2026-27 = 1 Apr 2026 to 31 Mar 2027) | |
| Date used | Posting date (SAP "Posting Date") of each document | |
| Currency | INR. Foreign-currency documents are converted at SAP's document rate | |
| Amount basis | **Before GST**: document total minus tax, after document discount | |
| Cancelled documents | Excluded: both the cancelled document and its cancellation document | |
| "Today" | India time (IST) | |

## Activity KPIs
| KPI | Definition | SAP report to compare with | Agree / correction |
|---|---|---|---|
| **Sale** | A/R invoices **minus** A/R credit memos, before GST. **Excludes inter-company / branch customers** (list below) | Sales Analysis report (by customer), A/R Invoice + Credit Memo, "Without tax" | |
| **Quotations** | Sales quotations, before GST. *Note: only 2 quotations exist in SAP, so this KPI will be near zero unless quotations are entered in SAP* | Sales Analysis (Quotations) | |
| **Orders** | Sales orders created in the period, before GST | Sales Analysis (Orders) | |
| **Purchase** | A/P invoices **minus** A/P credit memos, before GST | Purchase Analysis report | |
| **Receipts** | Incoming payments: cash + transfer + cheque + card, all payment types (customer, vendor, account) | Incoming Payments list | |
| **Payments** | Outgoing (vendor) payments, same rules | Outgoing Payments list | |

**Questions for Accounts:**
1. Should Receipts and Payments include payments posted **to a GL account** (type "Account"), or only customer and vendor payments? With everything included, FY 2026-27 to date shows Payments of ₹349 Cr against Purchases of ₹166 Cr. Account-type payments include transfers such as funding petty cash.
   - Should **Orders** also exclude the inter-company customers? FY 2026-27 to date shows Orders of ₹387 Cr against Sale of ₹206 Cr.
2. Should Sale include **freight / other charges** on invoices? The proposal includes them, because they are part of the document total.

## Inter-company / branch customers excluded from Sale
These customer codes are named "Dhumal …". Please tick the ones to **exclude** and add any that are missing:

| ☐ | Code | Name |
|---|---|---|
| ☐ | C000005 | DHUMAL ENGINEERING |
| ☐ | C000006 | DHUMAL INDUSTRIES. |
| ☐ | C000007 | DHUMAL INDUSTRIES KOLKATTA |
| ☐ | C000008 | DHUMAL INDUSTRIES HYDERABAD |
| ☐ | C000009 | DHUMAL INDUSTRIES PUNE |
| ☐ | C000032 | DHUMAL INDUSTRIES BANGALORE. |
| ☐ | C000071 | DHUMAL INDUSTRIES NASHIK BRANCH |
| ☐ | C000075 | DHUMAL INDUSTRIES INDIA PVT LTD AMBALA |
| ☐ | C000153 | DHUMAL INDUSTRIES LUCKNOW U P |
| ☐ | C000156 | DHUMAL INDUSTRIES VELLORE TAMILNADU |
| ☐ | C000180 | DHUMAL INDUSTRIES ODISHA |
| ☐ | C000189 | DHUMAL INFRACAP PRIVATE LTD |
| ☐ | C000197 | DHUMAL INDUSTRIES BHOPAL MADHYA PRADESH |
| ☐ | C000202 | DHUMAL INDUSTRIES GUJRAT |
| ☐ | C000207 | DHUMAL INDUSTRIES TAMILNADU - PALLADAM |
| ☐ | C000212 | DHUMAL INDUSTRIES |
| ☐ | C000218 | DHUMAL INDUSTRIES INDIA PVT LTD. |
| ☐ | C000219 | DHUMAL INDUSTRIES PUNE BRANCH |
| ☐ | C000222 | DHUMAL METALS PVT LTD |
| ☐ | C000305 | DHUMAL INDUSTRIES INDIA PRIVATE LIMITED |
| ☐ | C000439 | DHUMAL POULTRY SHOWROOM |
| ☐ | C000440 | DHUMAL POULTRY HOUSE |
| ☐ | C001266 | DHUMAL INDUSTRIES INDIA PVT LTD |
| ☐ | C001282 | DHUMAL INDUSTRIES BANGALORE |
| ☐ | C001372 | DHUMAL INDUSTRIES HYD Do not use |
| ☐ | C001380 | DHUMAL INDUSTRIES -CHHATISGARH |
| ☐ | C001467 | DHUMAL INDUSTRIES INDIA PVT LTD AMBALA DO NO USE |
| ☐ | C001468 | DHUMAL INDUSTRIES HYD |
| ☐ | C001476 | DHUMAL INDUSTRIES-KHORDHA- ODISHA |
| ☐ | C001683 | DHUMAL INDUSTRIES  INDIA PVT.LTD AMBALA |
| ☐ | C001778 | DHUMAL INDUSTRIES ODISHA(21AAXFD5945N1ZR) |
| ☐ | C001839 | DHUMAL INFRACAP PVT LTD |
| ☐ | C002886 | DHUMAL INDUSTRIES INDIA PVT. LTD. |

(SHRI DHUMAL POULTRY FARM and NITIN DHUMAL look like external customers, so they are not listed.)

## Position KPIs (as of now)
| KPI | Definition | SAP report to compare with | Agree / correction |
|---|---|---|---|
| **Receivables** | Sum of customer account balances (positive balances, less customer advances) | Customer Receivables Aging, total | |
| **Payables** | Sum of vendor account balances | Vendor Liabilities Aging, total | |
| **Bank balance** | Balance of every GL account whose code starts **1210** (bank accounts), overdraft / CC accounts included as negative | Trial Balance / G/L account balances | |
| **Cash balance** | Balance of every GL account whose code starts **1211** (petty cash) | G/L account balances | |
| **Total liquidity** | Bank + Cash | | |
| **Inventory value** | Quantity in stock × item average cost, all warehouses | Inventory Audit / Inventory Valuation report | |

**About Receivables (data as of 27 Oct 2026):**
- Customers with a positive balance owe ₹94.95 Cr.
- Customers with a credit balance (advances received) total −₹52.19 Cr. Of that, −₹11.42 Cr is on "Dhumal …" inter-company accounts; the largest single advance is Fertile Valley Farms at −₹12.23 Cr.
- The net figure, ₹42.76 Cr, equals SAP's total.

The dashboard shows the **net** figure and lists advances separately.

**Questions for Accounts:**
3. On Home, should "Receivables" be the **net** figure (₹42.76 Cr) or **what customers owe** (₹94.95 Cr) with advances shown separately? Should inter-company accounts be left out of receivables too?
4. Is "1210… = bank, 1211… = cash" correct? Should any account be **added** (for example the YES Bank FD, the AIG funds, MSEDCL deposits) or **removed**?
5. Should **overdraft and cash-credit accounts** be netted in Total liquidity (proposal: yes), or shown separately?

## Receivables and payables aging: please read
SAP's own aging report uses journal-line open amounts. The dashboard cannot read those fields through the read-only connection. Many settled invoices also still show as "Open" in SAP, so the dashboard estimates aging instead:

- Each customer's **balance is exact** (same as SAP).
- That balance is **assumed to consist of the customer's most recent invoices**. In other words, payments clear the oldest invoices first.
- Those invoices are aged by due date into: Not due, 0–30, 31–60, 61–90, 91–120, 120+ days.
- Any balance older than the invoices in SAP (from April 2025) goes into **120+**.
- Customers with a credit balance show it as **Advance**.

**Totals match SAP. The bucket split can differ** where a customer has paid newer invoices before older ones. The screen labels the buckets as "estimated".

6. Is this acceptable for the MD's view? If exact aging is required, IT will need to create a read-only SQL Server login on SAPSERVER so the dashboard can read the journal-line open amounts.

## Sign-off
| Name | Role | Date | Signature |
|---|---|---|---|
| | Accounts | | |
| Rohit Devade | Senior AI Officer | | |
