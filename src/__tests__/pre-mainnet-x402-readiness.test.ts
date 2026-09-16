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
  "GOATX402_ENVIRONMENT",
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

describe("pre-mainnet x402 readiness", () => {
  it("keeps every provider out of real-funds mode by default", () => {
    const state = providerRealFundsSecurityState();
    expect(state.required).toBe(false);
    expect(state.ready).toBe(true);
    expect(Object.values(state.providers).every((value) => value === false)).toBe(true);
  });

  it("requires the same central security and coordinated launch gate for Circle and Nevermined", () => {
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
    process.env.CIRCLE_X402_PRICE_USDC = "0.02";
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
    expect(config?.amountAtomic).toBe("20000");
  });

  it("never advertises a production paid resource while launch flags are off", () => {
    const discovery = buildX402DiscoveryDocument("https://geomacro.live");
    expect(discovery.status).toBe("prelaunch");
    expect(discovery.productionFundsAuthorized).toBe(false);
    expect(discovery.resources).toEqual([]);
  });

  it("keeps every marketplace target production-disabled in the committed manifest", () => {
    const manifest = JSON.parse(read("config/agent-marketplace-distribution.json")) as {
      state: string;
      targets: Record<string, { production_enabled: boolean }>;
    };
    expect(manifest.state).toBe("prelaunch_hold");
    expect(Object.values(manifest.targets).every((target) => target.production_enabled === false)).toBe(true);
  });

  it("publishes the standard discovery and focused OpenAPI package without static production activation", () => {
    const commerce = JSON.parse(read("public/.well-known/geomacro-commerce.json")) as any;
    const openapi = JSON.parse(read("public/openapi-x402.json")) as any;
    const middleware = read("server/middleware/00-central-security.ts");

    expect(commerce.discovery.x402).toBe("https://geomacro.live/.well-known/x402");
    expect(commerce.commercial_contract.production_funds_authorized).toBe(false);
    expect(openapi.paths["/api/x402/intelligence"].post["x-payment-info"].production_enabled).toBe(false);
    expect(middleware).toContain("providerRealFundsSecurityState");
    expect(middleware).toContain("PROVIDER_REAL_FUNDS_SECURITY_GATE_LOCKED");
  });

  it("keeps the launch env template fail-closed", () => {
    const env = read("config/prelaunch-mainnet-x402.env.example");
    expect(env).toContain("GEOMACRO_REAL_FUNDS_SECURITY_ACK=\n");
    expect(env).toContain("GEOMACRO_COMMERCIAL_LAUNCH_ACK=\n");
    expect(env).toContain("COINBASE_X402_MAINNET_ACK=\n");
    expect(env).toContain("CIRCLE_X402_MAINNET_ACK=\n");
    expect(env).toContain("GOATX402_MAINNET_COMMERCIAL_ENABLED=false");
  });
});
