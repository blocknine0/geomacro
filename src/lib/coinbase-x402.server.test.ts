import { afterEach, describe, expect, it } from "vitest";
import { COMMERCIAL_LAUNCH_ACK } from "./commercial-launch-gate.server";
import {
  COINBASE_X402_MAINNET_ACK,
  COINBASE_X402_MAINNET_NETWORK,
  COINBASE_X402_MAINNET_USDC,
  COINBASE_X402_TESTNET_NETWORK,
  COINBASE_X402_TESTNET_USDC,
  assertCoinbasePaymentBinding,
  bazaarExtensionOutcome,
  coinbasePaymentFingerprint,
  coinbaseRequestFingerprint,
  coinbaseX402PaymentRequired,
  coinbaseX402PaymentRequirements,
  coinbaseX402PaymentResponseHeader,
  getCoinbaseX402Config,
} from "./coinbase-x402.server";

const ENV_KEYS = [
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK",
  "COINBASE_X402_ENVIRONMENT",
  "COINBASE_X402_PAY_TO",
  "COINBASE_X402_PRICE_USDC",
  "COINBASE_X402_MAINNET_ACK",
  "CDP_API_KEY_ID",
  "CDP_API_KEY_SECRET",
] as const;

const PAY_TO = "0x1111111111111111111111111111111111111111";

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("Coinbase x402 configuration", () => {
  it("is disabled when no environment is configured", () => {
    expect(getCoinbaseX402Config()).toBeNull();
  });

  it("uses Base Sepolia and 0.05 USDC by default for explicit testnet mode", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "testnet";
    process.env.COINBASE_X402_PAY_TO = PAY_TO;
    const config = getCoinbaseX402Config();
    expect(config?.network).toBe(COINBASE_X402_TESTNET_NETWORK);
    expect(config?.asset).toBe(COINBASE_X402_TESTNET_USDC);
    expect(config?.amountAtomic).toBe("50000");
    expect(config?.commercialEnvironment).toBe("testnet");
  });

  it("requires both the global coordinated-launch gate and Coinbase-specific mainnet gate", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "production";
    process.env.COINBASE_X402_PAY_TO = PAY_TO;

    expect(() => getCoinbaseX402Config()).toThrow(
      "COINBASE_X402_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
    );

    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    expect(() => getCoinbaseX402Config()).toThrow("Production x402 is locked");

    process.env.COINBASE_X402_MAINNET_ACK = COINBASE_X402_MAINNET_ACK;
    expect(() => getCoinbaseX402Config()).toThrow("COINBASE_X402_PRICE_USDC is required");

    process.env.COINBASE_X402_PRICE_USDC = "0.02";
    const config = getCoinbaseX402Config();
    expect(config?.network).toBe(COINBASE_X402_MAINNET_NETWORK);
    expect(config?.chainId).toBe("8453");
    expect(config?.networkName).toBe("Base");
    expect(config?.asset).toBe(COINBASE_X402_MAINNET_USDC);
    expect(config?.priceUsdc).toBe("0.02");
    expect(config?.amountAtomic).toBe("20000");
    expect(config?.commercialEnvironment).toBe("mainnet");
  });

  it("does not allow a Coinbase-specific acknowledgement to bypass the global launch lock", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "production";
    process.env.COINBASE_X402_PAY_TO = PAY_TO;
    process.env.COINBASE_X402_PRICE_USDC = "0.02";
    process.env.COINBASE_X402_MAINNET_ACK = COINBASE_X402_MAINNET_ACK;
    expect(() => getCoinbaseX402Config()).toThrow(
      "COINBASE_X402_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
    );
  });

  it("does not allow the global launch acknowledgement to bypass the Coinbase-specific lock", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "production";
    process.env.COINBASE_X402_PAY_TO = PAY_TO;
    process.env.COINBASE_X402_PRICE_USDC = "0.02";
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    expect(() => getCoinbaseX402Config()).toThrow("Production x402 is locked");
    process.env.COINBASE_X402_MAINNET_ACK = "NOT_AUTHORIZED";
    expect(() => getCoinbaseX402Config()).toThrow("Production x402 is locked");
  });

  it("enforces a 100 USDC per-call configuration safety cap", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "testnet";
    process.env.COINBASE_X402_PAY_TO = PAY_TO;
    process.env.COINBASE_X402_PRICE_USDC = "100.000001";
    expect(() => getCoinbaseX402Config()).toThrow("safety cap");
  });
});

