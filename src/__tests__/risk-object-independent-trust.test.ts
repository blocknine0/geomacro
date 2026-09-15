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
  withRiskObjectObservationTimestamp,
} from "../lib/risk-object-observation";

import {
  signRiskObject,
  verifyRiskObjectSignature,
} from "../lib/risk-object-signing.server";

import {
  publicRiskObjectJwks,
  publicRiskObjectTrustDiscovery,
} from "../lib/risk-object-trust-discovery.server";

import {
  verifyPublicRiskObjectArtifact,
} from "../lib/risk-object-verification.server";

function fixture(): GeomacroRiskObject {
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: "gro_country_USA_observation_test",
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
    methodology_version: COUNTRY_RISK_METHOD_VERSION,
    generated_at: "2026-09-15T13:20:04.000Z",
    expires_at: "2026-09-15T16:20:04.000Z",
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

function keys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  return {
    keyId: "geomacro-risk-observation-test",
    privateKey: privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    publicKey: publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

describe("independently verifiable Risk Object trust", () => {
  it("binds observed_at inside the signed canonical payload", () => {
    const key = keys();
    const observed = withRiskObjectObservationTimestamp(
      fixture(),
      "2026-09-15T13:20:00.000Z",
    );

    const signed = signRiskObject(observed, {
      key_id: key.keyId,
      private_key_pkcs8_b64: key.privateKey,
      public_key_spki_b64: key.publicKey,
    });

    expect(signed.observed_at).toBe(
      "2026-09-15T13:20:00.000Z",
    );

    expect(
      verifyRiskObjectSignature(signed, {
        [key.keyId]: key.publicKey,
      }),
    ).toEqual({ valid: true, reason: null });

    const report = verifyPublicRiskObjectArtifact(signed, {
      now: new Date("2026-09-15T14:00:00.000Z"),
      verification_keys: {
        [key.keyId]: key.publicKey,
      },
    });

    expect(report.valid).toBe(true);
    expect(report.signed_observation_present).toBe(true);
    expect(report.checks.observation_timestamp).toBe(true);
    expect(report.artifact.observed_at).toBe(
      "2026-09-15T13:20:00.000Z",
    );

    const tampered: GeomacroRiskObject = {
      ...signed,
      observed_at: "2026-09-15T13:25:00.000Z",
    };

    expect(
      verifyRiskObjectSignature(tampered, {
        [key.keyId]: key.publicKey,
      }),
    ).toEqual({ valid: false, reason: "payload_hash_mismatch" });
  });

  it("rejects an observation timestamp after generated_at", () => {
    expect(() =>
      withRiskObjectObservationTimestamp(
        fixture(),
        "2026-09-15T13:20:05.000Z",
      ),
    ).toThrow("Risk Object observed_at cannot be after generated_at");
  });

  it("publishes standard Ed25519 JWKS from the trusted verification registry", () => {
    const key = keys();
    const previousRegistry = process.env.RISK_OBJECT_VERIFY_KEYS_JSON;
    const previousKeyId = process.env.RISK_OBJECT_SIGNING_KEY_ID;
    const previousPublicKey = process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;

    try {
      delete process.env.RISK_OBJECT_SIGNING_KEY_ID;
      delete process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
      process.env.RISK_OBJECT_VERIFY_KEYS_JSON = JSON.stringify({
        [key.keyId]: {
          public_key_spki_b64: key.publicKey,
          status: "active",
          not_before: "2026-09-15T00:00:00.000Z",
          not_after: null,
        },
      });

      const jwks = publicRiskObjectJwks();
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0]).toMatchObject({
        kty: "OKP",
        crv: "Ed25519",
        kid: key.keyId,
        use: "sig",
        alg: "EdDSA",
        geomacro_status: "active",
      });
      expect(jwks.keys[0]?.x).toMatch(/^[A-Za-z0-9_-]+$/);
    } finally {
      restoreEnv("RISK_OBJECT_VERIFY_KEYS_JSON", previousRegistry);
      restoreEnv("RISK_OBJECT_SIGNING_KEY_ID", previousKeyId);
      restoreEnv("RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64", previousPublicKey);
    }
  });

  it("advertises fixed trust paths and Base Sepolia registry identity", () => {
    const discovery = publicRiskObjectTrustDiscovery("https://geomacro.live/");

    expect(discovery.jwks_uri).toBe(
      "https://geomacro.live/.well-known/jwks.json",
    );
    expect(discovery.verification_endpoint).toBe(
      "https://geomacro.live/api/risk-object-keys",
    );
    expect(discovery.signed_observation_timestamp).toBe("observed_at");
    expect(discovery.onchain_key_registries.base_sepolia).toMatchObject({
      chain_id: 84532,
      caip2: "eip155:84532",
    });
    expect(discovery.execution_authorized).toBe(false);
  });
});
