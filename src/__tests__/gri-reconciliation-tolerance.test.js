import { describe, expect, it } from "vitest";
import {
  GRI_RECONCILIATION_TOLERANCE,
  reconcilesWithinTolerance,
} from "../../scripts/lib/gri-proof-v11.js";

describe("GRI reconciliation precision contract", () => {
  it("uses a one-millionth-point numerical tolerance", () => {
    expect(GRI_RECONCILIATION_TOLERANCE).toBe(1e-6);
  });

  it("accepts the observed deterministic serialization residue", () => {
    expect(reconcilesWithinTolerance(-4.9e-7)).toBe(true);
  });

  it("accepts the exact boundary", () => {
    expect(reconcilesWithinTolerance(1e-6)).toBe(true);
    expect(reconcilesWithinTolerance(-1e-6)).toBe(true);
  });

  it("rejects values beyond the contract", () => {
    expect(reconcilesWithinTolerance(1.000001e-6)).toBe(false);
    expect(reconcilesWithinTolerance(-1.000001e-6)).toBe(false);
  });

  it("handles baseline and invalid values safely", () => {
    expect(reconcilesWithinTolerance(null)).toBe(true);
    expect(reconcilesWithinTolerance(Number.NaN)).toBe(false);
    expect(reconcilesWithinTolerance(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