describe("Coinbase x402 payment binding and Bazaar declaration", () => {
  it("advertises a spec-shaped POST JSON Bazaar declaration with a supported example", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "testnet";
    process.env.COINBASE_X402_PAY_TO = PAY_TO;
    const config = getCoinbaseX402Config();
    if (!config) throw new Error("test config missing");
    const request = new Request("https://geomacro.live/api/x402/risk", { method: "POST" });
    const required = coinbaseX402PaymentRequired(request, config);

    expect(required.x402Version).toBe(2);
    expect(required.resource.url).toBe("https://geomacro.live/api/x402/risk");
    expect(required.resource.serviceName).toBe("Geomacro");
    expect(required.accepts).toHaveLength(1);
    expect(required.extensions.bazaar.info.input).toMatchObject({
      type: "http",
      method: "POST",
      bodyType: "json",
    });
    expect(required.extensions.bazaar.schema.$schema).toContain("2020-12");
    const example = required.extensions.bazaar.info.input.body as {
      subject?: { type?: string; country_iso3?: string };
    };
    expect(example.subject?.type).toBe("country");
    expect(["USA", "CHN"]).toContain(example.subject?.country_iso3);
  });

  it("accepts only a payment payload bound to the exact configured requirements", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "testnet";
    process.env.COINBASE_X402_PAY_TO = PAY_TO;
    const config = getCoinbaseX402Config();
    if (!config) throw new Error("test config missing");
    const accepted = coinbaseX402PaymentRequirements(config);
    const payload = {
      x402Version: 2,
      accepted,
      payload: {
        signature: "0x01",
        authorization: {
          from: "0x2222222222222222222222222222222222222222",
          to: PAY_TO,
          value: config.amountAtomic,
          validAfter: "0",
          validBefore: "9999999999",
          nonce: `0x${"00".repeat(32)}`,
        },
      },
    };
    expect(() => assertCoinbasePaymentBinding(payload, config)).not.toThrow();
    expect(() =>
      assertCoinbasePaymentBinding(
        { ...payload, accepted: { ...accepted, amount: "1" } },
        config,
      ),
    ).toThrow("PAYMENT_AMOUNT_MISMATCH");
  });

  it("fingerprints are deterministic across object-key order", () => {
    expect(coinbaseRequestFingerprint({ b: 2, a: 1 })).toBe(
      coinbaseRequestFingerprint({ a: 1, b: 2 }),
    );
    expect(coinbasePaymentFingerprint({ z: 1, a: { d: 4, c: 3 } })).toBe(
      coinbasePaymentFingerprint({ a: { c: 3, d: 4 }, z: 1 }),
    );
  });

  it("never forwards facilitator EXTENSION-RESPONSES through PAYMENT-RESPONSE", () => {
    const encoded = coinbaseX402PaymentResponseHeader({
      success: true,
      transaction: `0x${"11".repeat(32)}`,
      network: "eip155:84532",
      extensionResponses: {
        bazaar: { status: "rejected", rejectedReason: "internal catalog reason" },
      },
      extensions: { buyerVisible: { status: "ok" } },
    });
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    expect(decoded.extensionResponses).toBeUndefined();
    expect(decoded.extensions).toEqual({ buyerVisible: { status: "ok" } });
  });

  it("extracts only bounded Bazaar status data for internal telemetry", () => {
    expect(
      bazaarExtensionOutcome(null, {
        success: true,
        extensionResponses: { bazaar: { status: "success" } },
      }),
    ).toEqual({ status: "success", rejectedReason: null });

    const rejected = bazaarExtensionOutcome(null, {
      success: true,
      extensionResponses: {
        bazaar: { status: "rejected", rejectedReason: "x".repeat(900), secret: "ignore-me" },
      },
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectedReason).toHaveLength(500);
  });
});