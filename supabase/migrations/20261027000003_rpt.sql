-- Reporting layer: the only schema the web app and the AI box can read.
-- KPI definitions are DRAFTS until Accounts signs off docs/kpi-definitions.md.

create schema if not exists rpt;

-- ---------------------------------------------------------------- settings Accounts controls
create table rpt.excluded_customer (          -- inter-company / branch customers left out of "Sale"
    company   text not null,
    card_code text not null,
    reason    text,
    primary key (company, card_code)
);

create table rpt.account_class (               -- overrides the FormatCode rule for bank / cash
    company text not null,
    code    text not null,
    kind    text not null check (kind in ('bank', 'cash', 'exclude')),
    primary key (company, code)
);

-- ---------------------------------------------------------------- helpers
create or replace function rpt.today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function rpt.fy_start(d date) returns date      -- Indian FY: 1 April
language sql immutable as $$
    select make_date(extract(year from d)::int - case when extract(month from d) < 4 then 1 else 0 end, 4, 1)
$$;

create or replace function rpt.fy_label(d date) returns text      -- e.g. FY 2026-27
language sql immutable as $$
    select 'FY ' || extract(year from rpt.fy_start(d))::int || '-' ||
           lpad(((extract(year from rpt.fy_start(d))::int + 1) % 100)::text, 2, '0')
$$;

create or replace function rpt.aging_bucket(days int) returns text
language sql immutable as $$
    select case when days <= 0 then 'Not due'
                when days <= 30 then '0-30'
                when days <= 60 then '31-60'
                when days <= 90 then '61-90'
                when days <= 120 then '91-120'
                else '120+' end
$$;

-- ---------------------------------------------------------------- sales
create view rpt.v_sales_docs as
select d.company, d.doc_type, d.doc_entry, d.doc_num, d.doc_date, rpt.fy_label(d.doc_date) as fy,
       d.card_code, d.card_name, d.slp_code, s.name as salesperson,
       t.sign * d.net_total as net_amount,
       t.sign * d.doc_total as gross_amount,
       (x.card_code is not null) as is_intercompany
from core.doc d
join core.doc_type t on t.doc_type = d.doc_type
left join core.salesperson s on s.company = d.company and s.slp_code = d.slp_code
left join rpt.excluded_customer x on x.company = d.company and x.card_code = d.card_code
where d.doc_type in ('AR_INV', 'AR_CN') and not d.is_cancelled;
comment on view rpt.v_sales_docs is
  'Net sale per document: A/R invoices positive, A/R credit memos negative, cancelled documents excluded. '
  'net_amount is before GST (DocTotal - VatSum, after header discount). Use this for sale totals.';

create view rpt.v_sales_lines as
select d.company, d.doc_type, d.doc_entry, d.doc_num, d.doc_date, rpt.fy_label(d.doc_date) as fy,
       d.card_code, d.card_name, coalesce(l.slp_code, d.slp_code) as slp_code, s.name as salesperson,
       l.line_num, l.item_code, l.item_name, i.group_code as item_group, g.name as item_group_name,
       t.sign * l.quantity as quantity, l.uom,
       t.sign * l.line_net as net_amount,
       case when l.gross_buy_price is not null
            then t.sign * (l.line_net - l.quantity * l.gross_buy_price) end as gross_margin,
       l.warehouse,
       (x.card_code is not null) as is_intercompany
from core.doc d
join core.doc_type t on t.doc_type = d.doc_type
join core.doc_line l on l.company = d.company and l.doc_type = d.doc_type and l.doc_entry = d.doc_entry
left join core.salesperson s on s.company = d.company and s.slp_code = coalesce(l.slp_code, d.slp_code)
left join core.item i on i.company = d.company and i.item_code = l.item_code
left join core.item_group g on g.company = i.company and g.group_code = i.group_code
left join rpt.excluded_customer x on x.company = d.company and x.card_code = d.card_code
where d.doc_type in ('AR_INV', 'AR_CN') and not d.is_cancelled;
comment on view rpt.v_sales_lines is
  'Sale per line for breakdowns by item, item group, customer, salesperson. Signed like v_sales_docs. '
  'Line totals can differ from v_sales_docs by rounding and freight; use v_sales_docs for totals.';

