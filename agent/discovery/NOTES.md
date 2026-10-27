# SAP B1 discovery notes

Run on 26 Oct 2026 through the Service Layer (`https://sapserver:50000/b1s/v2/`, company `DHUMAL_LIVE`).
The full raw report is in `output/report_sl.md`. It is gitignored because it contains balances.

## Environment
- SAP Business One 10.0 on **SAPSERVER (192.168.1.251)**. Port 1433 (SQL Server) and port 50000 (Service Layer) are reachable from the office LAN.
- **One company database: `DHUMAL_LIVE`.** Dhumal Plasson is not a separate database.
- **No SQL read-only login exists** (`dash_reader` is missing, and `manager` is an SAP user, not a SQL login). For now the agent reads through the **Service Layer**, using GET requests only.

## Data volume (26 Oct 2026)
History starts **31 Mar / 1 Apr 2025**, so there are about 19 months of data (FY 2025-26 and FY 2026-27 so far).

| Table | Rows | | Table | Rows |
|---|---|---|---|---|
| OINV invoices | 21,346 | | OCRD business partners | 9,482 |
| ORIN credit memos | 921 | | OITM items | 18,965 |
| OQUT quotations | **2** | | OSLP salespersons | 69 |
| ORDR sales orders | 28,542 | | OITB item groups | 13 |
| ODLN deliveries | 24,320 | | OWHS warehouses | 80 |
| OPCH A/P invoices | 25,923 | | OACT GL accounts | 1,392 |
| ORPC A/P credit memos | 459 | | OJDT journal entries | 257,296 |
| OPOR purchase orders | 12,781 | | | |
| ORCT incoming payments | 14,389 | | | |
| OVPM outgoing payments | 16,905 (one is dated 29 Nov 2026, in the future) | | | |
| OWOR production orders | 26,106 | | | |
| OIGN receipts from production / goods receipts | 56,785 | | | |

The volumes are small, so the first full load takes minutes, not hours.

## Findings that affect the PRD

1. **Quotations are not used in SAP (only 2 documents, both from March 2026).**
   - The Quotations module and "quote-to-order conversion" would be empty.
   - Quotes are probably made in the DhumalOne quotation tool or outside SAP.
   - **Decision needed:** drop the module for v1, or source quotes from DhumalOne.
2. **Inter-company and branch customers exist.**
   - About 35 customer codes are named "DHUMAL INDUSTRIES …" branches (Kolkata, Hyderabad, Pune, Bangalore, Ambala, Lucknow, Odisha and others), plus Dhumal Infracap, Dhumal Metals, Dhumal Engineering and Dhumal Poultry.
   - Invoices also carry the branch-invoice UDFs `U_BrInv`/`U_BrInvE`.
   - **Accounts must list which CardCodes are excluded from "Sale".**
3. **The "Cash account" flag in SAP is not reliable for bank and cash.**
   - Flagged accounts include deposits (MSEDCL, BSNL), mutual funds (AIG), branch accounts, co-op bank shares and a personal account.
   - Some real bank accounts are *not* flagged, including SBI Bangalore CC, HDFC Hyderabad, CITI, YES Bank OD and several petty cash accounts.
   - **Proposal:** classify by FormatCode:
     - `1210…` = bank
     - `1211…` = cash / petty cash
     - plus an explicit include/exclude list that Accounts signs off.
   - Overdraft and CC accounts carry negative balances. Decide whether "Total liquidity" nets them off.
4. **Production UDFs:**
   - Shift = `IGN1.U_Shift`
   - Operator = `IGN1.U_PRDOPERATOR` (also `U_SETUPOPERATOR`, `OIGN.U_OPERATORCODE`)
   - Supervisor = `IGN1.U_Supervisor`
   - Production order link = `IGN1.U_ProdEntry` / `OIGN.U_ProdEtry`
   - Scrap = `OIGN.U_SCItem` / `U_SCQty`
   - **There is no machine field.** The machine is probably a Resource line on the production order (WOR1, item type = resource). Confirm with the production team.
   - There is also an `OWOR.U_MESUniqueID`, so an MES may exist.
5. **Item groups map onto the PRD's inventory categories:**

   | PRD category | SAP item group(s) |
   |---|---|
   | Raw Material | 101 |
   | Finished Goods | 103 |
   | Sub-Assembly | 108 |
   | Spares | 106 + 110 |
   | Capital Item | 112 |

   Packing (102), Consumables (104), Moulds (105/107), Scrap (109) and Stationery (111) are extra. Also `OITM.U_MainGrp` / `U_SubGrp1..9`.
6. **Salespersons:** 68 are active, plus "-No Sales Employee-" (-1) and the generic "SALES MANAGER" (1).
7. **Warehouses:** 80, mostly Ashewadi (AS-…) plants plus branch warehouses.

## Compared with the V9 workbook (Feb 2016)
- V9's company filter had **Dhumal Industries** and **Dhumal Plasson**. Only DHUMAL_LIVE exists on this server (Q-MD-2).
- V9's Cash Position used journal-line open amounts (`BalDueDeb`/`BalDueCred`). The Service Layer does not expose these fields (Q-IT-1).
- V9's Production Report had machine codes like `CI00077` plus machine minutes and downtime. There is no matching SAP field (Q-PRD-1).
- The full mapping is in `docs/roadmap.md`. All questions are in `docs/open-questions.md`.

## Open items for Accounts / MD
- [ ] Sale definition: before GST (proposed: DocTotal − VatSum − freight). Exclude the inter-company CardCodes (list above)?
- [ ] Bank and cash account list (FormatCode rule plus exceptions), and whether OD/CC accounts are netted in liquidity.
- [ ] Quotations module: drop it for v1, or take quotes from DhumalOne?
- [ ] Machine: where is it recorded?
- [ ] A dedicated read-only SAP user for the sync agent instead of `manager` (see the risk in the README).
  - `DASHREAD` exists (Read Only general authorizations, data ownership "Company" = Read Only, all 18 branches, employee 421 linked).
  - It still sees only documents in the branch-less "Primary" series (for example 768 of 21,355 invoices, 0 orders).
  - Series groups are not the cause, because all series are in Group 1.
  - Next steps: restart the Service Layer service out of hours and re-run `check_visibility`; otherwise ask the SAP partner.
  - Decision 27 Oct 2026: the agent uses `manager` for now, with read-only enforced in code.
