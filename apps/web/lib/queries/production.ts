import "server-only";
import { dbWeb } from "../db";
import type { DateRange } from "../period";
import { COMPANY } from "./home";

export interface ProductionLine {
  orderNum: number | null;
  receiptNum: number;
  itemCode: string;
  itemName: string;
  uom: string | null;
  shift: string | null;
  unitCost: number | null;
  itemAvgCost: number | null;
  productionQty: number;
  okQty: number;
  okValue: number;
  rejectedQty: number;
  rejectedValue: number;
  rejectPct: number | null;
}

/** V9 "Daily Item wise Production": one row per production order × receipt × item for the day. */
export async function productionOn(day: string): Promise<ProductionLine[]> {
  const sql = dbWeb();
  return sql<ProductionLine[]>`
    select p.order_num as "orderNum", p.receipt_num as "receiptNum", p.item_code as "itemCode",
           coalesce(max(p.item_name), p.item_code) as "itemName", max(p.uom) as uom, max(p.shift) as shift,
           case when sum(p.production_qty) <> 0 then sum(p.ok_value + p.rejected_value) / sum(p.production_qty) end as "unitCost",
           max(s.avg_price) as "itemAvgCost",
           sum(p.production_qty) as "productionQty", sum(p.ok_qty) as "okQty", sum(p.ok_value) as "okValue",
           sum(p.rejected_qty) as "rejectedQty", sum(p.rejected_value) as "rejectedValue",
           case when sum(p.production_qty) <> 0 then 100 * sum(p.rejected_qty) / sum(p.production_qty) end as "rejectPct"
    from rpt.v_production_lines p
    left join rpt.v_stock s on s.company = p.company and s.item_code = p.item_code
    where p.company = ${COMPANY} and p.doc_date = ${day}
    group by p.order_num, p.receipt_num, p.item_code
    order by p.receipt_num, p.item_code`;
}

export interface ProductSummary {
  itemCode: string;
  itemName: string;
  uom: string | null;
  plannedQty: number | null;
  okQty: number;
  rejectedQty: number;
  okValue: number;
  rejectPct: number | null;
}

/** V9 "Product wise Summary" over a period; planned qty = planned quantity of the production orders received against. */
export async function productSummary(range: DateRange, limit = 200): Promise<ProductSummary[]> {
  const sql = dbWeb();
  return sql<ProductSummary[]>`
    with p as (
      select * from rpt.v_production_lines
      where company = ${COMPANY} and doc_date between ${range.from} and ${range.to}
    ), planned as (
      select o.item_code, sum(o.planned_qty) as planned_qty
      from (select distinct order_num from p) x
      join rpt.v_production_orders o on o.company = ${COMPANY} and o.doc_num = x.order_num
      group by o.item_code
    )
    select p.item_code as "itemCode", coalesce(max(p.item_name), p.item_code) as "itemName", max(p.uom) as uom,
           max(pl.planned_qty) as "plannedQty", sum(p.ok_qty) as "okQty", sum(p.rejected_qty) as "rejectedQty",
           sum(p.ok_value) as "okValue",
           case when sum(p.production_qty) <> 0 then 100 * sum(p.rejected_qty) / sum(p.production_qty) end as "rejectPct"
    from p left join planned pl on pl.item_code = p.item_code
    group by p.item_code
    order by sum(p.ok_value) desc
    limit ${limit}`;
}

export interface ProductionTotals { okValue: number; rejectedValue: number; okQty: number; rejectedQty: number; receipts: number }

export async function productionTotals(range: DateRange): Promise<ProductionTotals> {
  const sql = dbWeb();
  const [t] = await sql<ProductionTotals[]>`
    select coalesce(sum(ok_value), 0) as "okValue", coalesce(sum(rejected_value), 0) as "rejectedValue",
           coalesce(sum(ok_qty), 0) as "okQty", coalesce(sum(rejected_qty), 0) as "rejectedQty",
           count(distinct doc_entry)::int as receipts
    from rpt.v_production_lines
    where company = ${COMPANY} and doc_date between ${range.from} and ${range.to}`;
  return t;
}

/** PRD §4.9: items with the most rejection in a period (by rejected value). */
export async function topRejections(range: DateRange, limit = 5): Promise<ProductSummary[]> {
  const sql = dbWeb();
  return sql<ProductSummary[]>`
    select item_code as "itemCode", coalesce(max(item_name), item_code) as "itemName", max(uom) as uom, null as "plannedQty",
           sum(ok_qty) as "okQty", sum(rejected_qty) as "rejectedQty", sum(rejected_value) as "okValue",
           case when sum(production_qty) <> 0 then 100 * sum(rejected_qty) / sum(production_qty) end as "rejectPct"
    from rpt.v_production_lines
    where company = ${COMPANY} and doc_date between ${range.from} and ${range.to}
    group by item_code having sum(rejected_qty) > 0
    order by sum(rejected_value) desc limit ${limit}`;
}

/** How many recent production lines carry shift / operator: tells the screen whether those summaries can be shown. */
export async function fieldCoverage(range: DateRange): Promise<{ lines: number; shift: number; operator: number }> {
  const sql = dbWeb();
  const [r] = await sql<{ lines: number; shift: number; operator: number }[]>`
    select count(*)::int as lines, count(shift)::int as shift, count(operator)::int as operator
    from rpt.v_production_lines where company = ${COMPANY} and doc_date between ${range.from} and ${range.to}`;
  return r;
}
