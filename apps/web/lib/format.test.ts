import { describe, expect, it } from "vitest";
import { formatChange, formatINR, formatQty } from "./format";

describe("formatINR", () => {
  it("uses lakh and crore", () => {
    expect(formatINR(27_600_000)).toBe("₹2.76 Cr");
    expect(formatINR(4_520_000)).toBe("₹45.2 L");
    expect(formatINR(250_000)).toBe("₹2.5 L");
    expect(formatINR(1_234_567_890)).toBe("₹123.5 Cr");
  });
  it("groups small amounts the Indian way", () => {
    expect(formatINR(8450)).toBe("₹8,450");
    expect(formatINR(1_234_567, { exact: true })).toBe("₹12,34,567");
  });
  it("marks negatives with a sign", () => {
    expect(formatINR(-218_000_000)).toBe("−₹21.8 Cr");
  });
  it("handles missing values", () => {
    expect(formatINR(null)).toBe("—");
  });
});

describe("formatQty", () => {
  it("adds the unit", () => expect(formatQty(123456.5, "KGS")).toBe("1,23,456.5 KGS"));
});

describe("formatChange", () => {
  it("shows signed percentage and direction", () => {
    expect(formatChange(112, 100)).toEqual({ text: "+12.0%", direction: "up" });
    expect(formatChange(90, 100)).toEqual({ text: "−10.0%", direction: "down" });
    expect(formatChange(5, 0)).toEqual({ text: "—", direction: "none" });
  });
});
