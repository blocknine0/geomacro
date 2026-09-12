import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { testnetIntelligenceRequestSchema } from "@/lib/testnet-intelligence-contract";
import { testnetRequestFingerprint } from "@/lib/testnet-request-binding.server";

const read = (path: string) => readFileSync(path, "utf8");
const consoleBridge = read("public/testnet-console-pricing.js");
const developerRoute = read("server/api/testnet/intelligence.post.ts");
const testerRoute = read("server/api/testnet-tester/intelligence.post.ts");
const binding = read("src/lib/testnet-request-binding.server.ts");
const migration = read("supabase/migrations/914_testnet_exact_request_binding.sql");
const siteShell = read("src/components/site-shell.tsx");

describe("Testnet credential -> 402 -> same transaction -> intelligence E2E", () => {
  it("uses the issued API Key + API Secret on the canonical developer endpoint", () => {
    expect(consoleBridge).toContain('CREDENTIAL_KEY = "geomacro-testnet-api-credential:v1"');
    expect(consoleBridge).toContain("/api/testnet/account");
    expect(consoleBridge).toContain("GeomacroTest ${credential.api_key}.${credential.api_secret}");
    expect(consoleBridge).toContain('nativeFetch("/api/testnet/intelligence"');
    expect(consoleBridge).toContain('requestPath(input) !== "/api/testnet-tester/intelligence"');
    expect(consoleBridge).toContain("entitlement_grant_id");
    expect(consoleBridge).toContain("sessionStorage");
    expect(consoleBridge).not.toContain("localStorage");
  });

  it("requires a server exact-request binding before a wallet payment can proceed", () => {
    expect(developerRoute).toContain("bindTestnetIntelligenceRequest");
    expect(developerRoute).toContain("request_binding: requestBinding");
    expect(testerRoute).toContain("bindTestnetIntelligenceRequest");
    expect(consoleBridge).toContain("TESTNET_REQUEST_BINDING_MISSING");
    expect(consoleBridge).toContain("request_fingerprint_sha256");
    expect(binding).toContain("TESTNET_REQUEST_IDEMPOTENCY_CONFLICT");
    expect(binding).toContain("do not send another payment");
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

  it("keeps Testnet Access out of public navigation until the live E2E acceptance gate passes", () => {
    expect(siteShell).not.toContain('href="/testnet-access"');
    expect(siteShell).not.toContain('to: "/testnet-access"');
  });
});
