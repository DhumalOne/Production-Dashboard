import "server-only";
import { dbWeb } from "../db";
import { COMPANY } from "./home";

export const DOC_TYPES = ["AR_INV", "AR_CN", "DELIVERY", "ORDER", "QUOTE"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export interface DocHeader {
  docType: DocType;
  label: string;
  docEntry: number;
  docNum: number;
  docDate: string;
  dueDate: string | null;
  cardCode: string;
  cardName: string;
  salesperson: string | null;
  net: number;
  gross: number;
  isOpen: boolean;
  isCancelled: boolean;
}

export interface DocLine {
  lineNum: number;
  itemCode: string | null;
  itemName: string | null;
  quantity: number;
  uom: string | null;
  price: number | null;
  amount: number;
  openQty: number | null;
  baseType: DocType | null;
  baseEntry: number | null;
  baseNum: number | null;
  baseDate: string | null;
  orderEntry: number | null;
  orderNum: number | null;
  orderDate: string | null;
}

/** One sales document with its lines and, per line, the delivery and sales order it came from. */
export async function salesDocument(type: DocType, entry: number): Promise<{ header: DocHeader; lines: DocLine[] } | null> {
  const sql = dbWeb();
  const [[header], lines] = await Promise.all([
    sql<DocHeader[]>`
      select doc_type as "docType", doc_label as label, doc_entry as "docEntry", doc_num as "docNum",
             to_char(doc_date, 'YYYY-MM-DD') as "docDate", to_char(due_date, 'YYYY-MM-DD') as "dueDate",
             card_code as "cardCode", card_name as "cardName", salesperson, net_amount as net, gross_amount as gross,
             is_open as "isOpen", is_cancelled as "isCancelled"
      from rpt.v_documents where company = ${COMPANY} and doc_type = ${type} and doc_entry = ${entry}`,
    sql<DocLine[]>`
      select line_num as "lineNum", item_code as "itemCode", item_name as "itemName", quantity, uom, price,
             net_amount as amount, open_qty as "openQty",
             base_doc_type as "baseType", base_entry as "baseEntry", base_doc_num as "baseNum",
             to_char(base_doc_date, 'YYYY-MM-DD') as "baseDate",
             order_entry as "orderEntry", order_num as "orderNum", to_char(order_date, 'YYYY-MM-DD') as "orderDate"
      from rpt.v_document_lines where company = ${COMPANY} and doc_type = ${type} and doc_entry = ${entry}
      order by line_num`,
  ]);
  return header ? { header, lines } : null;
}

export interface FollowOn { docType: DocType; docEntry: number; docNum: number; docDate: string; amount: number }

/** What was made from this document: deliveries and invoices from an order, invoices from a delivery. */
export async function followOnDocuments(type: DocType, entry: number): Promise<FollowOn[]> {
  if (type !== "ORDER" && type !== "DELIVERY" && type !== "QUOTE") return [];
  const sql = dbWeb();
  const next = { QUOTE: ["ORDER"], ORDER: ["DELIVERY", "AR_INV"], DELIVERY: ["AR_INV"] }[type];
  const link = type === "ORDER" ? sql`(base_doc_type = 'ORDER' and base_entry = ${entry}) or order_entry = ${entry}`
    : sql`base_doc_type = ${type} and base_entry = ${entry}`;
  return sql<FollowOn[]>`
    select doc_type as "docType", doc_entry as "docEntry", max(doc_num) as "docNum",
           to_char(max(doc_date), 'YYYY-MM-DD') as "docDate", sum(net_amount) as amount
    from rpt.v_document_lines
    where company = ${COMPANY} and doc_type in ${sql(next)} and (${link})
    group by doc_type, doc_entry
    order by max(doc_date), doc_type`;
}
