# Open questions

Each question is grouped by who can answer it. Accounts also has their own sign-off sheet: [kpi-definitions.md](kpi-definitions.md).

## Management (Akshay Sir)
| # | Question | Why it matters | Answer |
|---|---|---|---|
| Q-MD-1 | Which email address may sign in to the dashboard? | Only that address can receive a sign-in code | |
| Q-MD-2 | **Dhumal Plasson** was the second company in the V9 workbook. Does it still exist? If so, is it in a separate SAP database, merged into DHUMAL_LIVE, or no longer on SAP? | If it has its own database, the agent must sync it too and every screen needs a company filter | |

## IT / SAP admin
| # | Question | Why it matters | Answer |
|---|---|---|---|
| Q-IT-1 | Can IT create a **read-only SQL Server login** on SAPSERVER for DHUMAL_LIVE (`db_datareader` only)? It is one script and is what V9 effectively used. | Gives aging that matches SAP's Customer/Vendor Aging report exactly, and the future cash-flow forecast (V9 "Cash Position"). Without it, aging buckets are estimated and the forecast cannot be built | |
| Q-IT-2 | Which always-on office PC or VM will run the sync agent? | It needs the LAN, outbound internet, and to stay on during office hours | 30 Oct 2026: IT assigned **192.168.1.20** (MYREPORT, the HRMS server), RDP as administrator |
| Q-IT-3 | Restart the **SAP Business One Service Layer** service after office hours, so we can retest the read-only user `DASHREAD` | The agent uses `manager` for now; go-live needs a read-only SAP user | |
| Q-IT-4 | Supabase and Vercel accounts under a company email (Mumbai region) | Needed to deploy the demo | |

## Production
| # | Question | Why it matters | Answer |
|---|---|---|---|
| Q-PRD-1 | V9 showed production by **machine** (codes like `CI00077 INJECTION MOULDING M/C NIGATA NN-350`), with machine minutes, downtime, utilisation and an operator **standard quantity**. Where are these recorded today? SAP add-on, MES (production orders carry `U_MESUniqueID`), or Excel? | SAP has no machine field. It has shift (`U_Shift`) and operator (`U_PRDOPERATOR`) fields on production receipts, but on 27 Oct 2026 they were **empty on every receipt**. Can production start filling them, or point us to where operators are recorded? | |

## Accounts
Questions 1–6 are in [kpi-definitions.md](kpi-definitions.md), plus:

| # | Question | Answer |
|---|---|---|
| Q-ACC-7 | Quotations: V9 (2016) had about 2,500 quotation lines; SAP now has 2 quotations. Are quotes made outside SAP (for example the DhumalOne quotation tool)? Should the Quotations module read from there, or be dropped? | |
| Q-ACC-8 | **Stale open orders.** On 27 Oct 2026, SAP holds 5,807 sales orders still "open" with ₹394 Cr undelivered. Of that, ₹219 Cr is on 3,145 orders older than 180 days, and 1,353 purchase orders older than 90 days are still open (₹29 Cr). Can Sales and Purchase close the ones that are delivered or cancelled? The dashboard hides orders older than 180 days by default, but Home and the alerts are only as accurate as SAP. | |
