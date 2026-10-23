import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMERCIAL_LAUNCH_ACK } from "../lib/commercial-launch-gate.server";
import { REAL_FUNDS_SECURITY_ACK } from "../lib/central-security.server";
import {
  CIRCLE_X402_PRODUCTION_ACK,
  getCircleGatewayProductionConfig,
} from "../lib/circle-gateway-x402-production.server";
import { providerRealFundsSecurityState } from "../lib/provider-real-funds-security.server";
import { buildX402DiscoveryDocument } from "../lib/x402-discovery.server";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const ENV_KEYS = [
  "GEOMACRO_CENTRAL_SECURITY_MODE",
  "GEOMACRO_REAL_FUNDS_SECURITY_ACK",
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK",
  "GEOMACRO_SECURITY_FINGERPRINT_PEPPER",
  "GEOMACRO_API_CREDENTIAL_PEPPER",
  "COINBASE_X402_ENVIRONMENT",
  "CIRCLE_X402_ENVIRONMENT",
  "CIRCLE_X402_MAINNET_ACK",
  "CIRCLE_X402_SELLER_ADDRESS",
  "CIRCLE_X402_PRICE_USDC",
  "CIRCLE_X402_PRODUCTION_NETWORKS",
  "NEVERMINED_X402_ENVIRONMENT",
] as const;

const previous = new Map<string, string | undefined>();

