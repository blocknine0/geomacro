import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commerce = JSON.parse(
  readFileSync("public/.well-known/geomacro-commerce.json", "utf8"),
) as any;
const agent = JSON.parse(
  readFileSync("public/.well-known/geomacro-agent.json", "utf8"),
) as any;
const distribution = JSON.parse(
  readFileSync("config/agent-marketplace-distribution.json", "utf8"),
) as any;
const llms = readFileSync("public/llms.txt", "utf8");
const docs = readFileSync("public/agent-commerce.md", "utf8");
const launchPackage = readFileSync("docs/AGENT_MARKETPLACE_LAUNCH_PACKAGE.md", "utf8");

describe("agent commerce machine discovery contract", () => {
  it("remains prelaunch and non-executing", () => {
    expect(commerce.service.status).toBe("prelaunch");
    expect(commerce.service.execution_authorized).toBe(false);
    expect(commerce.commercial_contract.production_funds_authorized).toBe(false);
    expect(agent.commercial.launch_state).toBe("prelaunch");
    expect(agent.commercial.production_funds_authorized).toBe(false);
    expect(agent.agent.execution_authorized).toBe(false);
    expect(distribution.state).toBe("prelaunch_hold");
    expect(distribution.official_launch_required_before_public_submission).toBe(true);
  });

  it("uses the payment challenge/provider plan as authoritative pricing", () => {
    expect(commerce.commercial_contract.pricing_authority).toBe(
      "payment_challenge_or_provider_plan",
    );
    expect(commerce.commercial_contract.static_catalog_price_authoritative).toBe(false);
    expect(agent.commercial.price_source).toBe(
      "authoritative_payment_challenge_or_provider_plan",
    );
    expect(distribution.launch_rules.never_publish_static_price_as_authoritative).toBe(true);
    expect(docs).toContain(
      "payment challenge or provider plan is the authoritative source for the price",
    );
  });

  it("puts Coinbase and Nevermined in the payment cohort while deferring GOAT mainnet", () => {
    const providers = commerce.offers[0].providers;
    expect(providers.coinbase_x402.launch_cohort).toBe(true);
    expect(providers.coinbase_x402.production_enabled).toBe(false);
    expect(providers.nevermined.launch_cohort).toBe(true);
    expect(providers.nevermined.production_enabled).toBe(false);
    expect(providers.goat_x402.launch_cohort).toBe(false);
    expect(providers.goat_x402.production_enabled).toBe(false);
    expect(providers.goat_x402.production_status).toBe(
      "deferred_manual_mainnet_merchant_onboarding",
    );
    expect(agent.commercial.launch_cohort).toEqual(["coinbase_x402", "nevermined"]);
    expect(distribution.targets.goat_mainnet.status).toBe(
      "deferred_manual_mainnet_merchant_onboarding",
    );
    expect(llms).toContain("GOAT mainnet: DEFERRED pending manual merchant application/approval");
  });

  it("prepares distribution without prematurely publishing manual listings", () => {
    expect(distribution.targets.coinbase_bazaar.public_submission_required).toBe(false);
    expect(distribution.targets.coinbase_agentic_market.public_submission_required).toBe(false);
    expect(distribution.targets.x402_new.public_submission_required).toBe(false);
    expect(distribution.targets.circle_agent_marketplace.public_submission_required).toBe(true);
    expect(distribution.targets.x402scan.public_submission_required).toBe(true);
    expect(distribution.targets.x402_list.public_submission_required).toBe(true);
    expect(distribution.targets.nevermined_registry.public_submission_required).toBe(true);
    for (const target of Object.values(distribution.targets) as any[]) {
      expect(target.production_enabled).toBe(false);
    }
    expect(distribution.launch_rules.verify_live_402_before_manual_submission).toBe(true);
    expect(distribution.launch_rules.automatic_public_social_posting).toBe(false);
    expect(launchPackage).toContain("PRE-LAUNCH HOLD");
  });

  it("does not add an unnecessary Solana payment rail solely for directory coverage", () => {
    expect(distribution.targets.pay_sh_pay_skills.status).toBe(
      "deferred_chain_incompatible_with_initial_launch",
    );
    expect(distribution.targets.pay_sh_pay_skills.production_enabled).toBe(false);
    expect(launchPackage).toContain(
      "will not add a new Solana settlement rail merely to gain directory coverage",
    );
  });

  it("advertises only current country/corridor adaptive query vocabulary", () => {
    const offer = commerce.offers[0];
    expect(offer.subjects).toEqual([
      "country_iso3",
      "directional_corridor_origin_iso3_to_destination_iso3",
    ]);
    expect(offer.topics).toEqual([
      "sovereign_risk",
      "macro_risk",
      "fx_external_risk",
      "sanctions_restrictions",
      "conflict_geopolitics",
      "trade_corridor",
      "energy_commodities",
      "critical_minerals",
      "political_governance",
      "banking_financial_system",
      "food_agriculture",
      "natural_hazards",
      "hot_topics",
      "risk_gate",
      "risk_object",
      "gri_context",
    ]);
    expect(offer.intents).toEqual([
      "single_subject",
      "comparison",
      "ranking_filter",
      "corridor",
      "change_since",
      "audit",
      "risk_gate",
    ]);
  });

  it("does not market advisory risk context as execution or regulated screening", () => {
    expect(commerce.boundaries.autonomous_execution).toBe(false);
    expect(commerce.boundaries.wallet_custody).toBe(false);
    expect(commerce.boundaries.transaction_signing).toBe(false);
    expect(commerce.boundaries.sanctions_screening_replacement).toBe(false);
    expect(commerce.boundaries.counterparty_due_diligence_replacement).toBe(false);
    expect(commerce.boundaries.full_physical_route_or_vessel_model).toBe(false);
    expect(llms).toContain(
      "Sanctions/restrictions context is not a replacement for sanctions screening",
    );
  });

  it("points discovery to the no-charge availability check and bounded paid adapters", () => {
    expect(commerce.discovery.availability).toBe(
      "https://geomacro.live/api/x402/risk/availability",
    );
    expect(commerce.offers[0].providers.coinbase_x402.endpoint).toBe(
      "https://geomacro.live/api/x402/intelligence",
    );
    expect(commerce.offers[0].providers.nevermined.endpoint).toBe(
      "https://geomacro.live/api/x402/nevermined/intelligence",
    );
    expect(agent.discovery.commerce_catalog).toBe(
      "https://geomacro.live/.well-known/geomacro-commerce.json",
    );
    expect(distribution.canonical_availability_endpoint).toBe(
      "https://geomacro.live/api/x402/risk/availability",
    );
  });
});
