-- Stock cover (days of stock at the recent usage rate) and the customer card.

-- Goods issues: material leaving stock, mostly issues for production (base_type 202).
create table core.goods_issue_line (
    company    text    not null,
    doc_entry  int     not null,
    line_num   int     not null,
    doc_num    bigint,
    doc_date   date,
    item_code  text,
    quantity   numeric not null default 0,
    uom        text,
    line_total numeric not null default 0,
    warehouse  text,
    base_type  int,
    base_entry int,
    primary key (company, doc_entry, line_num)
);
create index goods_issue_line_item_idx on core.goods_issue_line (company, item_code, doc_date);

create or replace function core.apply_goods_issue() returns trigger
language plpgsql security definer set search_path = core, raw, pg_temp as $$
declare
    rec raw.record;
    d   jsonb;
begin
    if tg_op = 'DELETE' then rec := old; else rec := new; end if;
    d := rec.doc;
    delete from core.goods_issue_line where company = rec.company and doc_entry = rec.key::int;
    if tg_op <> 'DELETE' then
        insert into core.goods_issue_line
        select rec.company, rec.key::int, (l->>'LineNum')::int, (d->>'DocNum')::bigint, core.d(d->>'DocDate'),
               l->>'ItemCode', core.n(l->>'Quantity'), l->>'MeasureUnit', core.n(l->>'LineTotal'),
               l->>'WarehouseCode', (l->>'BaseType')::int, (l->>'BaseEntry')::int
        from jsonb_array_elements(coalesce(d->'DocumentLines', '[]')) l;
    end if;
    return null;
end $$;

create trigger record_to_goods_issue
after insert or update on raw.record
for each row when (new.entity = 'GoodsIssues') execute function core.apply_goods_issue();
create trigger record_to_goods_issue_delete
after delete on raw.record
for each row when (old.entity = 'GoodsIssues') execute function core.apply_goods_issue();

create view rpt.v_goods_issue_lines as
select g.company, g.doc_entry, g.doc_num, g.doc_date, g.item_code, i.item_name, g.quantity, g.uom,
       g.line_total as value, g.warehouse, g.base_type = 202 as for_production, g.base_entry
from core.goods_issue_line g
left join core.item i on i.company = g.company and i.item_code = g.item_code;
comment on view rpt.v_goods_issue_lines is
  'Goods issues (material taken out of stock), one row per line. for_production = issued to a production order '
  '(raw material consumption). value is at cost.';

-- Movement now includes production: goods issues (material used) and receipts from production (output).
create or replace view rpt.v_item_movement as
select company, item_code, max(doc_date) as last_movement
from (
    select l.company, l.item_code, d.doc_date
    from core.doc_line l
    join core.doc d on d.company = l.company and d.doc_type = l.doc_type and d.doc_entry = l.doc_entry
    where d.doc_type in ('AR_INV', 'AR_CN', 'DELIVERY', 'AP_INV', 'AP_CN') and not d.is_cancelled
    union all
    select company, item_code, doc_date from core.goods_issue_line
    union all
    select company, item_code, doc_date from core.prod_receipt_line
) m
group by company, item_code;
comment on view rpt.v_item_movement is
  'Last date an item moved: sale, delivery, purchase, goods issue (e.g. to production) or receipt from production.';

-- Usage = goods issues + deliveries over the last 90 days; cover = stock on hand / average daily usage.
create view rpt.v_stock_cover as
with used as (
    select company, item_code, sum(quantity) as qty
    from (
        select company, item_code, quantity from core.goods_issue_line where doc_date > rpt.today() - 90
        union all
        select l.company, l.item_code, l.quantity
        from core.doc_line l join core.doc d using (company, doc_type, doc_entry)
        where l.doc_type = 'DELIVERY' and not d.is_cancelled and d.doc_date > rpt.today() - 90
    ) u
    group by 1, 2
)
select s.company, s.item_code, s.item_name, s.group_code, s.item_group_name, s.uom, s.on_hand, s.committed,
       s.ordered, s.stock_value, s.min_level,
       coalesce(u.qty, 0) as used_90d,
       coalesce(u.qty, 0) / 90.0 as daily_use,
       case when coalesce(u.qty, 0) > 0 then greatest(s.on_hand, 0) / (u.qty / 90.0) end as cover_days,
       s.avg_price
from rpt.v_stock s
left join used u on u.company = s.company and u.item_code = s.item_code;
comment on view rpt.v_stock_cover is
  'Days of stock cover per item: stock on hand divided by average daily usage over the last 90 days '
  '(goods issues, mainly to production, plus deliveries to customers). cover_days is null when the item was not '
  'used in 90 days. ordered = quantity on open purchase orders.';

-- Customer master, for the customer card.
create view rpt.v_customers as
select b.company, b.card_code, b.card_name, b.city, b.phone, b.credit_limit, b.is_active,
       b.slp_code, sp.name as salesperson, coalesce(bal.balance, 0) as balance
from core.bp b
left join core.salesperson sp on sp.company = b.company and sp.slp_code = b.slp_code
left join core.bp_balance bal on bal.company = b.company and bal.card_code = b.card_code
where b.card_type = 'cCustomer';
comment on view rpt.v_customers is
  'Customers (SAP business partners of type customer): city, phone, credit limit, assigned salesperson and '
  'current account balance (what they owe us; negative = advance).';

-- How quickly each customer pays: receipts in the last 365 days matched to the invoices they settled,
-- weighted by amount. days_to_pay = receipt date - invoice date; days_late = receipt date - due date.
create view rpt.v_customer_payment_days as
select p.company, p.card_code,
       round(sum(a.amount * (p.doc_date - i.doc_date)) / nullif(sum(a.amount), 0)) as days_to_pay,
       round(sum(a.amount * (p.doc_date - coalesce(i.due_date, i.doc_date))) / nullif(sum(a.amount), 0)) as days_late,
       sum(a.amount) as amount_paid, count(distinct p.doc_entry) as receipts
from raw.record r
cross join lateral (
    select (pi->>'DocEntry')::int as inv_entry, core.n(pi->>'SumApplied') as amount
    from jsonb_array_elements(coalesce(r.doc->'PaymentInvoices', '[]')) pi
    where pi->>'InvoiceType' in ('it_Invoice', '13')
) a
join core.payment p on p.company = r.company and p.direction = 'in' and p.doc_entry = r.key::int
join core.doc i on i.company = r.company and i.doc_type = 'AR_INV' and i.doc_entry = a.inv_entry
where r.entity = 'IncomingPayments' and not p.is_cancelled and p.doc_date > rpt.today() - 365 and a.amount > 0
group by p.company, p.card_code;
comment on view rpt.v_customer_payment_days is
  'Payment habit per customer over the last 365 days, weighted by amount: days_to_pay = average days from invoice '
  'to receipt, days_late = average days past the due date (negative = paid early).';

grant select on rpt.v_goods_issue_lines, rpt.v_stock_cover, rpt.v_customers, rpt.v_customer_payment_days to dash_web, dash_ai;
