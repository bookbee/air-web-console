import { describe, expect, it } from "vitest";

import { formatCost, num, pct, text, yn } from "../format";

describe("value formatters", () => {
  it("yn renders booleans and falls back to an em dash", () => {
    expect(yn(true)).toBe("yes");
    expect(yn(false)).toBe("no");
    expect(yn(undefined)).toBe("—");
    expect(yn(null)).toBe("—");
  });

  it("num formats finite numbers and falls back otherwise", () => {
    expect(num(3)).toBe("3");
    expect(num(3.14159, 2)).toBe("3.14");
    expect(num("nope")).toBe("—");
    expect(num(Number.NaN)).toBe("—");
  });

  it("pct renders a rounded percentage", () => {
    expect(pct(0.96)).toBe("96%");
    expect(pct(1)).toBe("100%");
    expect(pct("nope")).toBe("—");
  });

  it("text renders an em dash for null/undefined/empty-string", () => {
    expect(text(null)).toBe("—");
    expect(text(undefined)).toBe("—");
    expect(text("")).toBe("—");
    expect(text(0)).toBe("0");
    expect(text("hi")).toBe("hi");
  });
});

describe("formatCost", () => {
  it("shows USD first, with an approximate INR figure alongside it", () => {
    expect(formatCost(0.00042, 87)).toBe("$0.00042 · ~₹0.04");
  });

  it("respects a custom precision", () => {
    expect(formatCost(1.5, 10, 2)).toBe("$1.50 · ~₹15.00");
  });
});
