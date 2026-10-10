import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { qualifyPublicCurrentReadiness } from "../lib/public-production-current-readiness";

const allArchive = {
  intelligence: true,
  global_risk: true,
  risk_indices: true,
};
const hot = {
  intelligence: { ok: true, serving_store: "cloudflare-d1" },
  global_risk: { ok: true, serving_store: "cloudflare-d1" },
  risk_indices: { ok: true, serving_store: "cloudflare-d1" },
};

describe("#1827 truthful deep production readiness, current versus last verified", () => {
  it("requires every product's independent D1 hot proof and B2 baseline", () => {
    const result = qualifyPublicCurrentReadiness(allArchive, hot);
    expect(result.all_current_hot_products_ready).toBe(true);
    expect(result.current_hot_product_ready).toEqual(allArchive);
    expect(result.last_verified_baseline_readable).toEqual(allArchive);
  });

  it.each(["intelligence", "global_risk", "risk_indices"] as const)(
    "%s: historical B2 readable never means CURRENT when hot expired",
    (key) => {
      const broken = {
        ...hot,
        [key]: { ok: false, serving_store: null },
      };
      const report = qualifyPublicCurrentReadiness(allArchive, broken);
      expect(report.last_verified_baseline_readable[key]).toBe(true);
      expect(report.current_hot_product_ready[key]).toBe(false);
      expect(report.all_current_hot_products_ready).toBe(false);
    },
  );

  it("never promotes D1-only data when its archive/edge baseline is unavailable", () => {
    const result = qualifyPublicCurrentReadiness(
      { ...allArchive, global_risk: false },
      hot,
    );
    expect(result.last_verified_baseline_readable.global_risk).toBe(false);
    expect(result.current_hot_product_ready.global_risk).toBe(false);
    expect(result.all_current_hot_products_ready).toBe(false);
  });

  it("rejects missing and forged hot-proof serving origins", () => {
    for (const forged of [
      undefined,
      null,
      { ok: true, serving_store: "backblaze-b2" },
      { ok: "true", serving_store: "cloudflare-d1" },
      { ok: true, serving_store: null },
    ]) {
      const report = qualifyPublicCurrentReadiness(
        allArchive,
        { ...hot, intelligence: forged },
      );
      expect(report.current_hot_product_ready.intelligence).toBe(false);
      expect(report.all_current_hot_products_ready).toBe(false);
    }
  });

  it("wires the actual hosted health endpoint to qualified CURRENT readiness", () => {
    const source = readFileSync("src/routes/api.health.ts", "utf8");
    expect(source).toContain("qualifyPublicCurrentReadiness(");
    expect(source).toContain("const intelligenceReady = readiness.current_hot_product_ready.intelligence");
    expect(source).toContain("const globalRiskReady = readiness.current_hot_product_ready.global_risk");
    expect(source).toContain("const riskIndicesReady = readiness.current_hot_product_ready.risk_indices");
    expect(source).toContain("const d1HotServingReady = readiness.all_current_hot_products_ready");
    expect(source).toContain("last_verified_baseline_readable: readiness.last_verified_baseline_readable");
    expect(source).toContain("current_hot_product_ready: readiness.current_hot_product_ready");
    expect(source).toContain("status: deepReady ? 200 : 503");
    expect(source).toContain("supabase_required_for_serving: false");
  });
});
