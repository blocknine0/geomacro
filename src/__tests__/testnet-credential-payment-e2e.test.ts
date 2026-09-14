import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { testnetIntelligenceRequestSchema } from "@/lib/testnet-intelligence-contract";
import { testnetRequestFingerprint } from "@/lib/testnet-request-binding.server";

const read = (path: string) => readFileSync(path, "utf8");
const pricingScript = read("public/testnet-console-pricing.js");
const consoleScript = read("public/testnet-console.js");
const developerRoute = read("server/api/testnet/intelligence.post.ts");
const testerRoute = read("server/api/testnet-tester/intelligence.post.ts");
const binding = read("src/lib/testnet-request-binding.server.ts");
const commercialAccess = read("src/lib/commercial-access.server.ts");
const migration = read("supabase/migrations/914_testnet_exact_request_binding.sql");
const siteShell = read("src/components/site-shell.tsx");

describe("Testnet credential -> 402 -> same transaction -> intelligence E2E", () => {
  it("keeps public browser access and private developer authentication as separate surfaces", () => {
    expect(consoleScript).toContain('/api/testnet-tester/intelligence');
    expect(consoleScript).toContain('"x-geomacro-public-key"');
    expect(consoleScript).toContain("Get price quote");
    expect(pricingScript).not.toContain("window.fetch =");
    expect(pricingScript).not.toContain("/api/testnet/intelligence");
    expect(pricingScript).not.toContain("testerCredentialPair");

    expect(developerRoute).toContain("authenticateCommercialApiRequest");
    expect(commercialAccess).toContain("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(commercialAccess).toContain('apiCredentialDigest(input.apiSecret, "testnet-api-secret")');
  });

  it("requires an immutable server request binding and retries the same browser request after payment", () => {
    expect(developerRoute).toContain("bindTestnetIntelligenceRequest");
    expect(developerRoute).toContain("request_binding: requestBinding");
    expect(testerRoute).toContain("bindTestnetIntelligenceRequest");
    expect(testerRoute).toContain("request_binding: requestBinding");
    expect(binding).toContain("TESTNET_REQUEST_IDEMPOTENCY_CONFLICT");
    expect(binding).toContain("do not send another payment");
    expect(consoleScript).toContain("pendingRequest = request");
    expect(consoleScript).toContain("await executeRequest({ ...pendingRequest, payment: pendingPayment })");
  });

  it("fingerprints the normalized billable request but excludes payment proof", () => {
    const quoteRequest = testnetIntelligenceRequestSchema.parse({
      request_id: "fingerprint-test-0001",
      capability: "signed_risk_object",
      subject: { type: "country", country_iso3: "IND" },
    });
    const paidRetry = testnetIntelligenceRequestSchema.parse({
      request_id: "fingerprint-test-0001",
      capability: "signed_risk_object",
      subject: { type: "country", country_iso3: "IND" },
      payment: {
        chain_key: "arcTestnet",
        tx_hash: `0x${"a".repeat(64)}`,
        payer_address: `0x${"1".repeat(40)}`,
      },
    });
    const changedPayload = testnetIntelligenceRequestSchema.parse({
      request_id: "fingerprint-test-0001",
      capability: "signed_risk_object",
      subject: { type: "country", country_iso3: "USA" },
    });

    expect(testnetRequestFingerprint(quoteRequest)).toBe(testnetRequestFingerprint(paidRetry));
    expect(testnetRequestFingerprint(changedPayload)).not.toBe(testnetRequestFingerprint(quoteRequest));
  });

  it("persists an immutable principal/request id binding in the private Testnet ledger", () => {
    expect(migration).toContain("create table if not exists public.testnet_api_request_bindings");
    expect(migration).toContain("unique (principal_id, request_id)");
    expect(migration).toContain("request_fingerprint_sha256");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("grant all on table public.testnet_api_request_bindings to service_role");
  });

  it("surfaces Testnet API under Technical Proof for live deployment verification", () => {
    expect(siteShell).toContain('{ to: "/testnet-access", label: "Testnet API"');
    expect(siteShell).toContain('<Link to="/testnet-access" className="hover:text-foreground">Testnet API</Link>');
  });
});
