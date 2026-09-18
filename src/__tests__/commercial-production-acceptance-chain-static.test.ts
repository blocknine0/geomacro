import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

const p0 = read(".github/workflows/p0-strict-prepublic-closure.yml");
const canary = read(".github/workflows/production-provider-canary.yml");
const cohort = read(".github/workflows/production-canary-cohort-acceptance.yml");
const drill = read(".github/workflows/commerce-freeze-quarantine-drill.yml");
const drillAcceptance = read(".github/workflows/commerce-safety-drill-acceptance.yml");
const prelisting = read(".github/workflows/public-production-prelisting-health.yml");
const submission = read(".github/workflows/marketplace-submission-evidence.yml");
const submissionVerifier = read("scripts/commerce/verify-marketplace-submission-evidence.mjs");
const marketplace = read(".github/workflows/marketplace-listing-observation.yml");
const postlisting = read(".github/workflows/post-listing-health.yml");
const finalWorkflow = read(".github/workflows/final-production-acceptance.yml");
const finalVerifier = read("scripts/commerce/verify-final-production-acceptance.mjs");
const prelistingVerifier = read("scripts/commerce/public-production-prelisting-health.mjs");
const canaryVerifier = read("scripts/commerce/verify-production-provider-canaries.mjs");

describe("commercial production acceptance ordered chain", () => {
  it("keeps P0 pre-public and requires real distributed 1M burst plus 12M soak evidence", () => {
    expect(p0).toContain("name: P0 Strict Prepublic Closure");
    expect(p0).toContain("candidate_sha:");
    expect(p0).not.toContain("exact-published-live:");
    expect(p0).not.toContain("https://geomacro.live");
    expect(p0).toContain("requests !== 1000000");
    expect(p0).toContain("rps !== 40000");
    expect(p0).toContain("requests !== 12000000");
    expect(p0).toContain("duration_seconds !== 300");
    expect(p0).toContain("zero_5xx");
    expect(p0).toContain("zero_timeouts_transport_errors");
  });

  it("binds real-money canaries to successful same-SHA P0 and keeps one-provider capped execution", () => {
    expect(canary).toContain(".github/workflows/p0-strict-prepublic-closure.yml");
    expect(canary).toContain("I_AUTHORIZE_ONE_CAPPED_INTERNAL_REAL_MONEY_CANARY");
    expect(canary).toContain("max_usdc must be >0 and <=1 USDC");
    expect(canary).toContain("environment: production-canary");
    expect(canary).toContain("GEOMACRO_RECONCILIATION_MODE: internal_canary");
    expect(canary).toContain("GEOMACRO_PURCHASE_CLASSIFICATION: internal_canary");
  });

  it("requires three separately successful provider runs and excludes all canaries from revenue", () => {
    expect(cohort).toContain("coinbase_run_id:");
    expect(cohort).toContain("circle_run_id:");
    expect(cohort).toContain("nevermined_run_id:");
    expect(cohort).toContain("verify-production-provider-canaries.mjs");
    expect(canaryVerifier).toContain('revenue_classification !== "non_revenue_internal"');
    expect(canaryVerifier).toContain('e.purchase_classification !== "internal_canary"');
    expect(canaryVerifier).toContain("commercial_revenue !== false");
  });

  it("requires deliberately observed normal, global freeze and every single-provider quarantine state", () => {
    expect(drill).toContain("global_freeze");
    expect(drill).toContain("quarantine_coinbase_x402");
    expect(drill).toContain("quarantine_circle_gateway_x402");
    expect(drill).toContain("quarantine_nevermined");
    expect(drill).toContain("I_CONFIRM_CANARY_RUNTIME_SAFETY_STATE_IS_SET");
    expect(drillAcceptance).toContain("normal_run_id:");
    expect(drillAcceptance).toContain("global_freeze_run_id:");
    expect(drillAcceptance).toContain("quarantine_coinbase_run_id:");
    expect(drillAcceptance).toContain("quarantine_circle_run_id:");
    expect(drillAcceptance).toContain("quarantine_nevermined_run_id:");
  });

  it("forces public production only after accepted canaries and safety drills", () => {
    expect(prelisting).toContain("canary_cohort_run_id:");
    expect(prelisting).toContain("safety_acceptance_run_id:");
    expect(prelisting).toContain("Safety acceptance predates canary cohort");
    expect(prelistingVerifier).toContain('"geomacro.public-production-prelisting-health.v1"');
    expect(prelistingVerifier).toContain("same_exact_sha_public: true");
    expect(prelistingVerifier).toContain("coinbase_unpaid_402_passed: true");
    expect(prelistingVerifier).toContain("circle_unpaid_402_passed: true");
    expect(prelistingVerifier).toContain("nevermined_unpaid_402_passed: true");
  });

  it("requires evidence-bound marketplace submission/indexing after public health, then independent observation", () => {
    expect(submission).toContain("public_prelisting_run_id:");
    expect(submission).toContain("I_CONFIRM_MARKETPLACE_SUBMISSIONS_COMPLETED");
    expect(submissionVerifier).toContain("circle_submission_evidenced: true");
    expect(submissionVerifier).toContain("nevermined_submission_evidenced: true");
    expect(submissionVerifier).toContain("coinbase_indexing_requires_observation: true");
    expect(submissionVerifier).toContain("listing_not_inferred_from_submission: true");
    expect(marketplace).toContain("public_prelisting_run_id:");
    expect(marketplace).toContain("marketplace_submission_run_id:");
    expect(marketplace).toContain("Marketplace observation predates marketplace submission evidence");
    expect(marketplace).toContain("observe-marketplace-listings.mjs");
    expect(marketplace).toContain("GEOMACRO_COINBASE_BAZAAR_OBSERVATION_URL");
    expect(marketplace).toContain("GEOMACRO_CIRCLE_MARKETPLACE_OBSERVATION_URL");
    expect(marketplace).toContain("GEOMACRO_NEVERMINED_REGISTRY_OBSERVATION_URL");
    expect(postlisting).toContain("marketplace_observation_run_id:");
    expect(postlisting).toContain("post-listing-health.mjs");
  });

  it("makes final acceptance verify successful exact-SHA runs in chronological order", () => {
    for (const key of [
      "p0_run_id:",
      "ledger_readiness_run_id:",
      "canary_cohort_run_id:",
      "safety_acceptance_run_id:",
      "public_prelisting_run_id:",
      "marketplace_submission_run_id:",
      "marketplace_observation_run_id:",
      "post_listing_health_run_id:",
    ]) expect(finalWorkflow).toContain(key);
    expect(finalWorkflow).toContain("Canary cohort predates P0 closure");
    expect(finalWorkflow).toContain("Safety drill predates canary cohort");
    expect(finalWorkflow).toContain("Marketplace submission evidence predates public production prelisting proof");
    expect(finalWorkflow).toContain("Marketplace observation predates marketplace submission evidence");
    expect(finalWorkflow).toContain("Post-listing health predates marketplace observation");
    expect(finalVerifier).toContain(".github/workflows/p0-strict-prepublic-closure.yml");
    expect(finalVerifier).toContain("GEOMACRO_PUBLIC_PRELISTING_HEALTH_EVIDENCE");
  });

  it("never turns final launch acceptance into a revenue claim", () => {
    expect(finalVerifier).toContain("public_launch_ready: true");
    expect(finalVerifier).toContain("canary_counted_as_revenue: false");
    expect(finalVerifier).toContain("revenue_claim_ready: false");
    expect(finalVerifier).toContain("external_customer or independent_production_buyer");
    expect(finalVerifier).toContain("automatic_public_marketing_authorized: false");
  });

  it("keeps every new execution workflow manual-only", () => {
    for (const workflow of [
      p0,
      canary,
      cohort,
      drill,
      drillAcceptance,
      prelisting,
      submission,
      marketplace,
      postlisting,
      finalWorkflow,
    ]) {
      expect(workflow).toContain("workflow_dispatch:");
      expect(workflow).not.toMatch(/^\s{2}push:/m);
      expect(workflow).not.toMatch(/^\s{2}schedule:/m);
    }
  });
});
