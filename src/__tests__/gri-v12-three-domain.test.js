import { describe, expect, it } from "vitest";

import {
  GRI_CATEGORIES as V11_CATEGORIES,
  GRI_METHOD_VERSION as V11_METHOD,
} from "../../scripts/lib/gri-engine-v11.js";

import {
  GRI_CATEGORIES as V12_CATEGORIES,
  GRI_METHOD_VERSION as V12_METHOD,
  methodologyManifest,
} from "../../scripts/lib/gri-engine-v12.js";

describe("GRI methodology version isolation", () => {
  it("preserves the historical v1.1 four-domain contract", () => {
    expect(V11_METHOD).toBe("gri-v1.1.0");
    expect(V11_CATEGORIES).toEqual([
      "geopolitics",
      "macro",
      "rare_earth",
      "crypto",
    ]);
  });

  it("defines v1.2 as exactly three active domains", () => {
    expect(V12_METHOD).toBe("gri-v1.2.0");
    expect(V12_CATEGORIES).toEqual([
      "geopolitics",
      "macro",
      "rare_earth",
    ]);
    expect(V12_CATEGORIES).not.toContain("crypto");
  });

  it("uses equal base weights across the three v1.2 domains", () => {
    const manifest = methodologyManifest();
    const weights = manifest.categories;

    expect(Object.keys(weights)).toEqual([
      "geopolitics",
      "macro",
      "rare_earth",
    ]);

    expect(weights.geopolitics).toBeCloseTo(1 / 3, 12);
    expect(weights.macro).toBeCloseTo(1 / 3, 12);
    expect(weights.rare_earth).toBeCloseTo(1 / 3, 12);
    expect(weights.crypto).toBeUndefined();
  });
});
