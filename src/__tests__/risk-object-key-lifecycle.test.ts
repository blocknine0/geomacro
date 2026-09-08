import {
  generateKeyPairSync,
} from "node:crypto";

import {
  afterEach,
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
  loadRiskObjectVerificationKeysFromEnv,
  publicRiskObjectVerificationKeySet,
  signRiskObject,
  verifyRiskObjectSignature,
} from "../lib/risk-object-signing.server";

function fixture():
  GeomacroRiskObject {
  return {
    schema_version:
      GRO_SCHEMA_VERSION,

    object_id:
      "gro_country_USA_key_lifecycle",

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
      reason_codes: [],
    },

    verification: {
      status: "INCOMPLETE",
      reason_codes: [],
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

function ed25519Key(
  keyId = "risk-key-2026-01",
) {
  const {
    privateKey,
    publicKey,
  } =
    generateKeyPairSync(
      "ed25519",
    );

  return {
    keyId,
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

const ENV_KEYS = [
  "RISK_OBJECT_SIGNING_KEY_ID",
  "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",
  "RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",
  "RISK_OBJECT_SIGNING_KEY_NOT_BEFORE",
  "RISK_OBJECT_SIGNING_KEY_NOT_AFTER",
  "RISK_OBJECT_VERIFY_KEYS_JSON",
] as const;

const ORIGINAL_ENV =
  Object.fromEntries(
    ENV_KEYS.map(
      key => [
        key,
        process.env[key],
      ],
    ),
  );

afterEach(
  () => {
    for (
      const key of ENV_KEYS
    ) {
      const original =
        ORIGINAL_ENV[key];

      if (
        original === undefined
      ) {
        delete process.env[key];
      } else {
        process.env[key] =
          original;
      }
    }
  },
);

describe(
  "Risk Object signing-key lifecycle",
  () => {
    it(
      "keeps historical signatures valid after normal key retirement",
      () => {
        const key =
          ed25519Key();

        const signed =
          signRiskObject(
            fixture(),
            {
              key_id: key.keyId,
              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        expect(
          verifyRiskObjectSignature(
            signed,
            {
              [key.keyId]: {
                public_key_spki_b64:
                  key.publicKey,
                status: "retired",
                not_before:
                  "2026-09-01T00:00:00.000Z",
                not_after:
                  "2026-09-08T00:00:00.000Z",
              },
            },
          ),
        ).toEqual({
          valid: true,
          reason: null,
        });
      },
    );

    it(
      "fails closed when a signing key is revoked",
      () => {
        const key =
          ed25519Key();

        const signed =
          signRiskObject(
            fixture(),
            {
              key_id: key.keyId,
              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        expect(
          verifyRiskObjectSignature(
            signed,
            {
              [key.keyId]: {
                public_key_spki_b64:
                  key.publicKey,
                status: "revoked",
              },
            },
          ),
        ).toEqual({
          valid: false,
          reason:
            "signing_key_revoked",
        });
      },
    );

    it(
      "rejects signatures created outside the registered key validity window",
      () => {
        const key =
          ed25519Key();

        const signed =
          signRiskObject(
            fixture(),
            {
              key_id: key.keyId,
              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        expect(
          verifyRiskObjectSignature(
            signed,
            {
              [key.keyId]: {
                public_key_spki_b64:
                  key.publicKey,
                status: "retired",
                not_before:
                  "2026-09-08T00:00:00.000Z",
              },
            },
          ),
        ).toEqual({
          valid: false,
          reason:
            "signing_key_not_yet_valid",
        });
      },
    );

    it(
      "refuses to sign when configured private/public material does not match",
      () => {
        const first =
          ed25519Key(
            "risk-key-a",
          );
        const second =
          ed25519Key(
            "risk-key-b",
          );

        expect(
          () =>
            signRiskObject(
              fixture(),
              {
                key_id:
                  first.keyId,
                private_key_pkcs8_b64:
                  first.privateKey,
                public_key_spki_b64:
                  second.publicKey,
              },
            ),
        ).toThrow(
          "Risk Object signing private/public key mismatch",
        );
      },
    );

    it(
      "refuses to sign outside the signing material validity window",
      () => {
        const key =
          ed25519Key();

        expect(
          () =>
            signRiskObject(
              fixture(),
              {
                key_id:
                  key.keyId,
                private_key_pkcs8_b64:
                  key.privateKey,
                not_before:
                  "2026-09-08T00:00:00.000Z",
              },
            ),
        ).toThrow(
          "Risk Object signing key is not yet valid for generated_at",
        );
      },
    );

    it(
      "does not let current-key env settings overwrite a registry revocation",
      () => {
        const key =
          ed25519Key();

        process.env
          .RISK_OBJECT_SIGNING_KEY_ID =
          key.keyId;
        process.env
          .RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64 =
          key.publicKey;
        process.env
          .RISK_OBJECT_VERIFY_KEYS_JSON =
          JSON.stringify({
            [key.keyId]: {
              public_key_spki_b64:
                key.publicKey,
              status: "revoked",
            },
          });

        const loaded =
          loadRiskObjectVerificationKeysFromEnv();

        const publicSet =
          publicRiskObjectVerificationKeySet(
            loaded,
          );

        expect(
          publicSet.keys,
        ).toHaveLength(1);

        expect(
          publicSet.keys[0]
            .status,
        ).toBe("revoked");
      },
    );

    it(
      "rejects an environment registry that conflicts with the current public key",
      () => {
        const first =
          ed25519Key(
            "risk-key-current",
          );
        const second =
          ed25519Key(
            "risk-key-other",
          );

        process.env
          .RISK_OBJECT_SIGNING_KEY_ID =
          first.keyId;
        process.env
          .RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64 =
          first.publicKey;
        process.env
          .RISK_OBJECT_VERIFY_KEYS_JSON =
          JSON.stringify({
            [first.keyId]:
              second.publicKey,
          });

        expect(
          () =>
            loadRiskObjectVerificationKeysFromEnv(),
        ).toThrow(
          "Risk Object key registry conflicts with current key",
        );
      },
    );

    it(
      "rejects non-Ed25519 verification material",
      () => {
        const key =
          ed25519Key();

        const signed =
          signRiskObject(
            fixture(),
            {
              key_id: key.keyId,
              private_key_pkcs8_b64:
                key.privateKey,
            },
          );

        const {
          publicKey,
        } =
          generateKeyPairSync(
            "rsa",
            {
              modulusLength: 2048,
            },
          );

        const rsaPublic =
          publicKey
            .export({
              format: "der",
              type: "spki",
            })
            .toString("base64");

        expect(
          verifyRiskObjectSignature(
            signed,
            {
              [key.keyId]:
                rsaPublic,
            },
          ),
        ).toEqual({
          valid: false,
          reason:
            "verification_key_registry_error",
        });
      },
    );
  },
);
