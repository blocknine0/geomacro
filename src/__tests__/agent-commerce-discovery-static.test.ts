import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commerce = JSON.parse(readFileSync("public/.well-known/geomacro-commerce.json", "utf8")) as any;
const agent = JSON.parse(readFileSync("public/.well-known/geomacro-agent.json", "utf8")) as any;
const llms = readFileSync("public/llms.txt", "utf8");
const docs = readFileSync("public/agent-commerce.md", "utf8");

describe("agent commerce machine discovery contract", () => {
  it("remains prelaunch, production-gated and non-executing", () => {
    expect(commerce.service.status).toBe("prelaunch");
    expect(commerce.service.execution_authorized).toBe(false);
    expect(commerce.commercial_contract.production_funds_authorized).toBe(false);
    expect(agent.commercial.launch_state).toBe("prelaunch");
    expect(agent.commercial.production_funds_authorized).toBe(false);
    expect(agent.agent.execution_authorized).toBe(false);
  });

  it("uses runtime payment terms as authoritative pricing", () => {
    expect(commerce.commercial_contract.pricing_authority).toBe("payment_challenge_or_provider_plan");
    expect(commerce.commercial_contract.static_catalog_price_authoritative).toBe(false);
    expect(agent.commercial.price_source).toBe("authoritative_payment_challenge_or_provider_plan");
    expect(docs).toContain("live payment challenge or provider plan is the authoritative source for price");
  });

  it("advertises only the coordinated commercial provider cohort", () => {
    const providers = commerce.offers[0].providers;
    expect(Object.keys(providers).sort()).toEqual(["circle_gateway", "coinbase_x402", "nevermined"]);
    for (const provider of Object.values(providers) as any[]) {
      expect(provider.launch_cohort).toBe(true);
      expect(provider.production_enabled).toBe(false);
    }
    expect(agent.commercial.launch_cohort).toEqual(["coinbase_x402", "circle_gateway_x402", "nevermined"]);
  });

  it("advertises current country/corridor adaptive query vocabulary", () => {
    const offer = commerce.offers[0];
    expect(offer.subjects).toEqual([
      "country_iso3",
      "directional_corridor_origin_iso3_to_destination_iso3",
    ]);
    expect(offer.delivery_rules.execution_authorized).toBe(false);
  });

  it("does not market advisory risk context as execution or regulated screening", () => {
    expect(commerce.boundaries.autonomous_execution).toBe(false);
    expect(commerce.boundaries.wallet_custody).toBe(false);
    expect(commerce.boundaries.transaction_signing).toBe(false);
    expect(commerce.boundaries.sanctions_screening_replacement).toBe(false);
    expect(commerce.boundaries.counterparty_due_diligence_replacement).toBe(false);
    expect(llms).toContain("Sanctions/restrictions context is not a replacement for sanctions screening");
  });

  it("points discovery to the no-charge availability check and production-gated paid adapters", () => {
    expect(commerce.discovery.availability).toBe("https://geomacro.live/api/x402/risk/availability");
    expect(commerce.offers[0].providers.coinbase_x402.endpoint).toBe("https://geomacro.live/api/x402/intelligence");
    expect(commerce.offers[0].providers.circle_gateway.endpoint).toBe("https://geomacro.live/api/x402/circle/intelligence");
    expect(commerce.offers[0].providers.nevermined.endpoint).toBe("https://geomacro.live/api/x402/nevermined/intelligence");
    expect(agent.discovery.commerce_catalog).toBe("https://geomacro.live/.well-known/geomacro-commerce.json");
  });

  it("keeps retired experimental identity out of public discovery", () => {
    for (const source of [JSON.stringify(commerce), JSON.stringify(agent), llms, docs]) {
      expect(source).not.toMatch(/testnet|prediction[ -]?market|bridge|swap/i);
    }
  });
});
