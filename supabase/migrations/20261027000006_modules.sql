-- Views for the remaining V9 modules: purchase, orders & dispatch, inventory, cash; plus list price on
-- document lines (needed for "price after discount" and "total discount %" in the item trends).

-- ---------------------------------------------------------------- list price on lines
alter table core.doc_line add column unit_price numeric;   -- SAP UnitPrice: price before line discount

-- Runs after record_to_core (triggers fire in name order) and fills unit_price for the lines just written.
create or replace function core.apply_line_prices() returns trigger
language plpgsql security definer set search_path = core, raw, pg_temp as $$
declare
    dt text;
begin
    select doc_type into dt from core.doc_type where entity = new.entity;
    if dt is null then return null; end if;
    update core.doc_line l
       set unit_price = nullif(x->>'UnitPrice', '')::numeric
      from jsonb_array_elements(coalesce(new.doc->'DocumentLines', '[]')) x
     where l.company = new.company and l.doc_type = dt and l.doc_entry = new.key::int
       and l.line_num = (x->>'LineNum')::int;
    return null;
end $$;

create trigger record_to_core_prices
after insert or update on raw.record
for each row execute function core.apply_line_prices();

update core.doc_line l
   set unit_price = nullif(x->>'UnitPrice', '')::numeric
  from raw.record r
  join core.doc_type t on t.entity = r.entity
  cross join lateral jsonb_array_elements(coalesce(r.doc->'DocumentLines', '[]')) x
 where l.company = r.company and l.doc_type = t.doc_type and l.doc_entry = r.key::int
   and l.line_num = (x->>'LineNum')::int;

-- ---------------------------------------------------------------- sales lines: add list amount
create or replace view rpt.v_sales_lines as
select d.company, d.doc_type, d.doc_entry, d.doc_num, d.doc_date, rpt.fy_label(d.doc_date) as fy,
       d.card_code, d.card_name, coalesce(l.slp_code, d.slp_code) as slp_code, s.name as salesperson,
       l.line_num, l.item_code, l.item_name, i.group_code as item_group, g.name as item_group_name,
       t.sign * l.quantity as quantity, l.uom,
       t.sign * l.line_net as net_amount,
       case when l.gross_buy_price is not null
            then t.sign * (l.line_net - l.quantity * l.gross_buy_price) end as gross_margin,
       l.warehouse,
       (x.card_code is not null) as is_intercompany,
       t.sign * l.quantity * l.unit_price as list_amount
from core.doc d
join core.doc_type t on t.doc_type = d.doc_type
join core.doc_line l on l.company = d.company and l.doc_type = d.doc_type and l.doc_entry = d.doc_entry
left join core.salesperson s on s.company = d.company and s.slp_code = coalesce(l.slp_code, d.slp_code)
left join core.item i on i.company = d.company and i.item_code = l.item_code
left join core.item_group g on g.company = i.company and g.group_code = i.group_code
left join rpt.excluded_customer x on x.company = d.company and x.card_code = d.card_code
where d.doc_type in ('AR_INV', 'AR_CN') and not d.is_cancelled;
comment on column rpt.v_sales_lines.list_amount is
  'Quantity x list price (before line and header discounts). Total discount % = 1 - net_amount / list_amount.';

-- ---------------------------------------------------------------- purchase
create view rpt.v_purchase_lines as
select d.company, d.doc_type, d.doc_entry, d.doc_num, d.doc_date, rpt.fy_label(d.doc_date) as fy,
       d.card_code as vendor_code, d.card_name as vendor_name,
       d.slp_code as buyer_code, s.name as buyer,
       l.line_num, l.item_code, l.item_name, i.group_code as item_group, g.name as item_group_name,
       t.sign * l.quantity as quantity, l.uom,
       t.sign * l.line_net as net_amount,
       t.sign * l.quantity * l.unit_price as list_amount
from core.doc d
join core.doc_type t on t.doc_type = d.doc_type
join core.doc_line l on l.company = d.company and l.doc_type = d.doc_type and l.doc_entry = d.doc_entry
left join core.salesperson s on s.company = d.company and s.slp_code = d.slp_code
left join core.item i on i.company = d.company and i.item_code = l.item_code
left join core.item_group g on g.company = i.company and g.group_code = i.group_code
where d.doc_type in ('AP_INV', 'AP_CN') and not d.is_cancelled;
comment on view rpt.v_purchase_lines is
  'Purchase per line: A/P invoices positive, A/P credit memos negative, before GST, cancelled excluded. '
  'buyer = the document''s purchasing employee (SAP sales employee field). '
  'Price after discount = net_amount / quantity.';

