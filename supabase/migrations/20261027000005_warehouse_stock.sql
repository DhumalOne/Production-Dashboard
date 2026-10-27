-- Stock is valued per warehouse in DHUMAL_LIVE (item-level AvgStdPrice is 0), so the agent now sends
-- item-warehouse rows (entity WarehouseStock, key "ItemCode|WarehouseCode") instead of ItemStock.

create table core.whs_stock (
    company    text    not null,
    item_code  text    not null,
    warehouse  text    not null,
    on_hand    numeric not null default 0,
    committed  numeric not null default 0,
    ordered    numeric not null default 0,
    min_stock  numeric not null default 0,
    avg_price  numeric not null default 0,
    primary key (company, item_code, warehouse)
);

create or replace function core.apply_whs() returns trigger
language plpgsql security definer set search_path = core, raw, pg_temp as $$
declare
    rec raw.record;
begin
    if tg_op = 'DELETE' then rec := old; else rec := new; end if;
    delete from core.whs_stock
    where company = rec.company and item_code = split_part(rec.key, '|', 1) and warehouse = split_part(rec.key, '|', 2);
    if tg_op <> 'DELETE' then
        insert into core.whs_stock values (
            rec.company, rec.doc->>'ItemCode', rec.doc->>'WarehouseCode', core.n(rec.doc->>'InStock'),
            core.n(rec.doc->>'Committed'), core.n(rec.doc->>'Ordered'), core.n(rec.doc->>'MinimalStock'),
            core.n(rec.doc->>'StandardAveragePrice'));
    end if;
    return null;
end $$;

create trigger record_to_whs_stock
after insert or update on raw.record
for each row when (new.entity = 'WarehouseStock') execute function core.apply_whs();
create trigger record_to_whs_stock_delete
after delete on raw.record
for each row when (old.entity = 'WarehouseStock') execute function core.apply_whs();

-- Retire the item-level snapshot.
drop view rpt.v_stock;
delete from raw.record where entity = 'ItemStock';
drop table core.item_stock;

create view rpt.v_stock as
select s.company, s.item_code, i.item_name, i.group_code, g.name as item_group_name, i.uom,
       sum(s.on_hand) as on_hand, sum(s.committed) as committed, sum(s.ordered) as ordered,
       sum(s.on_hand * s.avg_price) as stock_value,
       case when sum(s.on_hand) <> 0 then sum(s.on_hand * s.avg_price) / sum(s.on_hand) end as avg_price,
       coalesce(nullif(i.min_level, 0), nullif(sum(s.min_stock), 0)) as min_level
from core.whs_stock s
left join core.item i on i.company = s.company and i.item_code = s.item_code
left join core.item_group g on g.company = i.company and g.group_code = i.group_code
group by s.company, s.item_code, i.item_name, i.group_code, g.name, i.uom, i.min_level;
comment on view rpt.v_stock is
  'Stock per item across all warehouses, valued at each warehouse''s average cost. min_level = item minimum '
  '(Item Master) or the sum of warehouse minimums.';

create view rpt.v_stock_by_warehouse as
select s.company, s.warehouse, w.name as warehouse_name, s.item_code, i.item_name, i.group_code,
       g.name as item_group_name, s.on_hand, s.committed, s.ordered, s.avg_price,
       s.on_hand * s.avg_price as stock_value, s.min_stock
from core.whs_stock s
left join core.warehouse w on w.company = s.company and w.code = s.warehouse
left join core.item i on i.company = s.company and i.item_code = s.item_code
left join core.item_group g on g.company = i.company and g.group_code = i.group_code;
comment on view rpt.v_stock_by_warehouse is 'Stock per item and warehouse with value at the warehouse average cost.';

grant select on rpt.v_stock, rpt.v_stock_by_warehouse to dash_web;
