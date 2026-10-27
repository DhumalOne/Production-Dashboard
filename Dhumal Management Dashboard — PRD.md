# Dhumal Management Dashboard — PRD

Oct 26, 2026 · @Rohit

## 1. Overview

We will build a cloud-hosted, mobile-first management dashboard that reads Dhumal's SAP Business One data every 15 minutes and lets the MD ask questions in plain language. It replaces the Excel workbook "Dhumal Management Dashboard V9", whose last refresh is dated 10-Feb-2016 and whose Main Page lookups now return #N/A.

**Requested by:** Akshay Sir (MD). **Owner:** Rohit Devade, Senior AI Officer.

### Problem

- Management numbers live in a 15-sheet Excel file fed by an old SAP add-in; it is stale and partly broken.
- Getting a figure today means asking Accounts or Sales, waiting, and getting a spreadsheet back.
- Nothing works on a phone, and nothing warns management when receivables age or stock runs short.

### Goals

1. One screen that shows the state of the business today, MTD and YTD, on phone or laptop.
2. Data no older than 15 minutes during office hours, read from SAP without ever writing to it.
3. An AI box that answers business questions in plain English (later Hindi/Marathi) with the number and how it was computed.
4. Opens straight to the dashboard: one allowed email, sign in once per device.

### Success metrics

| Metric | Target |
| --- | --- |
| Numbers match SAP standard reports | 100% on the UAT checklist |
| Data freshness in office hours | 15 minutes or less |
| Home screen load on 4G | Under 2 seconds |
| AI box correct answers on the 50-question test set | 90% or more |
| MD usage | Opened on 4+ days a week after rollout |
| Excel V9 retired | Within 1 month of go-live |

## 2. Users and access

One email address is allowed in; the dashboard has its own login and never uses SAP accounts.

