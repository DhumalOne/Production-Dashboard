import "server-only";
import { dbWeb } from "../db";
import { COMPANY } from "./home";

export interface GroupValue { key: string; name: string; value: number; items: number; share: number }

export async function stockByCategory(): Promise<{ rows: GroupValue[]; total: number }> {
  const sql = dbWeb();
  const rows = await sql<Omit<GroupValue, "share">[]>`
    select coalesce(group_code::text, '-') as key, coalesce(item_group_name, 'No group') as name,
           sum(stock_value) as value, count(*) filter (where on_hand <> 0)::int as items
    from rpt.v_stock where company = ${COMPANY}
    group by 1, 2 order by value desc`;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return { total, rows: rows.map((r) => ({ ...r, share: total ? r.value / total : 0 })) };
}

export async function stockByWarehouse(limit = 30): Promise<GroupValue[]> {
  const sql = dbWeb();
  const rows = await sql<Omit<GroupValue, "share">[]>`
    select warehouse as key, coalesce(max(warehouse_name), warehouse) as name,
           sum(stock_value) as value, count(*) filter (where on_hand <> 0)::int as items
    from rpt.v_stock_by_warehouse where company = ${COMPANY}
    group by warehouse order by value desc limit ${limit}`;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows.map((r) => ({ ...r, share: total ? r.value / total : 0 }));
}

export interface StockItem {
  itemCode: string;
  itemName: string;
  category: string | null;
  uom: string | null;
  onHand: number;
  avgPrice: number | null;
  value: number;
}

export async function topStockItems(limit = 50): Promise<StockItem[]> {
  const sql = dbWeb();
  return sql<StockItem[]>`
    select item_code as "itemCode", coalesce(item_name, item_code) as "itemName", item_group_name as category, uom,
           on_hand as "onHand", avg_price as "avgPrice", stock_value as value
    from rpt.v_stock where company = ${COMPANY} and stock_value > 0
    order by stock_value desc limit ${limit}`;
}

/** A category ("-" = items with no group) or a warehouse, as linked from the Inventory share bars. */
export type StockFilter = { category: string } | { warehouse: string };

const filterSql = (sql: ReturnType<typeof dbWeb>, f: StockFilter) =>
  "category" in f
    ? f.category === "-" ? sql`and group_code is null` : sql`and group_code::text = ${f.category}`
    : sql`and warehouse = ${f.warehouse}`;

/** Items in one category or warehouse, by value; also the split the other way (warehouses of a category, categories of a warehouse). */
export async function stockDetail(f: StockFilter): Promise<{ title: string; items: StockItem[]; split: GroupValue[]; total: number }> {
  const sql = dbWeb();
  const where = filterSql(sql, f);
  const splitKey = "category" in f
    ? sql`warehouse as key, coalesce(max(warehouse_name), warehouse) as name`
    : sql`coalesce(group_code::text, '-') as key, coalesce(max(item_group_name), 'No group') as name`;
  const [items, split, [t]] = await Promise.all([
    sql<StockItem[]>`
      select w.item_code as "itemCode", coalesce(w.item_name, w.item_code) as "itemName", max(w.item_group_name) as category,
             max(s.uom) as uom, sum(w.on_hand) as "onHand", sum(w.stock_value) / nullif(sum(w.on_hand), 0) as "avgPrice",
             sum(w.stock_value) as value
      from (select * from rpt.v_stock_by_warehouse where company = ${COMPANY} ${where} and on_hand <> 0) w
      left join rpt.v_stock s on s.company = w.company and s.item_code = w.item_code
      group by w.item_code, w.item_name order by value desc`,
    sql<Omit<GroupValue, "share">[]>`
      select ${splitKey}, sum(stock_value) as value, count(*) filter (where on_hand <> 0)::int as items
      from rpt.v_stock_by_warehouse where company = ${COMPANY} ${where}
      group by 1 order by value desc`,
    sql<{ title: string | null }[]>`
      select ${"category" in f ? sql`max(item_group_name)` : sql`max(warehouse_name)`} as title
      from rpt.v_stock_by_warehouse where company = ${COMPANY} ${where}`,
  ]);
  const total = split.reduce((s, r) => s + r.value, 0);
  const fallback = "category" in f ? (f.category === "-" ? "No group" : f.category) : f.warehouse;
  return { title: t?.title ?? fallback, items, total, split: split.map((r) => ({ ...r, share: total ? r.value / total : 0 })) };
}

export interface BelowMin {
  itemCode: string;
  itemName: string;
  uom: string | null;
  onHand: number;
  minLevel: number;
  shortfall: number;
  pendingQty: number | null;
}

/** Items at or below minimum stock; pendingQty set when sales orders are also waiting for the item. */
export async function belowMinimum(limit = 200): Promise<BelowMin[]> {
  const sql = dbWeb();
  return sql<BelowMin[]>`
    select s.item_code as "itemCode", coalesce(s.item_name, s.item_code) as "itemName", s.uom,
           s.on_hand as "onHand", s.min_level as "minLevel", s.min_level - s.on_hand as shortfall,
           p.open_qty as "pendingQty"
    from rpt.v_stock s
    left join rpt.v_pending_by_item p on p.company = s.company and p.item_code = s.item_code
    where s.company = ${COMPANY} and s.min_level > 0 and s.on_hand <= s.min_level
    order by (p.open_qty is null), s.min_level - s.on_hand desc
    limit ${limit}`;
}

export interface SlowItem extends StockItem { lastMovement: string | null; days: number | null }

