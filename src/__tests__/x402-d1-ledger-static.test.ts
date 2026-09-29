import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync("workers/x402-ledger/src/index.mjs", "utf8");
const schema = readFileSync("workers/x402-ledger/schema.sql", "utf8");
const client = readFileSync("src/lib/x402-delivery-ledger-edge.server.ts", "utf8");

describe("Cloudflare D1 x402 delivery ledger contract", () => {
  it("keeps D1 opt-in so production remains on Supabase by default", () => {
    expect(client).toContain('process.env.X402_LEDGER_BACKEND ?? "supabase"');
    expect(client).toContain('!== "edge_d1"');
  });

  it("authenticates every mutation with a timestamped HMAC", () => {
    expect(worker).toContain("x-geomacro-timestamp");
    expect(worker).toContain("x-geomacro-signature");
    expect(worker).toContain("MAX_SKEW_SECONDS = 60");
    expect(worker).toContain('name: "HMAC"');
  });

  it("preserves the prepared irreversible-side-effect boundary", () => {
    expect(worker).toContain("PREPARED_LEASE_EXPIRED_RECONCILIATION_REQUIRED");
    expect(worker).toContain('state=\'manual_review\'');
    expect(worker).toContain('row.state === "prepared"');
    expect(worker).toContain('row.state === "failed"');
  });

  it("requires prepared response state before completion", () => {
    expect(worker).toContain("state='prepared' AND response_payload IS NOT NULL");
    expect(worker).toContain("COMPLETE_LOST_CLAIM");
  });

  it("prevents duplicate settlement references and payment fingerprints", () => {
    expect(schema).toContain("payment_fingerprint_sha256 TEXT PRIMARY KEY");
    expect(schema).toContain("coinbase_x402_settlement_tx_unique");
  });

  it("does not persist raw payment authorization material", () => {
    for (const forbidden of ["payment_signature", "authorization_payload", "api_key_secret", "private_key"]) {
      expect(schema.toLowerCase()).not.toContain(forbidden);
    }
  });
});
