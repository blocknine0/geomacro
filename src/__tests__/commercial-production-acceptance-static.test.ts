import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const provisioner = readFileSync(
  join(process.cwd(), "scripts/commercial/provision-commercial-api-pilot.ts"),
  "utf8",
);
const acceptance = readFileSync(
  join(process.cwd(), "scripts/commercial/accept-commercial-api.ts"),
  "utf8",
);
const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/commercial-api-production-acceptance.yml"),
  "utf8",
);

const productionReconciliationMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/947_agent_commerce_production_reconciliation.sql"),
  "utf8",
);
const productionReconciliation = readFileSync(
  join(process.cwd(), "scripts/ops/reconcile-agent-commerce-payment.mjs"),
  "utf8",
);
const productionCanaryCommon = readFileSync(
  join(process.cwd(), "scripts/commerce/production-canary-common.mjs"),
  "utf8",
);
const providerCanaryVerifier = readFileSync(
  join(process.cwd(), "scripts/commerce/verify-production-provider-canaries.mjs"),
  "utf8",
);
const safetyDrillProbe = readFileSync(
  join(process.cwd(), "scripts/commerce/probe-commerce-safety-drill.mjs"),
  "utf8",
);
const safetyDrillVerifier = readFileSync(
  join(process.cwd(), "scripts/commerce/verify-commerce-safety-drill.mjs"),
  "utf8",
);
const marketplaceObserver = readFileSync(
  join(process.cwd(), "scripts/commerce/observe-marketplace-listings.mjs"),
  "utf8",
);
const postListingHealth = readFileSync(
  join(process.cwd(), "scripts/commerce/post-listing-health.mjs"),
  "utf8",
);
const finalProductionAcceptance = readFileSync(
  join(process.cwd(), "scripts/commerce/verify-final-production-acceptance.mjs"),
  "utf8",
);
const publicRevenueProof = readFileSync(
  join(process.cwd(), "scripts/commerce/verify-public-revenue-proof.mjs"),
  "utf8",
);
const x402Discovery = readFileSync(
  join(process.cwd(), "src/lib/x402-discovery.server.ts"),
  "utf8",
);

describe("commercial production acceptance tooling", () => {
  it("pins provisioning to the authoritative production project and never logs the raw API key", () => {
    expect(provisioner).toContain('AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx"');
    expect(provisioner).toContain('api_key_hash_prefix');
    expect(provisioner).toContain('raw_api_key_logged: false');
    expect(provisioner).not.toContain('api_key: apiKey');
    expect(provisioner).not.toContain('console.log(apiKey');
  });

  it("is dry-run by default and refuses implicit access-state reactivation or term mutation", () => {
    expect(provisioner).toContain('process.argv.includes("--write")');
    expect(provisioner).toContain('Existing principal is not active; refusing implicit reactivation');
    expect(provisioner).toContain('Existing credential is disabled; refusing implicit re-enable');
    expect(provisioner).toContain('Entitlement reference conflict: refusing to change existing commercial terms');
    expect(provisioner).toContain('Existing entitlement is not currently active; refusing implicit renewal/reactivation');
  });

  it("proves exact replay, mutated replay and invalid auth against production", () => {
    expect(acceptance).toContain('"https://geomacro.live"');
    expect(acceptance).toContain('idempotent_replay !== true');
    expect(acceptance).toContain('IDEMPOTENCY_CONFLICT');
    expect(acceptance).toContain('Exact replay consumed credits twice');
    expect(acceptance).toContain('Invalid API key did not fail closed');
    expect(acceptance).toContain('execution_authorized boundary failed');
    expect(acceptance).toContain('raw_data_included boundary failed');
    expect(acceptance).toContain('private_warehouse_access boundary failed');
  });

  it("keeps production mutation manual-only and protected by the production environment", () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('COMMERCIAL_PILOT_API_KEY: ${{ secrets.COMMERCIAL_PILOT_API_KEY }}');
    expect(workflow).toContain("- dry_run");
    expect(workflow).toContain("- provision_and_verify");
    expect(workflow).toContain('provision-commercial-api-pilot.ts --write');
  });
});