-- ---------------------------------------------------------------- other documents
create view rpt.v_documents as
select d.company, d.doc_type, t.label as doc_label, d.doc_entry, d.doc_num, d.doc_date,
       rpt.fy_label(d.doc_date) as fy, d.due_date, d.card_code, d.card_name, d.slp_code, s.name as salesperson,
       d.net_total as net_amount, d.doc_total as gross_amount, d.is_open, d.is_cancelled
from core.doc d
join core.doc_type t on t.doc_type = d.doc_type
left join core.salesperson s on s.company = d.company and s.slp_code = d.slp_code;
comment on view rpt.v_documents is
  'Every synced document header (quotations, orders, deliveries, invoices, credit memos, purchase documents). '
  'doc_type: QUOTE, ORDER, DELIVERY, AR_INV, AR_CN, PO, AP_INV, AP_CN. Filter is_cancelled = false for totals.';

create view rpt.v_purchase_docs as
select d.company, d.doc_type, d.doc_entry, d.doc_num, d.doc_date, rpt.fy_label(d.doc_date) as fy,
       d.card_code, d.card_name, t.sign * d.net_total as net_amount
from core.doc d join core.doc_type t on t.doc_type = d.doc_type
where d.doc_type in ('AP_INV', 'AP_CN') and not d.is_cancelled;
comment on view rpt.v_purchase_docs is
  'Net purchase per document: A/P invoices positive, A/P credit memos negative, before GST, cancelled excluded.';

create view rpt.v_payments as
select p.company, p.direction, p.doc_entry, p.doc_num, p.doc_date, rpt.fy_label(p.doc_date) as fy,
       p.card_code, p.card_name, p.pay_type, p.total, p.on_account, p.cash, p.transfer, p.cheque, p.card
from core.payment p
where not p.is_cancelled;
comment on view rpt.v_payments is
  'Payments, cancelled excluded. direction = in (incoming payments / receipts) or out (vendor payments). '
  'pay_type: rCustomer, rSupplier, rAccount (paid to a GL account). on_account = not applied to any invoice.';

-- ---------------------------------------------------------------- receivables / payables
-- The Service Layer does not expose journal-line open amounts (JDT1.BalDueDeb/Cred) and SAP leaves
-- many settled invoices "open", so aging is derived from each partner's exact SAP balance:
-- the balance is assumed to consist of the partner's most recent invoices (payments clear the
-- oldest first). Totals equal SAP; the bucket split is an estimate (see docs/kpi-definitions.md).
create view rpt.v_open_items as
with bal as (
    select company, card_code, card_type, balance,
           case card_type when 'cCustomer' then 'receivable' else 'payable' end as side,
           case card_type when 'cCustomer' then 'AR_INV' else 'AP_INV' end as inv_type
    from core.bp_balance
    where card_type in ('cCustomer', 'cSupplier')
),
inv as (                                       -- invoices newest first, with running total
    select b.company, b.card_code, b.side, b.balance, d.doc_type, d.doc_entry, d.doc_num, d.doc_date,
           coalesce(d.due_date, d.doc_date) as due_date, d.slp_code, d.doc_total,
           sum(d.doc_total) over (partition by b.company, b.card_code
                                  order by d.doc_date desc, d.doc_entry desc) as running
    from bal b
    join core.doc d on d.company = b.company and d.card_code = b.card_code and d.doc_type = b.inv_type
                   and not d.is_cancelled and d.doc_total > 0
    where b.balance > 0
),
alloc as (                                     -- the part of each invoice still covered by the balance
    select *, least(doc_total, balance - (running - doc_total)) as open_amount
    from inv
    where running - doc_total < balance
),
items as (
    select company, side, card_code, doc_type, doc_entry, doc_num, doc_date, due_date, slp_code, open_amount
    from alloc
    union all                                  -- balance older than the synced invoices
    select b.company, b.side, b.card_code, 'OLDER', null, null, null, null, null,
           b.balance - coalesce(sum(a.open_amount), 0)
    from bal b
    left join alloc a on a.company = b.company and a.card_code = b.card_code
    where b.balance > 0
    group by b.company, b.side, b.card_code, b.balance
    having b.balance - coalesce(sum(a.open_amount), 0) > 0.5
    union all                                  -- credit balances (advances received / paid)
    select company, side, card_code, 'ADVANCE', null, null, null, null, null, balance
    from bal where balance < 0
)
select i.company, i.side, i.doc_type, i.doc_entry, i.doc_num, i.doc_date, i.due_date,
       i.card_code, b.card_name, coalesce(i.slp_code, b.slp_code) as slp_code, s.name as salesperson,
       i.open_amount,
       rpt.today() - i.due_date as days_overdue,
       case i.doc_type when 'OLDER' then '120+'
                       when 'ADVANCE' then 'Advance'
                       else rpt.aging_bucket(rpt.today() - i.due_date) end as bucket
