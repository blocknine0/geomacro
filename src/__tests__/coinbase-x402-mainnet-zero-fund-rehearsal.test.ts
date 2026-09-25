import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { COMMERCIAL_LAUNCH_ACK } from "../lib/commercial-launch-gate.server";
import {
  COINBASE_X402_MAINNET_ACK,
  COINBASE_X402_MAINNET_NETWORK,
  COINBASE_X402_MAINNET_USDC,
  assertCoinbasePaymentBinding,
  coinbasePaymentFingerprint,
  coinbaseRequestFingerprint,
  coinbaseX402PaymentRequirements,
  coinbaseX402PaymentResponseHeader,
  getCoinbaseX402Config,
} from "../lib/coinbase-x402.server";
import {
  GEOMACRO_INTELLIGENCE_PRICE_USDC,
  GEOMACRO_INTELLIGENCE_PRODUCT_ID,
  GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
} from "../lib/geomacro-intelligence-contract";

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

function enableMainnetRehearsal() {
  process.env.COINBASE_X402_ENVIRONMENT = "production";
  process.env.COINBASE_X402_PAY_TO = PAY_TO;
  process.env.COINBASE_X402_PRICE_USDC = "0.05";
  process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
  process.env.COINBASE_X402_MAINNET_ACK = COINBASE_X402_MAINNET_ACK;
}

function currentResponseBuilderSource() {
  return readFileSync("src/lib/agent-query-response.server.ts", "utf8");
}

describe("Coinbase x402 mainnet zero-fund rehearsal", () => {
  it("constructs the exact Base mainnet USDC requirement without contacting a facilitator", () => {
    enableMainnetRehearsal();
    const config = getCoinbaseX402Config();
    expect(config?.commercialEnvironment).toBe("mainnet");
    expect(config?.network).toBe("eip155:8453");
    expect(config?.network).toBe(COINBASE_X402_MAINNET_NETWORK);
    expect(config?.asset).toBe(COINBASE_X402_MAINNET_USDC);
    expect(config?.priceUsdc).toBe("0.05");
    expect(config?.amountAtomic).toBe("50000");

    const required = coinbaseX402PaymentRequirements(config!);
    expect(required).toEqual({
      scheme: "exact",
      network: "eip155:8453",
      asset: COINBASE_X402_MAINNET_USDC,
      amount: "50000",
      payTo: PAY_TO,
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    });
  });

  it("binds a simulated mainnet payment proof to network, token, amount and receiver", () => {
    enableMainnetRehearsal();
    const config = getCoinbaseX402Config()!;
    const accepted = coinbaseX402PaymentRequirements(config);
    const payload = {
      x402Version: 2,
      accepted,
      payload: {
        signature: "0x" + "11".repeat(65),
        authorization: {
          from: "0x2222222222222222222222222222222222222222",
          to: PAY_TO,
          value: "50000",
          validAfter: "0",
          validBefore: "9999999999",
          nonce: "0x" + "00".repeat(32),
        },
      },
    };

    expect(() => assertCoinbasePaymentBinding(payload, config)).not.toThrow();
    expect(() => assertCoinbasePaymentBinding(
      { ...payload, accepted: { ...accepted, network: "eip155:84532" } },
      config,
    )).toThrow("PAYMENT_NETWORK_MISMATCH");
    expect(() => assertCoinbasePaymentBinding(
      { ...payload, accepted: { ...accepted, asset: "0x" + "33".repeat(20) } },
      config,
    )).toThrow("PAYMENT_ASSET_MISMATCH");
    expect(() => assertCoinbasePaymentBinding(
      { ...payload, accepted: { ...accepted, amount: "1" } },
      config,
    )).toThrow("PAYMENT_AMOUNT_MISMATCH");
    expect(() => assertCoinbasePaymentBinding(
      { ...payload, accepted: { ...accepted, payTo: "0x" + "44".repeat(20) } },
      config,
    )).toThrow("PAYMENT_RECIPIENT_MISMATCH");
  });

  it("keeps query and payment fingerprints deterministic and independent", () => {
    const request = { product: GEOMACRO_INTELLIGENCE_PRODUCT_ID, query_plan_hash: "a".repeat(64), request: { subjects: ["USA"] } };
    const payment = { x402Version: 2, accepted: { network: "eip155:8453", amount: "50000" } };
    expect(coinbaseRequestFingerprint(request)).toBe(coinbaseRequestFingerprint({ request: { subjects: ["USA"] }, query_plan_hash: "a".repeat(64), product: GEOMACRO_INTELLIGENCE_PRODUCT_ID }));
    expect(coinbasePaymentFingerprint(payment)).toBe(coinbasePaymentFingerprint({ accepted: { amount: "50000", network: "eip155:8453" }, x402Version: 2 }));
    expect(coinbaseRequestFingerprint(request)).not.toBe(coinbaseRequestFingerprint({ ...request, request: { subjects: ["CHN"] } }));
  });

  it("keeps the current structured-response builder fail-closed before settlement", () => {
    const source = currentResponseBuilderSource();

    expect(source).toContain('if (result.context.execution_authorized !== false || result.response.execution_authorized !== false)');
    expect(source).toContain("execution_authorized: false,");
    expect(source).toContain("delivered_product_hash: hash(core)");
  });

  it("does not leak facilitator extension responses into buyer-visible PAYMENT-RESPONSE", () => {
    const encoded = coinbaseX402PaymentResponseHeader({
      success: true,
      transaction: "0x" + "11".repeat(32),
      network: "eip155:8453",
      extensionResponses: { bazaar: { status: "success", internal: "hidden" } },
      extensions: { buyer_visible: true },
    });
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    expect(decoded.extensionResponses).toBeUndefined();
    expect(decoded.extensions).toEqual({ buyer_visible: true });
  });

  it("keeps the mainnet payment requirement truthful for the rehearsal target", () => {
    enableMainnetRehearsal();
    const config = getCoinbaseX402Config()!;
    const required = coinbaseX402PaymentRequirements(config);
    expect(required.network).toBe("eip155:8453");
    expect(required.asset).toBe(COINBASE_X402_MAINNET_USDC);
    expect(required.amount).toBe("50000");
    expect(required.payTo).toBe(PAY_TO);
    expect(required.scheme).toBe("exact");
    expect(required.maxTimeoutSeconds).toBe(60);
    expect(required.extra).toEqual({ name: "USDC", version: "2" });
    expect(GEOMACRO_INTELLIGENCE_PRICE_USDC).toBe("0.05");
  });
});
