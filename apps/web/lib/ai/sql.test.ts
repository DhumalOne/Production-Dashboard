import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { checkSql, SqlRejected } = await import("./sql");

describe("checkSql", () => {
  it("accepts SELECT and WITH, dropping a trailing semicolon", () => {
    expect(checkSql("select 1;")).toBe("select 1");
    expect(checkSql("  WITH x AS (select 1) select * from x  ")).toBe("WITH x AS (select 1) select * from x");
  });
  it("allows keywords inside string literals and column names", () => {
    expect(() => checkSql("select * from rpt.v_documents where card_name = 'DELETE ME'")).not.toThrow();
    expect(() => checkSql("select max(updated_on) from rpt.v_documents")).not.toThrow();
  });
  it.each([
    ["delete from rpt.kpi_daily", "only SELECT"],
    ["select 1; drop table x", "multiple statements"],
    ["with d as (delete from rpt.kpi_daily returning *) select * from d", "data-modifying CTE"],
    ["select * into tmp from rpt.v_stock", "SELECT INTO"],
    ["update rpt.kpi_daily set amount = 0", "UPDATE"],
    ["copy rpt.v_stock to '/tmp/x'", "COPY"],
    ["", "empty"],
  ])("rejects %s (%s)", (sql) => {
    expect(() => checkSql(sql)).toThrow(SqlRejected);
  });
});
