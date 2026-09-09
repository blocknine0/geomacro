import {
  generateKeyPairSync,
} from "node:crypto";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  type GeomacroRiskObject,
} from "../lib/risk-object-contract";

import {
  signRiskObject,
} from "../lib/risk-object-signing.server";

import {
  RISK_OBJECT_VERIFICATION_VERSION,
  verifyPublicRiskObjectArtifact,
} from "../lib/risk-object-verification.server";

function fixture():
  GeomacroRiskObject {
  return {
    schema_version:
      GRO_SCHEMA_VERSION,

    object_id:
      "gro_country_USA_verification_test",

    subject: {
      type: "country",
      id: "USA",
      name: "United States",
    },

    risk: {
      score: 61,
      label: "ELEVATED",
      previous_score: 58,
      delta: 3,
      direction: "escalating",
    },

    attribution: [],
    confidence: 0.88,
    evidence: [],
    evidence_coverage: null,

    evidence_summary: {
      event_count: 0,
      evidence_count: 0,
      independent_source_count: 0,
    },

    methodology_version:
      COUNTRY_RISK_METHOD_VERSION,

    generated_at:
      "2026-09-09T12:00:00.000Z",
    expires_at:
      "2026-09-09T15:00:00.000Z",

    issuer: "Geomacro",

    commercial_eligibility: {
      status: "VERIFIED",
      reason_codes: [],
    },

    verification: {
      status: "VERIFIED",
      reason_codes: [],
      last_verified_at:
        "2026-09-09T12:00:00.000Z",
    },

    integrity: {
      input_hash: "a".repeat(64),
      data_hash: "b".repeat(64),
      calculation_hash:
        "c".repeat(64),
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

function signingKeys() {
  const {
    privateKey,
    publicKey,
  } =
    generateKeyPairSync(
      "ed25519",
    );

  return {
    keyId: "verification-test-key",
    privateKey:
      privateKey
        .export({
          format: "der",
          type: "pkcs8",
        })
        .toString("base64"),
    publicKey:
      publicKey
        .export({
          format: "der",
          type: "spki",
        })
        .toString("base64"),
  };
}

function signedFixture() {
  const key = signingKeys();

  const signed =
    signRiskObject(
      fixture(),
      {
        key_id: key.keyId,
        private_key_pkcs8_b64:
          key.privateKey,
      },
    );

  return {
    signed,
    verificationKeys: {
      [key.keyId]: key.publicKey,
    },
  };
}

describe(
  "public Risk Object verification",
  () => {
    it(
      "verifies an authentic current artifact",
      () => {
        const {
          signed,
          verificationKeys,
        } = signedFixture();

        const report =
          verifyPublicRiskObjectArtifact(
            signed,
            {
              now: new Date(
                "2026-09-09T13:00:00.000Z",
              ),
              verification_keys:
                verificationKeys,
            },
          );

        expect(
          report.verification_version,
        ).toBe(
          RISK_OBJECT_VERIFICATION_VERSION,
        );
        expect(report.valid).toBe(true);
        expect(report.status).toBe(
          "VERIFIED",
        );
        expect(
          report.cryptographic_valid,
        ).toBe(true);
        expect(
          report.checks.payload_hash_matches,
        ).toBe(true);
        expect(
          report.checks.signature,
        ).toBe(true);
        expect(
          report.reason_codes,
        ).toEqual([]);
      },
    );

    it(
      "detects payload tampering",
      () => {
        const {
          signed,
          verificationKeys,
        } = signedFixture();

        const tampered = {
          ...signed,
          risk: {
            ...signed.risk,
            score: 99,
          },
        };

        const report =
          verifyPublicRiskObjectArtifact(
            tampered,
            {
              now: new Date(
                "2026-09-09T13:00:00.000Z",
              ),
              verification_keys:
                verificationKeys,
            },
          );

        expect(report.valid).toBe(false);
        expect(report.status).toBe(
          "INVALID",
        );
        expect(
          report.cryptographic_valid,
        ).toBe(false);
        expect(
          report.reason_codes,
        ).toContain(
          "payload_hash_mismatch",
        );
      },
    );

    it(
      "keeps authentic history verifiable but marks an expired artifact unusable now",
      () => {
        const {
          signed,
          verificationKeys,
        } = signedFixture();

        const report =
          verifyPublicRiskObjectArtifact(
            signed,
            {
              now: new Date(
                "2026-09-09T16:00:00.000Z",
              ),
              verification_keys:
                verificationKeys,
            },
          );

        expect(report.valid).toBe(false);
        expect(report.status).toBe(
          "EXPIRED",
        );
        expect(
          report.cryptographic_valid,
        ).toBe(true);
        expect(report.fresh).toBe(false);
        expect(
          report.reason_codes,
        ).toContain("artifact_expired");
      },
    );

    it(
      "rejects a signed artifact with a non-current methodology",
      () => {
        const key = signingKeys();
        const wrongMethodology = {
          ...fixture(),
          methodology_version:
            "country-risk-v999" as
              typeof COUNTRY_RISK_METHOD_VERSION,
        };

        const signed =
          signRiskObject(
            wrongMethodology,
            {
              key_id: key.keyId,
              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        const report =
          verifyPublicRiskObjectArtifact(
            signed,
            {
              now: new Date(
                "2026-09-09T13:00:00.000Z",
              ),
              verification_keys: {
                [key.keyId]: key.publicKey,
              },
            },
          );

        expect(
          report.cryptographic_valid,
        ).toBe(true);
        expect(report.contract_valid).toBe(
          false,
        );
        expect(
          report.reason_codes,
        ).toContain(
          "methodology_mismatch",
        );
      },
    );

    it(
      "never throws on malformed public input",
      () => {
        const report =
          verifyPublicRiskObjectArtifact(
            {
              schema_version:
                GRO_SCHEMA_VERSION,
            },
            {
              now: new Date(
                "2026-09-09T13:00:00.000Z",
              ),
              verification_keys: {},
            },
          );

        expect(report.valid).toBe(false);
        expect(report.status).toBe(
          "INVALID",
        );
        expect(
          report.reason_codes,
        ).toContain(
          "malformed_risk_object",
        );
      },
    );
  },
);