from items i
left join core.bp b on b.company = i.company and b.card_code = i.card_code
left join core.salesperson s on s.company = i.company and s.slp_code = coalesce(i.slp_code, b.slp_code);
comment on view rpt.v_open_items is
  'Estimated open items per business partner (side = receivable or payable). Each partner''s exact SAP '
  'balance is allocated to their most recent invoices first. doc_type OLDER = balance older than the synced '
  'invoices (bucket 120+); ADVANCE = credit balance. Totals per partner equal the SAP balance.';

create view rpt.v_receivable_aging as
select i.company, i.card_code, max(i.card_name) as card_name, max(i.salesperson) as salesperson,
       coalesce(sum(i.open_amount) filter (where i.bucket = 'Not due'), 0) as not_due,
       coalesce(sum(i.open_amount) filter (where i.bucket = '0-30'), 0)    as d0_30,
       coalesce(sum(i.open_amount) filter (where i.bucket = '31-60'), 0)   as d31_60,
       coalesce(sum(i.open_amount) filter (where i.bucket = '61-90'), 0)   as d61_90,
       coalesce(sum(i.open_amount) filter (where i.bucket = '91-120'), 0)  as d91_120,
       coalesce(sum(i.open_amount) filter (where i.bucket = '120+'), 0)    as d120_plus,
       coalesce(sum(i.open_amount) filter (where i.bucket in ('91-120', '120+')), 0) as over_90,
       coalesce(sum(i.open_amount) filter (where i.bucket = 'Advance'), 0) as advance,
       sum(i.open_amount) as balance
from rpt.v_open_items i
where i.side = 'receivable'
group by i.company, i.card_code;
comment on view rpt.v_receivable_aging is
  'Receivables aging per customer (estimated buckets, exact balance). over_90 = 91-120 + 120+. '
  'advance = credit balance (customer paid in advance), negative.';

create view rpt.v_payable_aging as
select i.company, i.card_code, max(i.card_name) as card_name,
       coalesce(sum(i.open_amount) filter (where i.bucket = 'Not due'), 0) as not_due,
       coalesce(sum(i.open_amount) filter (where i.bucket = '0-30'), 0)    as d0_30,
       coalesce(sum(i.open_amount) filter (where i.bucket = '31-60'), 0)   as d31_60,
       coalesce(sum(i.open_amount) filter (where i.bucket = '61-90'), 0)   as d61_90,
       coalesce(sum(i.open_amount) filter (where i.bucket = '91-120'), 0)  as d91_120,
       coalesce(sum(i.open_amount) filter (where i.bucket = '120+'), 0)    as d120_plus,
       coalesce(sum(i.open_amount) filter (where i.bucket in ('91-120', '120+')), 0) as over_90,
       coalesce(sum(i.open_amount) filter (where i.bucket = 'Advance'), 0) as advance,
       sum(i.open_amount) as balance
