-- V9 "Quotation Dashboard": quotation value by salesperson, item and customer.
create view rpt.v_quotation_lines as
select d.company, d.doc_entry, d.doc_num, d.doc_date, rpt.fy_label(d.doc_date) as fy, d.is_open,
       d.card_code, d.card_name, coalesce(l.slp_code, d.slp_code) as slp_code, s.name as salesperson,
       l.line_num, l.item_code, l.item_name, l.quantity, l.uom, l.line_net as net_amount
from core.doc d
join core.doc_line l on l.company = d.company and l.doc_type = d.doc_type and l.doc_entry = d.doc_entry
left join core.salesperson s on s.company = d.company and s.slp_code = coalesce(l.slp_code, d.slp_code)
where d.doc_type = 'QUOTE' and not d.is_cancelled;
comment on view rpt.v_quotation_lines is 'Sales quotation lines, before GST, cancelled excluded.';

grant select on rpt.v_quotation_lines to dash_web;
