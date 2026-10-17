import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("website lock governance", () => {
  it("keeps the lock workflow immutable at the action and credential boundary without baseline self-locking", () => {
    const workflow = read(".github/workflows/website-lock.yml");
    const verifier = read("scripts/ops/verify-website-lock.mjs");

    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toMatch(/uses: actions\/checkout@[0-9a-f]{40}/);
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("node scripts/ops/verify-website-lock.mjs");
    expect(workflow).toContain("Website lock self-test failed");

    expect(verifier).toContain("if (!config.locked)");
    expect(verifier).toContain("const protectedExact = new Set([");
    expect(verifier).toContain("const protectedPrefixes = [");
    expect(verifier).toContain("Intentional website changes require explicit founder approval");
    expect(verifier).not.toContain("lockInfrastructure.has(path)");
  });

  it("keeps the finalized Global Risk presentation pinned to its immutable approved baseline", () => {
    const workflow = read(".github/workflows/website-lock.yml");
    const verifier = read("scripts/ops/verify-website-lock.mjs");

    expect(verifier).toContain('const GLOBAL_RISK_FROZEN_BASELINE = "0270ab7876cabe372c246f76fbcf299ed1b0e1fc"');
    expect(verifier).toContain('"src/routes/global-risk.tsx"');
    expect(verifier).toContain('"src/components/gri/global-risk-domain-indices.tsx"');
    expect(verifier).toContain("GEOMACRO GLOBAL RISK FINAL LOCK VIOLATION");
    expect(verifier).toContain("byte-for-byte equivalent to its frozen baseline");
    expect(workflow).toContain("Prove final Global Risk lock fails closed");
    expect(workflow).toContain("global-risk-final-lock-negative-self-test");
    expect(workflow).toContain("Final Global Risk lock self-test failed");
  });

  it("keeps the published presentation baseline fail-closed", () => {
    const config = JSON.parse(read("config/website-lock.json"));
    expect(config.locked).toBe(true);
    expect(config.baseline_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(config.published_source_sha).toMatch(/^[0-9a-f]{40}$/);
    // Founder-authorized source-redaction baseline stays enabled. Visual/live
    // publication is independently accepted; it is never presumed by CI.
    expect(config.lock_revision).toBe("founder-approved-find-card-v1-public-schema-and-intelligence-cards-20261017");
    const findApproval = config.approved_find_card_v1_presentation_change;
    expect(findApproval?.approved_ui_commit).toBe(config.baseline_sha);
    expect(findApproval?.previous_baseline_sha).toBe("7af9ea7eb5a67743d730bae258dcac3724625473");
    expect(findApproval?.scope).toEqual([
      "public/schemas/v1/find-card.json",
      "src/components/intelligence/stateless-live-desk.tsx",
    ]);
    expect(findApproval?.global_risk_final_lock_unmodified).toBe(true);
    expect(findApproval?.supabase_reactivated).toBe(false);
    expect(findApproval?.funds_authorized).toBe(false);
    expect(findApproval?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    const pricingApproval = config.approved_pricing_presentation_change;
    expect(pricingApproval?.approved_pr).toBe(2240);
    expect(pricingApproval?.pricing_contract_version).toBe("geomacro.capability-usdc.v1");
    expect(pricingApproval?.previous_baseline_sha).toBe("8f44e21fee0ddc1c3f8ffec6f6c0d42ca879f15e");
    expect(pricingApproval?.approved_ui_commit).toBe("7af9ea7eb5a67743d730bae258dcac3724625473");
    expect(pricingApproval?.scope).toEqual([
      "src/components/agent-commerce-status.tsx",
      "src/components/capability-price-schedule.tsx",
      "src/components/commercial-access-guide.tsx",
      "src/components/home/live-intelligence-showcase.tsx",
      "src/routes/data-api.tsx",
      "src/routes/pricing.tsx",
    ]);
    expect(pricingApproval?.global_risk_final_lock_unmodified).toBe(true);
    expect(pricingApproval?.intelligence_risk_indices_ask_presentation_unmodified).toBe(true);
    expect(pricingApproval?.published_source_sha_unchanged).toBe(true);
    expect(pricingApproval?.funds_authorized).toBe(false);
    expect(pricingApproval?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    // Previous founder-approved Intelligence/Ask UI baselines remain independent.
    expect(config.intelligence_ssr_change_approval?.approved_ui_commit)
      .toBe("8f44e21fee0ddc1c3f8ffec6f6c0d42ca879f15e");
    expect(config.intelligence_ssr_change_approval?.global_risk_final_lock_unmodified).toBe(true);
    expect(config.intelligence_ssr_change_approval?.hybrid_ask_lock_unmodified).toBe(true);
    expect(config.intelligence_ssr_change_approval?.pending_exact_sha_live_deployment_acceptance).toBe(true);
    expect(config.pending_publish_acceptance).toBe(true);
    expect(config.website_privacy_baseline_status)
      .toBe("FOUNDER_APPROVED_FIND_CARD_V1_LOCKED_AWAITING_EXACT_SHA_LIVE_DEPLOYMENT");
    expect(config.published_source_sha).toBe("7215b0d05b05ccc4de1e5f69a333ae615abc38e3");
    expect(config.published_baseline).toContain("User will manually publish only after exact-head source/test/security verification and Lovable sync");
    expect(config.published_baseline).toContain("no x402 or GRI changes");
    expect(config.published_baseline).toContain("15-minute original-source delay");
    expect(config.published_baseline).toContain("independent 60m Global Risk remains");
  });
});