- **Allowed list:** a single email (e.g. the MD's), held as a server setting. Adding a second person later is a one-line change.
- **First sign-in per device:** enter the email, receive a 6-digit code or magic link, done. Any other email gets "Not authorised" and no code is sent.
- **After that:** the session stays signed in for 90 days (configurable). Tapping the home-screen icon opens directly on Home, with no login screen.
- **Install:** Progressive Web App (PWA). "Add to Home Screen" on Android and iPhone; no Play Store or App Store.
- **Sign out / revoke:** a "Sign out of all devices" button in Settings; changing the allowed email also ends every session.
- **No roles:** a single user sees everything. Role-based views are out of scope for v1.

## 3. Scope

Version 1 rebuilds all 15 sheets of the V9 workbook as live screens, plus the AI box, alerts and a daily summary.

### In scope (v1)

- Read-only sync from SAP Business One (SQL Server), all company databases (Dhumal Industries, Dhumal Plasson, and any others confirmed in discovery).
- Nine modules: Home, Sales, Quotations, Purchase, Cash and Bank, Receivables and Payables Aging, Inventory, Orders and Dispatch, Production.
- Filters on every screen: company, period (Today / MTD / QTD / YTD / custom), compare with previous year.
- Indian financial year (April to March) and Indian number format (₹ lakh / crore).
- AI box on every screen.
- Alerts and a 9 AM daily summary by email (WhatsApp in v1.1).
- Export of any table to Excel and any screen to PDF.

### Out of scope (v1)

- Any write to SAP (orders, approvals, edits). The system is read-only by design.
- Multiple users, roles, salesperson-only views.
- Native Play Store / App Store apps.
- Budgets and targets (no budget data in SAP today); can be added in v2 from an uploaded sheet.
- FarmOS / Fallgience and machine IoT data (possible v2 integration).

## 4. Functional requirements by module

Every module keeps what the V9 sheet showed, adds a drill-down to the SAP document, and gains one or two views the Excel could not give.

### 4.1 Home (MD view) — replaces "Main Page"

- KPI cards: Sale, Quotation, Orders, Purchase, Receipts, Payments — each with Today, MTD, YTD, daily average and a 6-month sparkline.
- Growth cards: MTD and YTD sale vs same period last year, with % and arrow.
- Position strip: Today's production value, Inventory value, Payables, Receivables, Bank balance, Cash balance, Total liquidity.
- "Needs attention" list: top 3 alerts (Section 6).
- "Last synced HH:MM" stamp; amber if older than 30 minutes, red if older than 2 hours.
- Tap any card to open its module, pre-filtered to the same period.

### 4.2 Sales — replaces "Sales Dashboard", "Sales Trend"

- Sale by salesperson, item and customer, with amount, quantity and contribution %.
- Month-wise trend per salesperson and for the top 50 items, including price after discount and discount %.
- Net sale = A/R invoices minus A/R credit memos, before tax (definition to be signed off by Accounts).
- New: gross margin per item and customer where item cost is available; top customers by growth and decline.

### 4.3 Quotations — replaces "Quotation Dashboard"

- Quotation value by salesperson, item and customer.
- New: quote-to-order conversion % by salesperson and customer, open quotations older than 30 days, and the 20 largest open quotes.

### 4.4 Purchase — replaces "Purchase Dashboard", "Purchase Trend"

- Purchase by buyer, item and vendor; month-wise trend for buyers, top 5 vendors and top 10 items.
- New: open purchase orders and their due dates; price change of top raw materials (e.g. HDPE, LLDPE) month on month.

### 4.5 Cash and Bank — replaces "Receipt MTD", "Payment MTD", "Cash Position"

- Receipts by customer and payments by vendor, MTD, with on-account amounts.
- Balance per bank and cash GL account, and total.
- Future cash flow by month: receivables due minus payables due, next 3 months.

### 4.6 Receivables and Payables Aging — replaces both Aging sheets

- Buckets: not yet due, 0–30, 30–60, 60–90, 90–120, 120+ days, per company and per business partner.
- Sorted by 90+ exposure; tap a party to see open invoices with dates and amounts.
- New: receivables aging by salesperson; trend of total 90+ receivables over the last 12 months.

### 4.7 Inventory — replaces "Inventory"

- Stock value by item category (Spares, Raw Material, Sub-Assembly, Finished Goods, Capital Item), and by warehouse.
- Top 50 items by value.
- Items at or below minimum stock level, with shortfall.
- New: slow and non-moving stock (no movement in 90 / 180 days) with value; items below minimum that also have pending sales orders.

### 4.8 Orders and Dispatch — replaces "Today's Order", "Pending Order"

- Today's sales orders and today's deliveries (dispatch), with item, quantity, rate, value.
- Pending orders: order, customer, due date, balance quantity and value, with available stock beside each line.
- New: overdue orders (past due date) highlighted, and "can ship now" flag where stock covers the balance.

### 4.9 Production — replaces "Production Report"

- Daily item-wise production: order, receipt, shift, produced, OK and rejected quantity and value, rejection %.
- Summaries by machine, operator and product.
- New: rejection % trend by machine over 30 days; top 5 rejection items this week.
- Dependency: machine, operator and shift come from user-defined fields or an add-on in SAP; field names to be confirmed in discovery.

### 4.10 Common to every screen

- Company filter (All / each company), period selector, previous-year comparison toggle.
- Search box for customer, vendor or item.
- Every number taps through to its list; every list row taps through to the SAP document number.
- Export table to Excel, screen to PDF.
- Amounts in ₹ with lakh/crore format; quantities with unit.

## 5. AI box

A single "Ask anything" bar on every screen answers questions about the business in plain language, using only the synced SAP data.

### What it does

1. The user types or speaks a question, e.g. "Which customers owe more than ₹5 lakh beyond 90 days?"
2. The model reads a catalogue of approved reporting views and their column meanings, and writes one SQL query.
3. The query runs through a read-only database user, limited to the reporting views, with a 10-second timeout and a 500-row cap.
4. The answer comes back as one sentence with the key number, plus a small table or chart when useful.
5. A "How I got this" toggle shows the query, the period and the filters used.

### Example questions it must handle

- "How much did we sell today, and how does it compare with the same day last year?"
- "Amol's sales this month vs last month."
- "Top 10 items by sale this quarter in Dhumal Plasson."
- "Which items are below minimum stock and also have pending orders?"
- "What is our total bank balance right now?"
- "Which machine had the highest rejection this week?"
- "Open quotations for Sneha Farms."

### Rules

- Read-only: only `SELECT` on reporting views; the database user has no other rights. The model never sees SAP directly.
- Uses the same KPI definitions as the screens, so the AI and the dashboard never disagree.
- If the question is ambiguous (e.g. "sales" with no period), it assumes MTD and says so in the answer.
- If it cannot answer from the data, it says so instead of guessing.
- Follow-up questions keep context ("and last year?").
- Suggested questions shown under the box; recent questions saved per device.
- Every question, query and answer is logged for audit and for improving the test set.
- Model: Claude via the Anthropic API. Only the question, the schema description and the result rows are sent; the commercial API does not use this data for training.

### Later (v1.1)

- Hindi and Marathi questions and answers.
- Voice input on the phone.
- "Pin this answer" to add it as a card on Home.

## 6. Alerts and daily summary

The dashboard tells the MD what changed instead of waiting to be opened.

### Daily summary at 9:00 AM IST

Email to the allowed address (WhatsApp in v1.1) with: yesterday's sale, quotations, orders, receipts and payments; MTD vs last year; bank and cash total; top 3 alerts; a link that opens the dashboard.

### Alerts (v1 defaults, thresholds editable in Settings)

| Alert | Trigger | Shown on |
| --- | --- | --- |
| Large overdue receivable | A customer crosses ₹5 lakh in the 90+ bucket | Home, summary |
| Stock-out risk | Item below minimum stock and has a pending sales order | Home, summary |
| Overdue order | Sales order past due date with balance quantity | Home |
| Rejection spike | Machine rejection % today above 2× its 30-day average | Home, summary |
| Sales drop | MTD sale more than 20% below same period last year | Summary |
| Sync stale | No successful sync for 2 hours in office hours | Home banner, email to Rohit |

Alerts appear in the "Needs attention" list on Home and, from v1.1, as phone push notifications.

## 7. UX and design

The phone is the primary screen; the laptop view is the same app with more columns.

### Mobile layout

- Top: company and period chips, "last synced" stamp.
- KPI cards in a 2-column grid; swipe across Today / MTD / YTD.
- AI box pinned just above the bottom navigation, always one tap away.
- Bottom navigation with 5 tabs: Home, Sales, Money (Cash + Aging), Stock (Inventory + Orders), More (Quotations, Purchase, Production, Settings).
- Tables become cards on narrow screens; long lists load as you scroll.
- Pull down to refresh.

### Desktop layout

- Left sidebar for modules; KPI row on top; charts and full tables side by side.

### Visual style

- Clean, modern, flat; light and dark mode following the phone setting.
- One accent colour; green and red only for good and bad change, always with an arrow or sign so colour is never the only signal.
- Large numbers, short labels, ₹ L / Cr formatting (e.g. ₹2.76 Cr).
- Charts: line for trends, bars for rankings, no 3D or pie charts beyond 5 slices.
- Skeleton loaders, never a blank screen.

### Usability rules

- Any number is reachable in 2 taps or one question.
- Text 14 px minimum on phone; tap targets 44 px minimum.
- Works on a 4G connection; the last loaded data stays readable offline with a "cached" label.

## 8. Architecture and data

A sync agent inside the office reads SAP Business One's SQL Server with a read-only login and pushes changes out to a cloud database; the dashboard and AI box read only that copy.

&#91;embedded content: system architecture · office to cloud to phone\]

No port is opened on the office firewall: the agent only makes outbound HTTPS calls, and nothing in the cloud can reach SAP.

### Components

| Component | Technology | Where it runs |
| --- | --- | --- |
| Sync agent | Python, Windows service (pyodbc + HTTPS) | Office PC or VM on the SAP LAN |
| Ingest API | Serverless function, API-key auth | Cloud |
| Database | Postgres (Supabase, Mumbai region) | Cloud |
| Web app + API | Next.js PWA, TypeScript, Tailwind, charting library | Vercel (Mumbai edge) |
| Login | Supabase Auth, email OTP, single allow-listed address | Cloud |
| AI box | Claude API, text-to-SQL over reporting views | Cloud function |
| Alerts + summary | Scheduled job, transactional email service | Cloud |

If Dhumal already has an AWS or Azure account, the same design runs there (RDS/Azure Postgres + App Service); only the hosting row changes.

### SAP access

- SQL login `dash_reader` with `db_datareader` only, on each company database. Already available.
- Credentials stored only in the agent's config on the office machine, never in the cloud or in code.
- Incremental reads by `UpdateDate` / `DocEntry` every 15 minutes (07:00–21:00); full refresh nightly at 02:00.
- Queries kept light: no locks held (`READ COMMITTED`), batch size limited, heavy aging recomputed in the cloud, not in SAP.

### Source tables (SAP Business One)

| Module | SAP tables |
| --- | --- |
| Sales | OINV/INV1 minus ORIN/RIN1, OSLP, OCRD |
| Quotations | OQUT/QUT1 |
| Orders, pending, dispatch | ORDR/RDR1 (OpenQty), ODLN/DLN1 |
| Purchase | OPCH/PCH1 minus ORPC/RPC1, OPOR/POR1 |
| Receipts and payments | ORCT, OVPM |
| Aging | JDT1 open items by DueDate, OCRD |
| Inventory | OITM, OITW, OITB, OWHS, MinLevel |
| Production | OWOR/WOR1, OIGN/IGN1, plus UDFs for machine, operator, shift |
| Bank and cash | OACT, JDT1 for bank and cash GL accounts |

### Data model in the cloud

1. **Raw layer:** one table per SAP table, same column names, plus `company_db` and `synced_at`.
2. **Reporting views:** `v_sales_lines`, `v_quotation_lines`, `v_order_lines`, `v_purchase_lines`, `v_receipts`, `v_payments`, `v_receivable_aging`, `v_payable_aging`, `v_stock`, `v_production`, `v_bank_cash`. Each has plain column names and a written description.
3. **KPI layer:** daily snapshots (`kpi_daily`) so Home loads instantly and trends over years stay fast.

The screens and the AI box both read the reporting views and KPI layer, so they always agree.

## 9. Non-functional requirements

SAP must never slow down or change because of the dashboard, and the data must stay in India and behind one login.

### Security

- SAP: read-only SQL login; no inbound port opened; credentials only on the office agent machine.
- Agent to cloud: HTTPS (TLS 1.2+) with a rotating API key; the ingest endpoint accepts writes only from that key.
- Database: encrypted at rest; row-level security on; the web app and AI box use separate read-only roles limited to reporting views.
- Login: single allow-listed email, OTP, 90-day device session, "sign out everywhere".
- Secrets in the hosting provider's secret store, never in Git.
- Audit log of sign-ins, AI questions and exports, kept 1 year.

### Performance

- Home screen under 2 seconds on 4G; module screens under 3 seconds.
- AI box answer under 8 seconds for 90% of questions.
- Sync cycle completes within 2 minutes; adds under 5% load on the SQL Server during office hours.

### Reliability

- Sync agent retries with back-off and resumes from the last checkpoint after a power cut or network drop.
- Agent heartbeat every 5 minutes; stale-sync alert after 2 hours.
- Daily automated database backup, 7-day point-in-time restore.
- Cloud uptime target 99.5%; when the office internet is down, the dashboard still works on the last synced data and says so.

### Data residency and privacy

- Database and app hosted in the Mumbai (ap-south-1) region.
- Only question text, view descriptions and result rows go to the AI model; no bulk export of SAP data to it.

### Running cost (estimate, per month)

| Item | Starting tier | At full use |
| --- | --- | --- |
| Database + auth (Supabase) | Free | About ₹2,100 (Pro) |
| App hosting (Vercel) | Free | About ₹1,700 (Pro) |
| AI box (Claude API) | Pay per use | About ₹500–2,000 for one user |
| Email (daily summary) | Free tier | Free tier |
| Office agent machine | Existing PC/VM | — |

Prices are approximate and should be confirmed at sign-up; Pro tiers are recommended before go-live for backups and support.

## 10. Plan, risks and acceptance

The build takes 7 weeks from 26 Oct 2026: a working phone demo of Home, Sales and Receivables on 13 Nov, and go-live on 11 Dec.

&#91;embedded content: build plan · 7 weeks, 2 milestones\]

**Gate at the demo (13 Nov):** Akshay Sir approves the look and confirms the Home numbers match what Accounts reports. Remaining modules start only after this.

### Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Numbers differ from what Accounts reports | MD loses trust in the dashboard | Sign off KPI definitions in week 1; UAT checklist compares every Home number with a standard SAP report |
| Machine, operator, shift not in standard B1 tables | Production screen incomplete | Confirm UDF / add-on field names in discovery; ship item-wise production first if delayed |
| Office internet or agent PC goes down | Data goes stale | Heartbeat + stale banner + email alert; agent auto-restarts as a Windows service; consider a UPS-backed VM |
| Sync query slows SAP | Users complain about SAP speed | Incremental reads, small batches, heavy jobs at night, monitored query time |
| AI box gives a wrong number | Wrong decision | Answers only from reporting views, shows its query, 50-question test set must pass 90% before go-live |
| Allowed email inbox compromised | Data exposure | OTP + device sessions, "sign out everywhere", audit log, MFA on that mailbox |

### Open questions

- [ ] Which email address is the allowed one?
- [ ] Exact list of company databases (Dhumal Industries, Dhumal Plasson, others?)
- [ ] Definition of Sale: invoices net of credit notes, before or after tax? Include inter-company sales?
- [ ] UDF names for machine, operator and shift in production
- [ ] GL account codes for bank and cash balances
- [ ] Which office PC or VM will run the sync agent?
- [ ] Supabase + Vercel, or an existing AWS/Azure account?

### Acceptance criteria for go-live

- [ ] Every Home KPI matches the corresponding SAP report for 5 test dates
- [ ] All 9 modules work on Android and iPhone at 360 px width and on desktop
- [ ] Data no older than 15 minutes during office hours for 5 consecutive working days
- [ ] Only the allowed email can sign in; other emails are refused
- [ ] AI box passes 90% of the 50-question test set and shows its query for each answer
- [ ] 9 AM summary arrives on 5 consecutive working days
- [ ] SAP login confirmed read-only; no inbound firewall port opened
- [ ] Akshay Sir signs off