beforeEach(() => {
  previous.clear();
  for (const key of ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("production x402 readiness", () => {
  it("keeps every provider out of real-funds mode by default", () => {
    const state = providerRealFundsSecurityState();
    expect(state.required).toBe(false);
    expect(state.ready).toBe(true);
    expect(Object.values(state.providers).every((value) => value === false)).toBe(true);
  });

  it("requires central security and coordinated launch gates for production providers", () => {
    process.env.CIRCLE_X402_ENVIRONMENT = "production";
    process.env.NEVERMINED_X402_ENVIRONMENT = "live";
    expect(providerRealFundsSecurityState().required).toBe(true);
    expect(providerRealFundsSecurityState().ready).toBe(false);

    process.env.GEOMACRO_CENTRAL_SECURITY_MODE = "enforce";
    process.env.GEOMACRO_REAL_FUNDS_SECURITY_ACK = REAL_FUNDS_SECURITY_ACK;
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER = "f".repeat(32);
    process.env.GEOMACRO_API_CREDENTIAL_PEPPER = "c".repeat(32);
    expect(providerRealFundsSecurityState().ready).toBe(true);
  });

  it("keeps Circle production locked behind provider and global acknowledgements", () => {
    process.env.CIRCLE_X402_ENVIRONMENT = "production";
    process.env.CIRCLE_X402_SELLER_ADDRESS = `0x${"1".repeat(40)}`;
    process.env.CIRCLE_X402_PRICE_USDC = "0.05";
    process.env.CIRCLE_X402_PRODUCTION_NETWORKS = "eip155:8453";
    expect(() => getCircleGatewayProductionConfig()).toThrow();

    process.env.GEOMACRO_CENTRAL_SECURITY_MODE = "enforce";
    process.env.GEOMACRO_REAL_FUNDS_SECURITY_ACK = REAL_FUNDS_SECURITY_ACK;
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER = "f".repeat(32);
    process.env.GEOMACRO_API_CREDENTIAL_PEPPER = "c".repeat(32);
    process.env.CIRCLE_X402_MAINNET_ACK = CIRCLE_X402_PRODUCTION_ACK;

    const config = getCircleGatewayProductionConfig();
    expect(config?.environment).toBe("production");
    expect(config?.networks).toEqual(["eip155:8453"]);
    expect(config?.amountAtomic).toBe("50000");
  });

  it("never advertises a production paid resource while launch flags are off", async () => {
    const discovery = await buildX402DiscoveryDocument("https://geomacro.live");
    expect(discovery.status).toBe("prelaunch");
    expect(discovery.productionFundsAuthorized).toBe(false);
    expect(discovery.resources).toEqual([]);
    expect(discovery.plannedResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "coinbase_x402", production_enabled: false }),
        expect.objectContaining({ provider: "circle_gateway_x402", production_enabled: false }),
        expect.objectContaining({ provider: "nevermined", production_enabled: false }),
      ]),
    );
  });

  it("publishes commercial discovery without static production activation", () => {
    const commerce = JSON.parse(read("public/.well-known/geomacro-commerce.json")) as any;
    const openapi = JSON.parse(read("public/openapi-x402.json")) as any;
    const launch = JSON.parse(read("config/commercial-launch-manifest.json")) as any;
    const middleware = read("server/middleware/00-central-security.ts");
    const circleRoute = read("src/routes/api.x402.circle_.intelligence.ts");

    expect(commerce.commercial_contract.production_funds_authorized).toBe(false);
    expect(Object.keys(commerce.offers[0].providers).sort()).toEqual(["circle_gateway", "coinbase_x402", "nevermined"]);
    expect(openapi.paths["/api/x402/intelligence"].post["x-payment-info"].production_enabled).toBe(false);
    expect(openapi.paths["/api/x402/circle/intelligence"].post["x-payment-info"].production_enabled).toBe(false);
    expect(launch.providers.circle_gateway_x402.launch_cohort).toBe(true);
    expect(launch.providers.circle_gateway_x402.production_enabled).toBe(false);
    expect(middleware).toContain("providerRealFundsSecurityState");
    expect(circleRoute).toContain('provider: "circle_gateway_x402"');
  });

  it("keeps the launch env template fail-closed", () => {
    const env = read("config/prelaunch-mainnet-x402.env.example");
    expect(env).toContain("GEOMACRO_REAL_FUNDS_SECURITY_ACK=\n");
    expect(env).toContain("GEOMACRO_COMMERCIAL_LAUNCH_ACK=\n");
    expect(env).toContain("COINBASE_X402_MAINNET_ACK=\n");
    expect(env).toContain("CIRCLE_X402_ENVIRONMENT=\n");
    expect(env).toContain("CIRCLE_X402_MAINNET_ACK=\n");
    expect(env).toContain("CIRCLE_X402_PRODUCTION_NETWORKS=eip155:8453");
  });

  it("publishes only Geomacro-branded, three-category discovery with canonical x402 binding", async () => {
    const origin = "https://geomacro.live";
    const api = await buildX402DiscoveryDocument(origin);
    const fallback = JSON.parse(read("public/.well-known/x402"));
    const fallbackJson = JSON.parse(read("public/.well-known/x402.json"));
    const agent = JSON.parse(read("public/.well-known/geomacro-agent.json"));
    const commerce = JSON.parse(read("public/.well-known/geomacro-commerce.json"));
    const canonical = `${origin}/api/v1/intelligence/query`;
    const routes = {
      canonical,
      geopolitics: `${origin}/api/v1/intelligence/geopolitics`,
      macro_fx: `${origin}/api/v1/intelligence/macro-fx`,
      critical_minerals: `${origin}/api/v1/intelligence/critical-minerals`,
      agent: `${origin}/api/v1/agent`,
      pricing: `${origin}/api/v1/pricing`,
      no_funds_availability: `${origin}/api/v1/intelligence/availability`,
    };

    expect(api.name).toBe("Geomacro");
    expect(api.categories).toEqual(["GEOPOLITICS", "MACRO", "CRITICAL_MINERALS"]);
    expect(api.officialApis).toEqual(routes);
    expect(api.three_category_aliases_share_canonical_engine).toBe(true);
    expect(api.aliases_are_not_independently_payable_resources).toBe(true);
    expect(api.routability_is_not_current_signed_data_coverage).toBe(true);
    expect(api.discovery.official_openapi).toBe(`${origin}/api/v1/agent?view=openapi`);

    expect(fallbackJson).toEqual(fallback);
    expect(fallback.name).toBe("Geomacro");
    expect(fallback.officialApis).toEqual(routes);
    expect(fallback.plannedResources.find((r: any) =>
      r.provider === "coinbase_x402").resource).toBe(canonical);
    expect(fallback.resources).toEqual([]);
    expect(fallback.productionFundsAuthorized).toBe(false);
    expect(fallback.plannedResources.every((r: any) => !r.production_enabled)).toBe(true);
    expect(agent.agent.name).toBe("Geomacro AI Agent");
    expect(agent.officialApis).toEqual(routes);
    expect(agent.delivery.production_funds_authorized).toBe(false);
    expect(commerce.service.name).toBe("Geomacro");
    expect(commerce.service.official_category_apis).toEqual({
      geopolitics: routes.geopolitics,
      macro_fx: routes.macro_fx,
      critical_minerals: routes.critical_minerals,
    });
    expect(commerce.offers[0].canonical_endpoint).toBe(canonical);
    expect(commerce.commercial_contract.production_funds_authorized).toBe(false);
    expect(commerce.discovery.pricing).toBe(routes.pricing);
    // Discovery is never a charge or an eligibility/country coverage certificate.
    expect(api.productionFundsAuthorized).toBe(false);
    expect(api.resources).toEqual([]);
  });
});
