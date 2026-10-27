import { describe, expect, it } from "vitest";
import { dayCount, fyLabel, parseAsOf, previousYear, resolvePeriod, todayIST } from "./period";

describe("as-of date", () => {
  it("accepts past dates and rejects future or invalid ones", () => {
    expect(parseAsOf("2026-09-30", "2026-10-27")).toBe("2026-09-30");
    expect(parseAsOf("2026-11-01", "2026-10-27")).toBe("2026-10-27");
    expect(parseAsOf("junk", "2026-10-27")).toBe("2026-10-27");
    expect(parseAsOf(undefined, "2026-10-27")).toBe("2026-10-27");
  });
});

describe("Indian financial year", () => {
  it("starts on 1 April", () => {
    expect(fyLabel("2026-10-27")).toBe("FY 2026-27");
    expect(fyLabel("2027-03-31")).toBe("FY 2026-27");
    expect(fyLabel("2027-04-01")).toBe("FY 2027-28");
  });
  it("YTD runs from 1 April", () => {
    expect(resolvePeriod("ytd", "2026-10-27")).toMatchObject({ from: "2026-04-01", to: "2026-10-27" });
    expect(resolvePeriod("ytd", "2027-02-10")).toMatchObject({ from: "2026-04-01" });
  });
  it("quarters start Apr, Jul, Oct, Jan", () => {
    expect(resolvePeriod("qtd", "2026-05-15").from).toBe("2026-04-01");
    expect(resolvePeriod("qtd", "2026-09-30").from).toBe("2026-07-01");
    expect(resolvePeriod("qtd", "2026-10-27").from).toBe("2026-10-01");
    expect(resolvePeriod("qtd", "2027-03-01").from).toBe("2027-01-01");
  });
});

describe("periods", () => {
  it("MTD and today", () => {
    expect(resolvePeriod("mtd", "2026-10-27")).toMatchObject({ from: "2026-10-01", to: "2026-10-27" });
    expect(resolvePeriod("today", "2026-10-27")).toMatchObject({ from: "2026-10-27", to: "2026-10-27" });
  });
  it("custom ranges are validated and ordered", () => {
    expect(resolvePeriod("custom", "2026-10-27", { from: "2026-09-30", to: "2026-09-01" }))
      .toMatchObject({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod("custom", "2026-10-27", { from: "junk" }).from).toBe("2026-10-01");
  });
  it("previous year handles 29 Feb", () => {
    expect(previousYear({ from: "2028-02-01", to: "2028-02-29" })).toEqual({ from: "2027-02-01", to: "2027-02-28" });
  });
  it("counts days inclusively", () => expect(dayCount({ from: "2026-10-01", to: "2026-10-27" })).toBe(27));
  it("uses India time", () => {
    // 20:00 UTC on 26 Oct is already 27 Oct in India
    expect(todayIST(new Date("2026-10-26T20:00:00Z"))).toBe("2026-10-27");
  });
});
