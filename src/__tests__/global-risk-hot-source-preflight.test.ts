import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  assertCurrentGlobalRiskSourceForHotPublish,
  GLOBAL_RISK_HOT_SOURCE_MAX_AGE_MS,
  GLOBAL_RISK_MAX_FUTURE_SKEW_MS,
} from "../../scripts/lib/global-risk-hot-source-preflight.mjs";

const now = Date.parse("2026-10-09T12:00:00Z");
const at = (ageMs: number) => new Date(now - ageMs).toISOString();

describe("#1827 genuine Global Risk hot snapshot preflight (no stale re-publication)", () => {
  it("accepts only canonical source evidence within the real 90-minute hot window", () => {
    expect(assertCurrentGlobalRiskSourceForHotPublish(at(0), now).eligible_for_hot_publication).toBe(true);
    expect(assertCurrentGlobalRiskSourceForHotPublish(at(GLOBAL_RISK_HOT_SOURCE_MAX_AGE_MS), now).eligible_for_hot_publication).toBe(true);
  });

  it("rejects the existing 2026-10-08 historic checkpoint at 2026-10-09 wall time", () => {
    expect(() => assertCurrentGlobalRiskSourceForHotPublish("2026-10-08T22:09:36.639Z", now))
      .toThrow("GLOBAL_RISK_SOURCE_STALE_FOR_D1_HOT_PUBLISH");
    expect(() => assertCurrentGlobalRiskSourceForHotPublish(at(GLOBAL_RISK_HOT_SOURCE_MAX_AGE_MS + 1), now))
      .toThrow("GLOBAL_RISK_SOURCE_STALE_FOR_D1_HOT_PUBLISH");
  });

  it("never promotes unknown or future source times to a fresh synthetic assessment", () => {
    expect(() => assertCurrentGlobalRiskSourceForHotPublish("n/a", now))
      .toThrow("GLOBAL_RISK_SOURCE_AS_OF_INVALID");
    expect(() => assertCurrentGlobalRiskSourceForHotPublish(new Date(now + GLOBAL_RISK_MAX_FUTURE_SKEW_MS + 1).toISOString(), now))
      .toThrow("GLOBAL_RISK_SOURCE_AS_OF_IN_FUTURE");
  });

  it("blocks legacy GRI Supabase snapshot writers when the authoritative budget is frozen", () => {
    const workflow = readFileSync(".github/workflows/gri-realtime-direct-postgres.yml", "utf8");
    const guard = workflow.indexOf("node scripts/ops/supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    const cluster = workflow.indexOf("run: node scripts/cluster-gri-stories-v12.js");
    const compute = workflow.indexOf("run: node scripts/compute-gri-v12.js");
    expect(guard).toBeGreaterThan(0);
    expect(cluster).toBeGreaterThan(guard);
    expect(compute).toBeGreaterThan(cluster);
  });

  it("checks original source freshness before any Global Risk or Risk Indices B2 network operation", () => {
    for (const path of [
      "scripts/ops/publish-b2-global-risk-direct-postgres.mjs",
      "scripts/ops/publish-b2-risk-indices-direct-postgres.mjs",
    ]) {
      const publisher = readFileSync(path, "utf8");
      const check = publisher.indexOf("assertCurrentGlobalRiskSourceForHotPublish(latestSnapshot.as_of);");
      const b2 = publisher.indexOf("const b2 = createB2Client(");
      const put = publisher.indexOf("await b2.put(");
      expect(check, path).toBeGreaterThan(0);
      expect(b2, path).toBeGreaterThan(check);
      expect(put, path).toBeGreaterThan(b2);
    }
  });
});
