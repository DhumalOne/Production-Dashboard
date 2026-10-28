-- Document detail: the lines of any synced document, with where each line came from. An invoice line points to
-- its delivery (SAP object 15) or straight to its sales order (17); a delivery line points to its order. Credit
-- memo lines point to the invoice they reverse (13).

-- Finding what was made from a document (deliveries from an order, invoices from a delivery).
create index doc_line_base_idx on core.doc_line (company, base_type, base_entry);

create view rpt.v_document_lines as
select l.company, l.doc_type, l.doc_entry, d.doc_num, d.doc_date, l.line_num,
       l.item_code, coalesce(l.item_name, i.item_name) as item_name, l.quantity, l.uom, l.price,
       l.line_net as net_amount, l.tax, l.warehouse, l.open_qty, l.is_open,
       -- the document this line was copied from
       case l.base_type when 13 then 'AR_INV' when 15 then 'DELIVERY' when 17 then 'ORDER' when 23 then 'QUOTE' end as base_doc_type,
       case when l.base_type in (13, 15, 17, 23) then l.base_entry end as base_entry,
       b.doc_num as base_doc_num, b.doc_date as base_doc_date,
       -- the sales order behind it: directly, or through the delivery
       coalesce(case when l.base_type = 17 then l.base_entry end, case when dl.base_type = 17 then dl.base_entry end) as order_entry,
       o.doc_num as order_num, o.doc_date as order_date
from core.doc_line l
join core.doc d on d.company = l.company and d.doc_type = l.doc_type and d.doc_entry = l.doc_entry
left join core.item i on i.company = l.company and i.item_code = l.item_code
left join core.doc b on b.company = l.company and b.doc_entry = l.base_entry
     and b.doc_type = case l.base_type when 13 then 'AR_INV' when 15 then 'DELIVERY' when 17 then 'ORDER' when 23 then 'QUOTE' end
left join core.doc_line dl on l.base_type = 15 and dl.company = l.company and dl.doc_type = 'DELIVERY'
     and dl.doc_entry = l.base_entry and dl.line_num = l.base_line
left join core.doc o on o.company = l.company and o.doc_type = 'ORDER'
     and o.doc_entry = coalesce(case when l.base_type = 17 then l.base_entry end, case when dl.base_type = 17 then dl.base_entry end);
comment on view rpt.v_document_lines is
  'Lines of every synced document (all doc types, amounts unsigned, after header discount, before tax). '
  'base_doc_type/base_doc_num: the document the line was copied from (an invoice from a DELIVERY or ORDER, a '
  'delivery from an ORDER, a credit memo from an AR_INV). order_num: the sales order behind the line, directly or '
  'through its delivery. open_qty: quantity still open (orders).';

grant select on rpt.v_document_lines to dash_web, dash_ai;