create view rpt.v_po_lines as
select d.company, d.doc_entry, d.doc_num, d.doc_date, coalesce(l.ship_date, d.due_date) as due_date,
       d.card_code as vendor_code, d.card_name as vendor_name, d.slp_code as buyer_code, s.name as buyer,
       l.line_num, l.item_code, l.item_name, l.quantity, l.uom, l.line_net as net_amount,
       coalesce(l.open_qty, 0) as open_qty,
       case when l.quantity <> 0 then coalesce(l.open_qty, 0) * l.line_net / l.quantity else 0 end as open_value,
       (d.is_open and coalesce(l.is_open, false) and coalesce(l.open_qty, 0) > 0) as is_pending
from core.doc d
join core.doc_line l on l.company = d.company and l.doc_type = d.doc_type and l.doc_entry = d.doc_entry
left join core.salesperson s on s.company = d.company and s.slp_code = d.slp_code
where d.doc_type = 'PO' and not d.is_cancelled;
comment on view rpt.v_po_lines is
  'Purchase order lines. is_pending = line still open with quantity to receive; due_date = line delivery date.';

-- ---------------------------------------------------------------- orders and dispatch
create view rpt.v_order_lines as
select d.company, d.doc_entry, d.doc_num, d.doc_date, coalesce(l.ship_date, d.due_date) as due_date,
       d.card_code, d.card_name, coalesce(l.slp_code, d.slp_code) as slp_code, s.name as salesperson,
       l.line_num, l.item_code, l.item_name, l.quantity, l.uom, l.price, l.line_net as net_amount,
       coalesce(l.open_qty, 0) as open_qty,
       case when l.quantity <> 0 then coalesce(l.open_qty, 0) * l.line_net / l.quantity else 0 end as open_value,
       (d.is_open and coalesce(l.is_open, false) and coalesce(l.open_qty, 0) > 0) as is_pending,
       l.warehouse,
       (x.card_code is not null) as is_intercompany
from core.doc d
join core.doc_line l on l.company = d.company and l.doc_type = d.doc_type and l.doc_entry = d.doc_entry
left join core.salesperson s on s.company = d.company and s.slp_code = coalesce(l.slp_code, d.slp_code)
left join rpt.excluded_customer x on x.company = d.company and x.card_code = d.card_code
where d.doc_type = 'ORDER' and not d.is_cancelled;
comment on view rpt.v_order_lines is
  'Sales order lines. is_pending = still to deliver (open line with open_qty > 0). open_value = open qty at '
  'the line''s net price. due_date = line delivery date (falls back to order due date).';

create view rpt.v_delivery_lines as
select d.company, d.doc_entry, d.doc_num, d.doc_date, d.card_code, d.card_name,
       l.line_num, l.item_code, l.item_name, l.quantity, l.uom, l.price, l.line_net as net_amount, l.warehouse,
       l.base_type, l.base_entry
from core.doc d
join core.doc_line l on l.company = d.company and l.doc_type = d.doc_type and l.doc_entry = d.doc_entry
where d.doc_type = 'DELIVERY' and not d.is_cancelled;
comment on view rpt.v_delivery_lines is 'Delivery (dispatch) lines, cancelled excluded.';

create view rpt.v_pending_by_item as
with demand as (
    select company, item_code, max(item_name) as item_name, sum(open_qty) as open_qty, sum(open_value) as open_value,
           count(distinct doc_entry) as orders, min(due_date) as earliest_due
    from rpt.v_order_lines where is_pending group by company, item_code
)
select dm.company, dm.item_code, dm.item_name, st.item_group_name, dm.open_qty, dm.open_value, dm.orders,
       dm.earliest_due, coalesce(st.on_hand, 0) as on_hand,
       greatest(dm.open_qty - coalesce(st.on_hand, 0), 0) as shortage
from demand dm
left join rpt.v_stock st on st.company = dm.company and st.item_code = dm.item_code;
comment on view rpt.v_pending_by_item is
  'Pending sales-order demand per item against stock on hand (all warehouses). shortage = open qty - on hand.';

-- ---------------------------------------------------------------- inventory movement
create view rpt.v_item_movement as
select l.company, l.item_code, max(d.doc_date) as last_movement
from core.doc_line l
join core.doc d on d.company = l.company and d.doc_type = l.doc_type and d.doc_entry = l.doc_entry
where d.doc_type in ('AR_INV', 'AR_CN', 'DELIVERY', 'AP_INV', 'AP_CN') and not d.is_cancelled
group by l.company, l.item_code;
comment on view rpt.v_item_movement is
  'Last date an item appeared on a sale, delivery or purchase document. Production issues and receipts are '
  'not synced yet, so items moved only by production can look slow-moving.';

grant select on all tables in schema rpt to dash_web;
