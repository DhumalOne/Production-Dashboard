-- Production (V9 "Production Report"): production orders and receipts from production.
-- Machine minutes, downtime and operator standard quantity have no SAP source yet (open question Q-PRD-1).

create table core.prod_order (
    company      text not null,
    abs_entry    int  not null,
    doc_num      bigint,
    item_code    text,
    item_name    text,
    status       text,
    order_type   text,
    planned_qty  numeric,
    completed_qty numeric,
    rejected_qty numeric,
    posting_date date,
    due_date     date,
    warehouse    text,
    uom          text,
    primary key (company, abs_entry)
);

create table core.prod_receipt_line (
    company        text    not null,
    doc_entry      int     not null,
    line_num       int     not null,
    doc_num        bigint,
    doc_date       date,
    item_code      text,
    item_name      text,
    quantity       numeric not null default 0,
    uom            text,
    line_total     numeric not null default 0,
    warehouse      text,
    base_type      int,
    base_entry     int,
    is_reject      boolean not null default false,
    shift          text,
    operator       text,
    setup_operator text,
    supervisor     text,
    primary key (company, doc_entry, line_num)
);
create index prod_receipt_line_date_idx on core.prod_receipt_line (company, doc_date);

create or replace function core.apply_production() returns trigger
language plpgsql security definer set search_path = core, raw, pg_temp as $$
declare
    rec raw.record;
    d   jsonb;
begin
    if tg_op = 'DELETE' then rec := old; else rec := new; end if;
    d := rec.doc;
    if rec.entity = 'ProductionOrders' then
        delete from core.prod_order where company = rec.company and abs_entry = rec.key::int;
        if tg_op <> 'DELETE' then
            insert into core.prod_order values (
                rec.company, rec.key::int, (d->>'DocumentNumber')::bigint, d->>'ItemNo', d->>'ProductDescription',
                d->>'ProductionOrderStatus', d->>'ProductionOrderType', nullif(d->>'PlannedQuantity', '')::numeric,
                nullif(d->>'CompletedQuantity', '')::numeric, nullif(d->>'RejectedQuantity', '')::numeric,
                core.d(d->>'PostingDate'), core.d(d->>'DueDate'), d->>'Warehouse', d->>'InventoryUOM');
        end if;
    else  -- ProductionReceipts
        delete from core.prod_receipt_line where company = rec.company and doc_entry = rec.key::int;
        if tg_op <> 'DELETE' then
            insert into core.prod_receipt_line
            select rec.company, rec.key::int, (l->>'LineNum')::int, (d->>'DocNum')::bigint, core.d(d->>'DocDate'),
                   l->>'ItemCode', l->>'ItemDescription', core.n(l->>'Quantity'), l->>'MeasureUnit',
                   core.n(l->>'LineTotal'), l->>'WarehouseCode', (l->>'BaseType')::int, (l->>'BaseEntry')::int,
                   -- $crossjoin returns raw codes ("R"), the entity API the enum name ("botrntReject")
                   coalesce(l->>'TransactionType' in ('R', 'botrntReject'), false),
                   nullif(l->>'U_Shift', ''), nullif(l->>'U_PRDOPERATOR', ''), nullif(l->>'U_SETUPOPERATOR', ''),
                   nullif(l->>'U_Supervisor', '')
            from jsonb_array_elements(coalesce(d->'DocumentLines', '[]')) l;
        end if;
    end if;
    return null;
end $$;

create trigger record_to_production
after insert or update on raw.record
for each row when (new.entity in ('ProductionOrders', 'ProductionReceipts')) execute function core.apply_production();
create trigger record_to_production_delete
after delete on raw.record
for each row when (old.entity in ('ProductionOrders', 'ProductionReceipts')) execute function core.apply_production();

create view rpt.v_production_lines as
select r.company, r.doc_entry, r.doc_num as receipt_num, r.doc_date, rpt.fy_label(r.doc_date) as fy,
       o.doc_num as order_num, r.item_code, coalesce(r.item_name, o.item_name) as item_name, r.uom,
       r.shift, r.operator, r.setup_operator, r.supervisor, r.warehouse,
       r.quantity as production_qty,
       case when r.is_reject then 0 else r.quantity end as ok_qty,
       case when r.is_reject then r.quantity else 0 end as rejected_qty,
       case when r.quantity <> 0 then r.line_total / r.quantity end as unit_cost,
       case when r.is_reject then 0 else r.line_total end as ok_value,
       case when r.is_reject then r.line_total else 0 end as rejected_value
from core.prod_receipt_line r
left join core.prod_order o on o.company = r.company and o.abs_entry = r.base_entry
where r.base_type = 202;
comment on view rpt.v_production_lines is
  'Receipts from production, one row per receipt line: OK (completed) or rejected quantity and value at '
  'production cost. shift, operator, setup_operator and supervisor come from SAP user-defined fields. '
  'Rejection % = rejected_qty / production_qty.';

create view rpt.v_production_orders as
select company, abs_entry, doc_num, item_code, item_name, status, order_type, planned_qty, completed_qty,
       rejected_qty, posting_date, due_date, warehouse, uom
from core.prod_order;
comment on view rpt.v_production_orders is
  'Production orders. status: boposPlanned, boposReleased, boposClosed, boposCancelled.';

-- Daily KPIs gain "production" (OK production value), shown on Home as Today's production.
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
    from rpt.v_payments where company = p_company group by company, doc_date, direction
    union all
    select company, doc_date, 'production', sum(ok_value), count(distinct doc_entry)
    from rpt.v_production_lines where company = p_company group by company, doc_date;
end $$;
revoke execute on function rpt.refresh_kpi(text) from public;

grant select on all tables in schema rpt to dash_web;