/** Stock with no sale, delivery or purchase for 90+ days (or none on record since April 2025). */
export async function slowMoving(minDays = 90, limit = 100): Promise<{ rows: SlowItem[]; value90: number; value180: number }> {
  const sql = dbWeb();
  const base = sql`
    from rpt.v_stock s
    left join rpt.v_item_movement m on m.company = s.company and m.item_code = s.item_code
    where s.company = ${COMPANY} and s.stock_value > 0`;
  const [rows, [t]] = await Promise.all([
    sql<SlowItem[]>`
      select s.item_code as "itemCode", coalesce(s.item_name, s.item_code) as "itemName", s.item_group_name as category,
             s.uom, s.on_hand as "onHand", s.avg_price as "avgPrice", s.stock_value as value,
             to_char(m.last_movement, 'YYYY-MM-DD') as "lastMovement", rpt.today() - m.last_movement as days
      ${base} and (m.last_movement is null or m.last_movement < rpt.today() - ${minDays}::int)
      order by s.stock_value desc limit ${limit}`,
    sql<{ v90: number; v180: number }[]>`
      select coalesce(sum(s.stock_value) filter (where m.last_movement is null or m.last_movement < rpt.today() - 90), 0) as v90,
             coalesce(sum(s.stock_value) filter (where m.last_movement is null or m.last_movement < rpt.today() - 180), 0) as v180
      ${base}`,
  ]);
  return { rows, value90: t.v90, value180: t.v180 };
}

// ---------------------------------------------------------------- orders & dispatch

export interface OrderLine {
  docNum: number;
  docDate: string;
  dueDate: string | null;
  cardCode: string;
  cardName: string;
  itemCode: string;
  itemName: string;
  uom: string | null;
  quantity: number;
  price: number | null;
  value: number;
  openQty?: number;
  openValue?: number;
  onHand?: number;
  overdue?: boolean;
  canShip?: boolean;
}

export async function ordersOn(day: string): Promise<OrderLine[]> {
  const sql = dbWeb();
  return sql<OrderLine[]>`
    select doc_num as "docNum", to_char(doc_date, 'YYYY-MM-DD') as "docDate", to_char(due_date, 'YYYY-MM-DD') as "dueDate",
           card_code as "cardCode", card_name as "cardName", item_code as "itemCode", item_name as "itemName", uom, quantity, price,
           net_amount as value, open_qty as "openQty", open_value as "openValue"
    from rpt.v_order_lines where company = ${COMPANY} and doc_date = ${day}
    order by doc_num desc, line_num`;
}

export async function dispatchOn(day: string): Promise<OrderLine[]> {
  const sql = dbWeb();
  return sql<OrderLine[]>`
    select doc_num as "docNum", to_char(doc_date, 'YYYY-MM-DD') as "docDate", null as "dueDate",
           card_code as "cardCode", card_name as "cardName", item_code as "itemCode", item_name as "itemName", uom, quantity, price,
           net_amount as value
    from rpt.v_delivery_lines where company = ${COMPANY} and doc_date = ${day}
    order by doc_num desc, line_num`;
}

export interface PendingSummary { age: string; orders: number; value: number }

export async function pendingByAge(): Promise<PendingSummary[]> {
  const sql = dbWeb();
  return sql<PendingSummary[]>`
    select case when doc_date >= rpt.today() - 30 then '0–30 days'
                when doc_date >= rpt.today() - 90 then '31–90 days'
                when doc_date >= rpt.today() - 180 then '91–180 days'
                else 'Over 180 days' end as age,
           count(distinct doc_entry)::int as orders, sum(open_value) as value
    from rpt.v_order_lines where company = ${COMPANY} and is_pending
    group by 1 order by min(rpt.today() - doc_date)`;
}

/** Pending order lines with stock beside each line (V9 Pending Order), newest first. */
export async function pendingOrders(opts: { maxAgeDays?: number; overdueOnly?: boolean; limit?: number }): Promise<OrderLine[]> {
  const sql = dbWeb();
  const age = opts.maxAgeDays ? sql`and o.doc_date >= rpt.today() - ${opts.maxAgeDays}::int` : sql``;
  const overdue = opts.overdueOnly ? sql`and o.due_date < rpt.today()` : sql``;
  return sql<OrderLine[]>`
    select o.doc_num as "docNum", to_char(o.doc_date, 'YYYY-MM-DD') as "docDate", to_char(o.due_date, 'YYYY-MM-DD') as "dueDate",
           o.card_code as "cardCode", o.card_name as "cardName", o.item_code as "itemCode", o.item_name as "itemName", o.uom, o.quantity, o.price,
           o.net_amount as value, o.open_qty as "openQty", o.open_value as "openValue",
           coalesce(s.on_hand, 0) as "onHand", o.due_date < rpt.today() as overdue,
           coalesce(s.on_hand, 0) >= o.open_qty as "canShip"
    from rpt.v_order_lines o
    left join rpt.v_stock s on s.company = o.company and s.item_code = o.item_code
    where o.company = ${COMPANY} and o.is_pending ${age} ${overdue}
    order by o.due_date nulls last, o.doc_num
    limit ${opts.limit ?? 300}`;
}

export interface ItemShortage {
  itemCode: string;
  itemName: string;
  category: string | null;
  openQty: number;
  onHand: number;
  shortage: number;
  orders: number;
}

/** V9 "Balance Quantity and Stock": open order quantity per item against stock on hand. */
export async function shortages(limit = 100): Promise<ItemShortage[]> {
  const sql = dbWeb();
  return sql<ItemShortage[]>`
    select item_code as "itemCode", coalesce(item_name, item_code) as "itemName", item_group_name as category,
           open_qty as "openQty", on_hand as "onHand", shortage, orders::int
    from rpt.v_pending_by_item where company = ${COMPANY} and shortage > 0
    order by shortage * coalesce(open_value / nullif(open_qty, 0), 0) desc
    limit ${limit}`;
}
