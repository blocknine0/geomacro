import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  type GeomacroRiskObject,
} from "../lib/risk-object-contract";
import { signRiskObject } from "../lib/risk-object-signing.server";
import {
  assertCommercialRiskObjectDeliverable,
  verifyCommercialRiskObjectArtifact,
} from "../lib/commercial-risk-object-policy";

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    keyId: "commercial-policy-test-key",
    privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  };
}

function fixture(input: {
  commercial?: GeomacroRiskObject["commercial_eligibility"]["status"];
  verification?: GeomacroRiskObject["verification"]["status"];
} = {}): GeomacroRiskObject {
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: "gro_country_USA_commercial_policy_test",
    subject: { type: "country", id: "USA", name: "United States" },
    risk: { score: 55, label: "WATCH", previous_score: 50, delta: 5, direction: "escalating" },
    attribution: [],
    confidence: 0.9,
    evidence: [],
    evidence_coverage: null,
    evidence_summary: { event_count: 0, evidence_count: 0, independent_source_count: 0 },
    methodology_version: COUNTRY_RISK_METHOD_VERSION,
    generated_at: "2026-09-15T04:00:00.000Z",
    expires_at: "2026-09-15T07:00:00.000Z",
    issuer: "Geomacro",
    commercial_eligibility: {
      status: input.commercial ?? "VERIFIED",
      reason_codes: input.commercial === "VERIFIED" || input.commercial === undefined ? [] : ["test_commercial_boundary"],
    },
    verification: {
      status: input.verification ?? "VERIFIED",
      reason_codes: input.verification === "VERIFIED" || input.verification === undefined ? [] : ["test_verification_boundary"],
      last_verified_at: "2026-09-15T04:00:00.000Z",
    },
    integrity: {
      input_hash: "a".repeat(64),
      data_hash: "b".repeat(64),
      calculation_hash: "c".repeat(64),
      payload_hash: null,
      canonicalization: null,
      signature: null,
      signature_scheme: null,
      signing_key_id: null,
    },
    provenance: {
      structure_versions: [],
      scoring_versions: [],
      relevance_versions: [],
      country_versions: [],
      story_versions: [],
    },
  };
}

function signed(input?: Parameters<typeof fixture>[0]) {
  const key = keys();
  const object = signRiskObject(fixture(input), {
    key_id: key.keyId,
    private_key_pkcs8_b64: key.privateKey,
  });
  return {
    object,
    options: {
      now: new Date("2026-09-15T05:00:00.000Z"),
      verification_keys: { [key.keyId]: key.publicKey },
    },
  };
}

describe("commercial Risk Object delivery policy", () => {
  it("allows only a current authentic commercially verified object", () => {
    const { object, options } = signed();
    const report = verifyCommercialRiskObjectArtifact(object, options);
    expect(report.deliverable).toBe(true);
    expect(report.reason_codes).toEqual([]);
    expect(() => assertCommercialRiskObjectDeliverable(object, options)).not.toThrow();
  });

  it.each(["UNVERIFIED", "INELIGIBLE"] as const)(
    "rejects an authentic object with commercial status %s",
    (commercial) => {
      const { object, options } = signed({ commercial, verification: "INCOMPLETE" });
      const report = verifyCommercialRiskObjectArtifact(object, options);
      expect(report.cryptographic_valid).toBe(true);
      expect(report.deliverable).toBe(false);
      expect(report.reason_codes).toContain("commercial_eligibility_not_verified");
      expect(() => assertCommercialRiskObjectDeliverable(object, options)).toThrow(
        "COMMERCIAL_RISK_OBJECT_NOT_DELIVERABLE",
      );
    },
  );

  it("rejects an authentic object whose embedded verification is not VERIFIED", () => {
    const { object, options } = signed({ commercial: "VERIFIED", verification: "INCOMPLETE" });
    const report = verifyCommercialRiskObjectArtifact(object, options);
    expect(report.cryptographic_valid).toBe(true);
    expect(report.deliverable).toBe(false);
    expect(report.reason_codes).toContain("embedded_verification_not_verified");
  });

  it("rejects tampering even when commercial flags remain VERIFIED", () => {
    const { object, options } = signed();
    const tampered = { ...object, risk: { ...object.risk, score: 99 } };
    const report = verifyCommercialRiskObjectArtifact(tampered, options);
    expect(report.cryptographic_valid).toBe(false);
    expect(report.deliverable).toBe(false);
  });
});
