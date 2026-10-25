import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyCentralSecurityRoute } from "../lib/central-security.server";

const implementation = readFileSync(
  "src/lib/mainnet-intelligence-endpoint.server.ts",
  "utf8",
);
const offer = readFileSync("src/lib/capability-x402-offer.server.ts", "utf8");
const canonicalRoute = readFileSync(
  "src/routes/api.v1.intelligence.query.ts",
  "utf8",
);
const legacyRoute = readFileSync(
  "src/routes/api.x402.intelligence.ts",
  "utf8",
);
const discovery = readFileSync("src/lib/x402-discovery.server.ts", "utf8");
const marketplace = JSON.parse(
  readFileSync("config/agent-marketplace-distribution.json", "utf8"),
) as any;

const CANONICAL = "/api/v1/intelligence/query";
const LEGACY = "/api/x402/intelligence";

describe("Geomacro Mainnet Intelligence API v1", () => {
  it("mounts canonical and legacy routes on one shared commercial handler", () => {
    expect(canonicalRoute).toContain('createFileRoute("/api/v1/intelligence/query")');
    expect(legacyRoute).toContain('createFileRoute("/api/x402/intelligence")');
    expect(canonicalRoute).toContain("mainnetIntelligenceHandlers");
    expect(legacyRoute).toContain("mainnetIntelligenceHandlers");
    expect(canonicalRoute).toContain("../lib/mainnet-intelligence-endpoint.server");
    expect(legacyRoute).toContain("../lib/mainnet-intelligence-endpoint.server");
    expect(canonicalRoute).not.toContain("settleCoinbaseX402");
    expect(legacyRoute).not.toContain("settleCoinbaseX402");
  });

  it("keeps payment, exactly-once delivery, hashing and sanitation in the shared implementation", () => {
    for (const invariant of [
      "checkAgentQueryDeliverability",
      "claimCoinbaseX402Delivery",
      "reserveCoinbaseX402AgentUsage",
      "verifyCoinbaseX402",
      "prepareCoinbaseX402Delivery",
      "settleCoinbaseX402",
      "completeCoinbaseX402Delivery",
      "sanitizeAndRehashPaidPreparedResponse",
      "assertPublicPaidOutputBoundary",
      "assertGeomacroIntelligenceResponseContract",
      "delivered_product_hash",
      "execution_authorized: false",
    ]) {
      expect(implementation + offer).toContain(invariant);
    }
    expect(implementation).toContain(
      'CANONICAL_MAINNET_INTELLIGENCE_PATH = "/api/v1/intelligence/query"',
    );
    expect(implementation).toContain(
      'LEGACY_X402_INTELLIGENCE_PATH = "/api/x402/intelligence"',
    );
    expect(implementation).toContain(
      "new URL(CANONICAL_MAINNET_INTELLIGENCE_PATH, request.url)",
    );
  });

  it("normalizes question-only requests before the same canonical no-charge and x402 gates", () => {
    expect(implementation).toContain('import { normalizeAnswerQuestionRequest } from "./geomacro-answer-request.server"');
    expect(implementation).toContain("const normalized = normalizeAnswerQuestionRequest(raw)");
    expect(implementation).toContain("parsed = agentAdaptiveQuerySchema.parse(normalized.value)");
    expect(implementation).toContain("CAPABILITY_PRICE_UNVERIFIED_NO_CHARGE");
    expect(implementation).toContain("resolveEligibleCoinbaseCapabilityConfig(plan, availability, config)");
  });

  it("binds one verified capability price to quote, payment, replay, ledger and prepared delivery", () => {
    expect(implementation).toContain('import { resolveEligibleCoinbaseCapabilityConfig }');
    expect(implementation).toContain('config = resolveEligibleCoinbaseCapabilityConfig(plan, availability, config)');
    expect(implementation).toContain('finalConfig.amountAtomic !== config.amountAtomic');
    expect(implementation).toContain('coinbaseRequirementsForCapabilityQuote(config,quote)');
    expect(implementation).toContain('assertCoinbasePaymentBinding(paymentPayload,config)');
    expect(implementation).toContain('claimCoinbaseX402Delivery({ paymentFingerprint, requestFingerprint:ledgerRequestFingerprint, clientRequestId: parsed.client_request_id ?? null, config })');
    expect(implementation).toContain('reserveCoinbaseX402AgentUsage({ paymentFingerprint, payer: verified.payer, config })');
    expect(offer).toContain('priceUsdc:price.amount_usdc');
    expect(implementation).toContain('settleCoinbaseX402(paymentPayload, config)');
    expect(implementation).toContain('CAPABILITY_PRICE_UNVERIFIED_NO_CHARGE');
    expect(implementation).toContain('FINAL_CAPABILITY_PRICE_UNVERIFIED');
  });

  it("keeps both entry paths behind the payment security class", () => {
    expect(classifyCentralSecurityRoute(CANONICAL, "POST")).toBe("payment");
    expect(classifyCentralSecurityRoute(LEGACY, "POST")).toBe("payment");
  });

  it("locks the canonical v1 endpoint in runtime discovery and marketplace config", () => {
    expect(discovery).toContain("/api/v1/intelligence/query");
    expect(marketplace.canonical_paid_endpoint).toBe(
      "https://geomacro.live/api/v1/intelligence/query",
    );
    expect(marketplace.submission_identity.approved_endpoint_paths).toContain(
      CANONICAL,
    );
    expect(marketplace.submission_identity.approved_endpoint_paths).not.toContain(
      LEGACY,
    );
  });
});
