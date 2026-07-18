import { describe, it, expect } from "vitest";
import { toMinor, fromMinor, formatMoney, parseAmountInput } from "./money";

describe("money", () => {
  it("convierte decimales a unidades mínimas sin errores de punto flotante", () => {
    expect(toMinor(19.99)).toBe(1999);
    expect(toMinor(0.1) + toMinor(0.2)).toBe(30); // no da 29.999...
  });

  it("vuelve de unidades mínimas a decimal", () => {
    expect(fromMinor(1999)).toBe(19.99);
  });

  it("formatea con símbolo correcto por moneda", () => {
    expect(formatMoney(150000, "UYU")).toContain("$U");
    expect(formatMoney(150000, "USD")).toContain("US$");
  });

  it("rechaza montos inválidos o negativos", () => {
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("-5")).toBeNull();
    expect(parseAmountInput("100")).toBe(10000);
  });
});