from rpt.v_open_items i
where i.side = 'payable'
group by i.company, i.card_code;
comment on view rpt.v_payable_aging is
  'Payables aging per vendor (estimated buckets, exact balance). advance = we paid in advance, negative.';

-- ---------------------------------------------------------------- money, stock
create view rpt.v_bank_cash as
select a.company, a.code, a.name, a.format_code, a.balance,
       coalesce(c.kind, case when a.format_code like '1210%' then 'bank'
                             when a.format_code like '1211%' then 'cash' end) as kind
from core.account a
left join rpt.account_class c on c.company = a.company and c.code = a.code
where coalesce(c.kind, case when a.format_code like '1210%' then 'bank'
                            when a.format_code like '1211%' then 'cash' end) in ('bank', 'cash');
comment on view rpt.v_bank_cash is
  'Bank and cash GL accounts with current balance. Rule: FormatCode 1210* = bank, 1211* = cash, '
  'overridden by rpt.account_class (DRAFT, to be confirmed by Accounts). Negative balance = overdraft / CC.';

create view rpt.v_stock as
select s.company, s.item_code, i.item_name, i.group_code, g.name as item_group_name, i.uom,
       s.on_hand, s.committed, s.ordered, s.avg_price, s.on_hand * s.avg_price as stock_value,
       coalesce(nullif(s.min_level, 0), i.min_level) as min_level
from core.item_stock s
left join core.item i on i.company = s.company and i.item_code = s.item_code
left join core.item_group g on g.company = i.company and g.group_code = i.group_code;
comment on view rpt.v_stock is 'Stock on hand per item (all warehouses) valued at item average cost.';

-- ---------------------------------------------------------------- daily KPIs
create table rpt.kpi_daily (
    company   text    not null,
    day       date    not null,
    metric    text    not null,     -- sale, quotation, order, purchase, receipt, payment
    amount    numeric not null,
    doc_count int     not null,
    primary key (company, day, metric)
);
comment on table rpt.kpi_daily is
  'Daily totals per KPI (net, before GST). sale excludes inter-company customers. '
  'receipt = incoming payments, payment = vendor payments. Rebuilt after every sync cycle.';

create or replace function rpt.refresh_kpi(p_company text) returns void
language plpgsql security definer set search_path = rpt, core, pg_temp as $$
begin
    delete from rpt.kpi_daily where company = p_company;
    insert into rpt.kpi_daily
    select company, doc_date, 'sale', sum(net_amount), count(*)
    from rpt.v_sales_docs where company = p_company and not is_intercompany group by company, doc_date
    union all
    select company, doc_date, case doc_type when 'QUOTE' then 'quotation' else 'order' end, sum(net_total), count(*)
    from core.doc where company = p_company and doc_type in ('QUOTE', 'ORDER') and not is_cancelled
    group by company, doc_date, doc_type
    union all
    select company, doc_date, 'purchase', sum(net_amount), count(*)
    from rpt.v_purchase_docs where company = p_company group by company, doc_date
    union all
    select company, doc_date, case direction when 'in' then 'receipt' else 'payment' end, sum(total), count(*)
    from rpt.v_payments where company = p_company group by company, doc_date, direction;
end $$;

create view rpt.v_sync_status as
select c.company, c.finished_at as last_sync_at, c.ok as last_sync_ok,
       (select max(at) from raw.heartbeat) as last_heartbeat_at
from (select distinct on (company) * from raw.sync_cycle order by company, finished_at desc) c;
comment on view rpt.v_sync_status is 'Time of the last completed sync cycle per company and the last agent heartbeat.';
