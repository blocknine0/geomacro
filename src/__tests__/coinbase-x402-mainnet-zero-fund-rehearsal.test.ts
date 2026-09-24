import { afterEach, describe, expect, it } from "vitest";
import { COMMERCIAL_LAUNCH_ACK } from "../lib/commercial-launch-gate.server";
import {
  COINBASE_X402_MAINNET_ACK,
  COINBASE_X402_MAINNET_NETWORK,
  COINBASE_X402_MAINNET_USDC,
  assertCoinbasePaymentBinding,
  coinbasePaymentFingerprint,
  coinbaseRequestFingerprint,
  coinbaseX402PaymentRequired,
  coinbaseX402PaymentRequirements,
  coinbaseX402PaymentResponseHeader,
  getCoinbaseX402Config,
} from "../lib/coinbase-x402.server";
import {
  GEOMACRO_INTELLIGENCE_PRICE_USDC,
  GEOMACRO_INTELLIGENCE_PRODUCT_ID,
  GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
  assertGeomacroIntelligenceResponseContract,
  computeGeomacroIntelligenceProductHash,
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

function minimalValidResponse() {
  const response = {
    schema_version: GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
    product: GEOMACRO_INTELLIGENCE_PRODUCT_ID,
    request_id: "00000000-0000-4000-8000-000000000001",
    client_request_id: null,
    query_plan_hash: "a".repeat(64),
    question_interpretation: {},
    subjects: [{ type: "country", country_iso3: "USA" }],
    as_of: new Date().toISOString(),
    analysis: {},
    structural: [],
    hot_topics: [],
    risk_gate: [{
      subject: { type: "country", country_iso3: "USA" },
      result: {
        context: { execution_authorized: false },
        response: { execution_authorized: false },
      },
    }],
    signed_risk_objects: [{
      subject: { type: "country", country_iso3: "USA" },
      object: {
        risk_object_id: "gro_test_usa",
        verification: { status: "VERIFIED" },
        delivery_boundary: "SIGNED_RISK_OBJECT_ATTESTATION_ONLY",
        integrity: {
          payload_hash: "b".repeat(64),
          calculation_hash: "c".repeat(64),
          signature_scheme: "Ed25519",
          signing_key_id: "geomacro-risk-2026-03",
        },
      },
    }],
    gri_context: null,
    current_state: [],
    answer: {},
    methodology: {
      response_schema_version: GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
    },
    limitations: {
      execution_authorized: false,
    },
    execution_authorized: false,
    delivered_product_hash: "",
  };
  response.delivered_product_hash = computeGeomacroIntelligenceProductHash(response);
  return response;
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

  it("proves the structured product is valid before settlement and rejects unsafe responses", () => {
    const valid = minimalValidResponse();
    expect(() => assertGeomacroIntelligenceResponseContract(valid)).not.toThrow();

    const missingHash = { ...valid, delivered_product_hash: "bad" };
    expect(() => assertGeomacroIntelligenceResponseContract(missingHash)).toThrow("INTELLIGENCE_RESPONSE_PRODUCT_HASH_INVALID");

    const executionLeak = { ...valid, execution_authorized: true };
    expect(() => assertGeomacroIntelligenceResponseContract(executionLeak)).toThrow("INTELLIGENCE_RESPONSE_EXECUTION_BOUNDARY_VIOLATION");

    const unverified = {
      ...valid,
      signed_risk_objects: [{
        ...valid.signed_risk_objects[0],
        object: {
          ...(valid.signed_risk_objects[0] as any).object,
          verification: { status: "UNVERIFIED" },
        },
      }],
    };
    expect(() => assertGeomacroIntelligenceResponseContract(unverified)).toThrow("INTELLIGENCE_RESPONSE_RISK_OBJECT_VERIFICATION_INVALID");
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

  it("keeps the public payment requirement truthful for the rehearsal target", () => {
    enableMainnetRehearsal();
    const config = getCoinbaseX402Config()!;
    const required = coinbaseX402PaymentRequired(
      new Request("https://geomacro.live/api/x402/intelligence", { method: "POST" }),
      config,
    );
    expect(required.x402Version).toBe(2);
    expect(required.resource.url).toBe("https://geomacro.live/api/x402/intelligence");
    expect(required.accepts[0].network).toBe("eip155:8453");
    expect(required.accepts[0].asset).toBe(COINBASE_X402_MAINNET_USDC);
    expect(required.accepts[0].amount).toBe("50000");
    expect(required.accepts[0].payTo).toBe(PAY_TO);
    expect(GEOMACRO_INTELLIGENCE_PRICE_USDC).toBe("0.05");
  });
});
