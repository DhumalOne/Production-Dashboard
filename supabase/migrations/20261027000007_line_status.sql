-- Lines read through $crossjoin carry raw SAP codes ("O"/"C") instead of the Service Layer enum
-- ("bost_Open"/"bost_Close"), so core.apply() saw every line as closed. The line trigger now sets
-- is_open from either form, alongside unit_price.

create or replace function core.apply_line_prices() returns trigger
language plpgsql security definer set search_path = core, raw, pg_temp as $$
declare
    dt text;
begin
    select doc_type into dt from core.doc_type where entity = new.entity;
    if dt is null then return null; end if;
    update core.doc_line l
       set unit_price = nullif(x->>'UnitPrice', '')::numeric,
           is_open    = x->>'LineStatus' in ('O', 'bost_Open')
      from jsonb_array_elements(coalesce(new.doc->'DocumentLines', '[]')) x
     where l.company = new.company and l.doc_type = dt and l.doc_entry = new.key::int
       and l.line_num = (x->>'LineNum')::int;
    return null;
end $$;
comment on function core.apply_line_prices() is
  'Line extras applied after core.apply(): list price, and open status from either "O" or "bost_Open".';

update core.doc_line l
   set is_open = x->>'LineStatus' in ('O', 'bost_Open')
  from raw.record r
  join core.doc_type t on t.entity = r.entity
  cross join lateral jsonb_array_elements(coalesce(r.doc->'DocumentLines', '[]')) x
 where l.company = r.company and l.doc_type = t.doc_type and l.doc_entry = r.key::int
   and l.line_num = (x->>'LineNum')::int;
