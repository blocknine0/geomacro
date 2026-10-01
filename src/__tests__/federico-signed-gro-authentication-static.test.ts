import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync(
  "scripts/invinoveritas-signed-gro-authentication.ts",
  "utf8",
);

describe("Federico signed GRO authentication-only handoff", () => {
  it("binds exact signed evidence without authorizing a risk decision or execution", () => {
    expect(script).toContain('evidence_type: "signed_risk_object"');
    expect(script).toContain("record_sha256: recordSha256");
    expect(script).toContain("record: signedRiskObjectRecord");
    expect(script).toContain('artifact_type: "general"');
    expect(script).toContain("action_proposed: false");
    expect(script).toContain("execution_authorized: false");
    expect(script).toContain('scope: "authentication_and_interoperability_only"');
    expect(script).toContain("semantic_risk_admission_authorized: false");
    expect(script).toContain("irreversible_execution_authorized: false");
  });

  it("requires deployed, local cryptographic and freshness verification", () => {
    expect(script).toContain('deployed_original_verification: "PASS"');
    expect(script).toContain('deployed_tamper_rejection: "PASS"');
    expect(script).toContain('local_payload_hash: "PASS"');
    expect(script).toContain('local_ed25519_signature: "PASS"');
    expect(script).toContain('freshness: "PASS"');
  });

  it("requires signed partner proof after successful review and records 402 without spending automatically", () => {
    expect(script).toContain("response.status === 402");
    expect(script).toContain('partner_review_http: "PAYMENT_REQUIRED"');
    expect(script).toContain('partner_signed_proof: "NOT_RUN"');
    expect(script).toContain('partner_proof_verification: "NOT_RUN"');
    expect(script).toContain("required_sats: requiredSats");
    expect(script).toContain("process.exit(0)");
    expect(script).toContain('partner_review_http: "PASS"');
    expect(script).toContain('partner_signed_proof: "PASS"');
    expect(script).toContain('partner_proof_verification: "PASS"');
    expect(script).toContain("Federico /review returned no signed proof");
    expect(script).toContain("Federico signed proof could not be independently verified");
  });
});
