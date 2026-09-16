import { afterEach, describe, expect, it, vi } from "vitest";
import { COMMERCIAL_LAUNCH_ACK } from "./commercial-launch-gate.server";
import {
  NEVERMINED_API_VERSION,
  NEVERMINED_ENVIRONMENTS,
  assessNeverminedSettlement,
  getNeverminedX402Config,
  neverminedPaymentRequired,
  settleNeverminedPermissions,
  verifyNeverminedPermissions,
} from "./nevermined-x402.server";

const ENV_KEYS = [
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK",
  "NEVERMINED_X402_ENVIRONMENT",
  "NEVERMINED_NVM_API_KEY",
  "NEVERMINED_PLAN_ID",
  "NEVERMINED_X402_SCHEME",
  "NEVERMINED_X402_NETWORK",
  "NEVERMINED_X402_MAX_AMOUNT",
] as const;

function configureCommon() {
  process.env.NEVERMINED_NVM_API_KEY = "sandbox:test-key";
  process.env.NEVERMINED_PLAN_ID = "44742763076047497640080230236781474129970992727896593861997347135613135571071";
  process.env.NEVERMINED_X402_SCHEME = "nvm:erc4337";
  process.env.NEVERMINED_X402_MAX_AMOUNT = "1";
}

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    expect(config?.apiUrl).toBe(NEVERMINED_ENVIRONMENTS.sandbox.api_url);
    expect(config?.apiVersion).toBe(NEVERMINED_API_VERSION);
    expect(config?.network).toBe("eip155:84532");
    expect(config?.commercialRevenue).toBe(false);
    expect(config?.maxAmount).toBe(1n);
  });

  it("blocks live configuration until the coordinated Geomacro launch", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "live";
    configureCommon();
    process.env.NEVERMINED_NVM_API_KEY = "live:test-key";
    expect(() => getNeverminedX402Config()).toThrow(
      "NEVERMINED_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
    );
  });

  it("accepts live configuration only after the exact global launch acknowledgement", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "live";
    configureCommon();
    process.env.NEVERMINED_NVM_API_KEY = "live:test-key";
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    const config = getNeverminedX402Config();
    expect(config?.environment).toBe("live");
    expect(config?.apiUrl).toBe(NEVERMINED_ENVIRONMENTS.live.api_url);
    expect(config?.network).toBe("eip155:8453");
    expect(config?.commercialRevenue).toBe(true);
  });

  it("fails closed for environment-key mismatch, unsupported schemes, or malformed plan/amount values", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "sandbox";
    configureCommon();
    process.env.NEVERMINED_NVM_API_KEY = "live:test-key";
    expect(() => getNeverminedX402Config()).toThrow("environment prefix");

    process.env.NEVERMINED_NVM_API_KEY = "sandbox:test-key";
    process.env.NEVERMINED_X402_SCHEME = "exact";
    expect(() => getNeverminedX402Config()).toThrow("NEVERMINED_X402_SCHEME");

    process.env.NEVERMINED_X402_SCHEME = "nvm:erc4337";
    process.env.NEVERMINED_PLAN_ID = "plan-not-numeric";
    expect(() => getNeverminedX402Config()).toThrow("NEVERMINED_PLAN_ID");

    process.env.NEVERMINED_PLAN_ID = "123";
    process.env.NEVERMINED_X402_MAX_AMOUNT = "0";
    expect(() => getNeverminedX402Config()).toThrow("NEVERMINED_X402_MAX_AMOUNT");
  });

  it("uses an allowlisted card network and defaults card delegation to stripe", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "sandbox";
    configureCommon();
    process.env.NEVERMINED_X402_SCHEME = "nvm:card-delegation";
    expect(getNeverminedX402Config()?.network).toBe("stripe");

    process.env.NEVERMINED_X402_NETWORK = "braintree";
    expect(getNeverminedX402Config()?.network).toBe("braintree");

    process.env.NEVERMINED_X402_NETWORK = "untrusted-provider";
    expect(() => getNeverminedX402Config()).toThrow("NEVERMINED_X402_NETWORK");
  });
});

describe("Nevermined x402 direct transport", () => {
  it("builds the v2 payment-required contract with the selected plan and network", () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "sandbox";
    configureCommon();
    const config = getNeverminedX402Config();
    if (!config) throw new Error("test config missing");
    const required = neverminedPaymentRequired(config, "https://geomacro.live/api/x402/nevermined/intelligence");
    expect(required.x402Version).toBe(2);
    expect(required.accepts).toEqual([
      expect.objectContaining({
        scheme: "nvm:erc4337",
        network: "eip155:84532",
        planId: config.planId,
        extra: { version: "1", httpVerb: "POST" },
      }),
    ]);
  });

  it("sends verify to the pinned sandbox backend with exact auth/version headers and string maxAmount", async () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "sandbox";
    configureCommon();
    const config = getNeverminedX402Config();
    if (!config) throw new Error("test config missing");
    const required = neverminedPaymentRequired(config, "https://geomacro.live/api/x402/nevermined/intelligence");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ isValid: true, payer: "0xabc", agentRequestId: "req-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyNeverminedPermissions({ config, paymentRequired: required, token: "token-proof" });
    expect(result.isValid).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [target, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(target)).toBe("https://api.sandbox.nevermined.app/api/v1/x402/verify");
    expect(init.redirect).toBe("manual");
    expect(init.headers).toEqual(
      expect.objectContaining({
        Authorization: `Bearer ${config.apiKey}`,
        "Nevermined-Version": "1.1",
        "Content-Type": "application/json",
      }),
    );
    const body = JSON.parse(String(init.body));
    expect(body.maxAmount).toBe("1");
    expect(body.x402AccessToken).toBe("token-proof");
    expect(body.paymentRequired).toEqual(required);
  });

  it("never retries an ambiguous settlement request automatically", async () => {
    process.env.NEVERMINED_X402_ENVIRONMENT = "sandbox";
    configureCommon();
    const config = getNeverminedX402Config();
    if (!config) throw new Error("test config missing");
    const required = neverminedPaymentRequired(config, "https://geomacro.live/api/x402/nevermined/intelligence");
    const fetchMock = vi.fn().mockRejectedValue(new Error("simulated timeout"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      settleNeverminedPermissions({ config, paymentRequired: required, token: "single-use-proof", agentRequestId: "req-1" }),
    ).rejects.toThrow("NEVERMINED_NETWORK_ERROR");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requires billing-model-specific settlement evidence", () => {
    expect(
      assessNeverminedSettlement({ success: true, billingModel: "pay-as-you-go", transaction: "", orderTx: "" }),
    ).toEqual(expect.objectContaining({ settled: false, reason: "NEVERMINED_PAYG_REFERENCE_MISSING" }));

    expect(
      assessNeverminedSettlement({ success: true, billingModel: "pay-as-you-go", transaction: "0xsettled" }),
    ).toEqual(expect.objectContaining({ settled: true, reference: "0xsettled" }));

    expect(
      assessNeverminedSettlement({ success: true, billingModel: "credits", creditsRedeemed: "0" }),
    ).toEqual(expect.objectContaining({ settled: false, reason: "NEVERMINED_CREDIT_REDEMPTION_NOT_PROVEN" }));

    expect(
      assessNeverminedSettlement({ success: true, billingModel: "credits", creditsRedeemed: "2", transaction: "0xcredit" }),
    ).toEqual(expect.objectContaining({ settled: true, reference: "0xcredit" }));
  });
});