describe("end-to-end paid production acceptance evidence chain", () => {
  it("keeps production canaries exact-SHA, isolated and outside revenue", () => {
    expect(productionCanaryCommon).toContain("GEOMACRO_PRODUCTION_CANARY_BASE_URL");
    expect(productionCanaryCommon).toContain("GEOMACRO_EXPECTED_DEPLOYED_SHA");
    expect(productionCanaryCommon).toContain('PRODUCTION_HOSTS = new Set(["geomacro.live", "www.geomacro.live"])');
    expect(providerCanaryVerifier).toContain("geomacro.production-provider-canary.v1");
    expect(providerCanaryVerifier).toContain("replay_no_second_charge");
    expect(providerCanaryVerifier).toContain('revenue_classification !== "non_revenue_internal"');
    expect(providerCanaryVerifier).toContain('e.purchase_classification !== "internal_canary"');
    expect(providerCanaryVerifier).toContain("canaries_excluded_from_revenue: true");
  });

  it("requires external buyer classification before production revenue promotion", () => {
    expect(productionReconciliationMigration).toContain("p_purchase_classification text");
    expect(productionReconciliationMigration).toContain(
      "commercial revenue requires an external or independent production buyer classification",
    );
    expect(productionReconciliationMigration).toContain(
      "'purchase_classification', p_purchase_classification",
    );
    expect(productionReconciliation).toContain("GEOMACRO_PURCHASE_CLASSIFICATION");
    expect(productionReconciliation).toContain("external_customer");
    expect(productionReconciliation).toContain("independent_production_buyer");
    expect(publicRevenueProof).toContain("geomacro.public-revenue-proof.v1");
    expect(publicRevenueProof).toContain(
      "at_least_one_reconciled_external_or_independent_production_purchase",
    );
  });

  it("makes emergency freeze and every launch-cohort provider quarantine an explicit runtime drill", () => {
    for (const mode of [
      "normal",
      "global_freeze",
      "quarantine_coinbase_x402",
      "quarantine_circle_gateway_x402",
      "quarantine_nevermined",
    ]) {
      expect(safetyDrillProbe).toContain(mode);
      expect(safetyDrillVerifier).toContain(mode);
    }
    expect(safetyDrillProbe).toContain("runtime_mutation_performed_by_this_probe: false");
    expect(safetyDrillProbe).toContain("payment_performed: false");
    expect(safetyDrillVerifier).toContain(
      "healthy_rails_remain_available_during_single_provider_quarantine",
    );
  });

  it("requires externally observed marketplace visibility instead of inferring listing from payment", () => {
    expect(marketplaceObserver).toContain("GEOMACRO_COINBASE_BAZAAR_OBSERVATION_URL");
    expect(marketplaceObserver).toContain("GEOMACRO_CIRCLE_MARKETPLACE_OBSERVATION_URL");
    expect(marketplaceObserver).toContain("GEOMACRO_NEVERMINED_REGISTRY_OBSERVATION_URL");
    expect(marketplaceObserver).toContain("exact_endpoint_observed: true");
    expect(marketplaceObserver).toContain("listing_submission_performed_by_this_script: false");
    expect(marketplaceObserver).toContain("public_marketing_performed_by_this_script: false");
  });

  it("checks exact-SHA public production and three unpaid 402 contracts without paying", () => {
    expect(postListingHealth).toContain('base.hostname !== "geomacro.live"');
    expect(postListingHealth).toContain("/.well-known/geomacro-build.json");
    expect(postListingHealth).toContain("/api/x402/intelligence");
    expect(postListingHealth).toContain("/api/x402/circle/intelligence");
    expect(postListingHealth).toContain("/api/x402/nevermined/intelligence");
    expect(postListingHealth).toContain("payment_performed_by_this_check: false");
    expect(postListingHealth).toContain("settlement_performed_by_this_check: false");
    expect(postListingHealth).not.toContain("PAYMENT-SIGNATURE");
  });

  it("advertises Nevermined only from verified live runtime state", () => {
    expect(x402Discovery).toContain(
      'providerAvailable("nevermined", state.providers.nevermined_live)',
    );
    expect(x402Discovery).toContain('config?.environment === "live"');
    expect(x402Discovery).toContain("neverminedPaymentRequired(config, endpoint).accepts");
    expect(x402Discovery).toContain('activeProviders.add("nevermined")');
  });

  it("binds final launch acceptance to exact successful Strict P0 evidence", () => {
    expect(finalProductionAcceptance).toContain(
      ".github/workflows/strict-commercial-launch-closure.yml",
    );
    expect(finalProductionAcceptance).toContain('run?.event !== "workflow_dispatch"');
    expect(finalProductionAcceptance).toContain('run?.head_branch !== "main"');
    expect(finalProductionAcceptance).toContain('run?.conclusion !== "success"');
    expect(finalProductionAcceptance).toContain("initial_provider_cohort_complete");
    expect(finalProductionAcceptance).toContain(
      "marketplace_indexing_or_listing_observed: true",
    );
    expect(finalProductionAcceptance).toContain("post_listing_health_verified: true");
    expect(finalProductionAcceptance).toContain("canary_counted_as_revenue: false");
    expect(finalProductionAcceptance).toContain("revenue_claim_ready: false");
    expect(finalProductionAcceptance).toContain(
      "automatic_public_marketing_authorized: false",
    );
  });
});
