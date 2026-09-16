import { afterEach, describe, expect, it } from "vitest";
import { COMMERCIAL_LAUNCH_ACK } from "./commercial-launch-gate.server";
import {
  NEVERMINED_ENVIRONMENTS,
  getNeverminedX402Config,
} from "./nevermined-x402.server";

const ENV_KEYS = [
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK",
  "NEVERMINED_X402_ENVIRONMENT",
  "NEVERMINED_NVM_API_KEY",
  "NEVERMINED_PLAN_ID",
  "NEVERMINED_X402_SCHEME",
  "NEVERMINED_X402_MAX_AMOUNT",
] as const;

function configureCommon() {
  process.env.NEVERMINED_NVM_API_KEY = "nvm:test-key";
  process.env.NEVERMINED_PLAN_ID = "44742763076047497640080230236781474129970992727896593861997347135613135571071";
  process.env.NEVERMINED_X402_SCHEME = "nvm:erc4337";
  process.env.NEVERMINED_X402_MAX_AMOUNT = "1";
}

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("Nevermined x402 configuration", () => {
  it("is disabled when no environment is selected", () => {
    expect(getNeverminedX402Config()).toBeNull();
  });

  it("allows sandbox configuration without any production authorization", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "sandbox";
    configureCommon();
    const config = getNeverminedX402Config();
    expect(config?.environment).toBe("sandbox");
    expect(config?.facilitatorUrl).toBe(NEVERMINED_ENVIRONMENTS.sandbox.facilitator_url);
    expect(config?.commercialRevenue).toBe(false);
    expect(config?.maxAmount).toBe(1n);
  });

  it("blocks live configuration until the coordinated Geomacro launch", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "live";
    configureCommon();
    expect(() => getNeverminedX402Config()).toThrow(
      "NEVERMINED_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
    );
  });

  it("accepts live configuration only after the exact global launch acknowledgement", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "live";
    configureCommon();
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    const config = getNeverminedX402Config();
    expect(config?.environment).toBe("live");
    expect(config?.facilitatorUrl).toBe(NEVERMINED_ENVIRONMENTS.live.facilitator_url);
    expect(config?.commercialRevenue).toBe(true);
  });

  it("fails closed for unsupported schemes or malformed plan/amount values", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "sandbox";
    configureCommon();
    process.env.NEVERMINED_X402_SCHEME = "exact";
    expect(() => getNeverminedX402Config()).toThrow("NEVERMINED_X402_SCHEME");

    process.env.NEVERMINED_X402_SCHEME = "nvm:erc4337";
    process.env.NEVERMINED_PLAN_ID = "plan-not-numeric";
    expect(() => getNeverminedX402Config()).toThrow("NEVERMINED_PLAN_ID");

    process.env.NEVERMINED_PLAN_ID = "123";
    process.env.NEVERMINED_X402_MAX_AMOUNT = "0";
    expect(() => getNeverminedX402Config()).toThrow("NEVERMINED_X402_MAX_AMOUNT");
  });
});
