import {
  generateKeyPairSync,
} from "node:crypto";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  GRO_SCHEMA_VERSION,
  COUNTRY_RISK_METHOD_VERSION,
  type GeomacroRiskObject,
} from "../lib/risk-object-contract";

import {
  signRiskObject,
  verifyRiskObjectSignature,
} from "../lib/risk-object-signing.server";

function fixture():
  GeomacroRiskObject {
  return {
    schema_version:
      GRO_SCHEMA_VERSION,

    object_id:
      "gro_country_USA_test",

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
      "2026-09-07T18:30:37.459Z",

    expires_at:
      "2026-09-07T21:30:37.459Z",

    issuer: "Geomacro",

    commercial_eligibility: {
      status: "UNVERIFIED",
      reason_codes: [
        "commercial_source_eligibility_not_enforced",
      ],
    },

    verification: {
      status: "INCOMPLETE",
      reason_codes: [
        "commercial_source_eligibility_not_enforced",
      ],
      last_verified_at: null,
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

function keys() {
  const {
    privateKey,
    publicKey,
  } =
    generateKeyPairSync(
      "ed25519",
    );

  return {
    keyId:
      "test-key-1",

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

describe(
  "signed Geomacro Risk Object",
  () => {
    it(
      "signs and verifies a gro-1.1 object",
      () => {
        const key = keys();

        const signed =
          signRiskObject(
            fixture(),
            {
              key_id:
                key.keyId,

              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        expect(
          signed.integrity
            .payload_hash,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          signed.integrity
            .signature_scheme,
        ).toBe("Ed25519");

        const verification =
          verifyRiskObjectSignature(
            signed,
            {
              [key.keyId]:
                key.publicKey,
            },
          );

        expect(
          verification,
        ).toEqual({
          valid: true,
          reason: null,
        });
      },
    );

    it(
      "fails verification after payload tampering",
      () => {
        const key = keys();

        const signed =
          signRiskObject(
            fixture(),
            {
              key_id:
                key.keyId,

              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        const tampered:
          GeomacroRiskObject = {
          ...signed,

          risk: {
            ...signed.risk,
            score: 99,
          },
        };

        const verification =
          verifyRiskObjectSignature(
            tampered,
            {
              [key.keyId]:
                key.publicKey,
            },
          );

        expect(
          verification.valid,
        ).toBe(false);

        expect(
          verification.reason,
        ).toBe(
          "payload_hash_mismatch",
        );
      },
    );

    it(
      "is deterministic for identical object and key",
      () => {
        const key = keys();

        const first =
          signRiskObject(
            fixture(),
            {
              key_id:
                key.keyId,
              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        const second =
          signRiskObject(
            fixture(),
            {
              key_id:
                key.keyId,
              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        expect(
          first.integrity
            .payload_hash,
        ).toBe(
          second.integrity
            .payload_hash,
        );

        expect(
          first.integrity.signature,
        ).toBe(
          second.integrity.signature,
        );
      },
    );
  },
);
