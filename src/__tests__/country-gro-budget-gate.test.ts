import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/b2-country-gro-continuity.yml", "utf8");
const canonicalRefresh = readFileSync("scripts/refresh-global-canonical-risk-objects.ts", "utf8");
const budget = readFileSync("scripts/ops/supabase-free-tier-budget.mjs", "utf8");

describe("#1827 country GRO publisher respects frozen Supabase free-tier budget", () => {
  it("blocks all recurring DB writers and costly B2 publishing before hot canary or seed", () => {
    const authoritative = workflow.indexOf("- name: Verify authoritative direct PostgreSQL source");
    const guard = workflow.indexOf("- name: Enforce canonical Supabase budget before country GRO writers and B2 seed");
    const canary = workflow.indexOf("- name: Check whether verified D1 country GRO hot serving already exists");
    const seed = workflow.indexOf("- name: Seed existing VERIFIED current GROs before the long global refresh");
    const refresh = workflow.indexOf("- name: Refresh global commercially governed canonical GROs");
    const publish = workflow.indexOf("- name: Publish all currently VERIFIED GROs after refresh");
    expect(authoritative).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(authoritative);
    expect(canary).toBeGreaterThan(guard);
    expect(seed).toBeGreaterThan(canary);
    expect(refresh).toBeGreaterThan(seed);
    expect(publish).toBeGreaterThan(refresh);
    const preflight = workflow.slice(guard, canary);
    expect(preflight).toContain("set -euo pipefail");
    expect(preflight).toContain("node scripts/ops/supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(budget).toContain("SUPABASE_FREE_TIER_BULK_WRITE_FROZEN");
    expect(budget).toContain("SUPABASE_FREE_TIER_HEADROOM_REQUIRED");
    expect(budget).toContain("process.exitCode = 78");
  });

  it("guards a real publishing mutator, not merely a read-only country scan", () => {
    expect(canonicalRefresh).toContain("await publishCountryRiskObject({");
    expect(workflow).toContain("GLOBAL_CANONICAL_MIN_READY: \"195\"");
    expect(workflow).toContain("GLOBAL_GRO_D1_MIN_INDEXED: \"195\"");
    expect(workflow).toContain("if: always()");
    expect(workflow).not.toContain("GLOBAL_CANONICAL_MIN_READY: \"1\"");
  });
});
