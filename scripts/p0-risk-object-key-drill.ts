import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import {
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  type GeomacroRiskObject,
} from "../src/lib/risk-object-contract";
import {
  signRiskObject,
  verifyRiskObjectSignature,
} from "../src/lib/risk-object-signing.server";

function key(keyId: string) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    keyId,
    privateKey: privateKey.export({ format: "der", type: "pkcs8" }).toString("base64"),
    publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  };
}

function fixture(objectId: string): GeomacroRiskObject {
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: objectId,
    subject: { type: "country", id: "USA", name: "United States" },
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
    generated_at: "2026-09-15T00:00:00.000Z",
    expires_at: "2026-09-15T03:00:00.000Z",
    issuer: "Geomacro",
    commercial_eligibility: { status: "UNVERIFIED", reason_codes: [] },
    verification: { status: "INCOMPLETE", reason_codes: [], last_verified_at: null },
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const oldKey = key("p0-drill-old");
const newKey = key("p0-drill-new");

const oldSigned = signRiskObject(fixture("gro_p0_rotation_old"), {
  key_id: oldKey.keyId,
  private_key_pkcs8_b64: oldKey.privateKey,
  public_key_spki_b64: oldKey.publicKey,
  not_before: "2026-09-01T00:00:00.000Z",
  not_after: "2026-09-30T23:59:59.999Z",
});

const beforeRotation = verifyRiskObjectSignature(oldSigned, {
  [oldKey.keyId]: {
    public_key_spki_b64: oldKey.publicKey,
    status: "active",
    not_before: "2026-09-01T00:00:00.000Z",
    not_after: "2026-09-30T23:59:59.999Z",
  },
});
assert(beforeRotation.valid, "old active key must verify before rotation");

const rotatedRegistry = {
  [oldKey.keyId]: {
    public_key_spki_b64: oldKey.publicKey,
    status: "retired" as const,
    not_before: "2026-09-01T00:00:00.000Z",
    not_after: "2026-09-30T23:59:59.999Z",
  },
  [newKey.keyId]: {
    public_key_spki_b64: newKey.publicKey,
    status: "active" as const,
    not_before: "2026-09-15T00:00:00.000Z",
    not_after: "2026-12-31T23:59:59.999Z",
  },
};

const historicalAfterRotation = verifyRiskObjectSignature(oldSigned, rotatedRegistry);
assert(
  historicalAfterRotation.valid,
  "historical signature must remain valid when old key is normally retired",
);

const newSigned = signRiskObject(fixture("gro_p0_rotation_new"), {
  key_id: newKey.keyId,
  private_key_pkcs8_b64: newKey.privateKey,
  public_key_spki_b64: newKey.publicKey,
  not_before: "2026-09-15T00:00:00.000Z",
  not_after: "2026-12-31T23:59:59.999Z",
});
const newActive = verifyRiskObjectSignature(newSigned, rotatedRegistry);
assert(newActive.valid, "new active key must verify after rotation");

const compromisedRegistry = {
  ...rotatedRegistry,
  [oldKey.keyId]: {
    ...rotatedRegistry[oldKey.keyId],
    status: "revoked" as const,
  },
};
const oldAfterRevocation = verifyRiskObjectSignature(oldSigned, compromisedRegistry);
assert(!oldAfterRevocation.valid, "revoked key must fail closed");
assert(
  oldAfterRevocation.reason === "signing_key_revoked",
  `unexpected revoked-key reason: ${oldAfterRevocation.reason}`,
);

const tampered = structuredClone(newSigned);
tampered.risk.score = 5;
const tamperedResult = verifyRiskObjectSignature(tampered, rotatedRegistry);
assert(!tamperedResult.valid, "tampered Risk Object must fail signature verification");

const report = {
  schema_version: "geomacro-p0-risk-object-key-drill-1.0",
  generated_at: new Date().toISOString(),
  mode: "ephemeral_ci_cryptographic_lifecycle_drill",
  private_key_material_persisted: false,
  checks: {
    active_old_key_verifies: beforeRotation.valid,
    retired_old_key_preserves_historical_signature: historicalAfterRotation.valid,
    new_active_key_verifies: newActive.valid,
    revoked_old_key_fails_closed:
      !oldAfterRevocation.valid && oldAfterRevocation.reason === "signing_key_revoked",
    tampered_payload_fails_closed: !tamperedResult.valid,
  },
  execution_authorized: false,
  limitation:
    "This proves the cryptographic lifecycle code path with ephemeral CI keys. It is not evidence that a production signing key was rotated or compromised.",
};

const canonical = JSON.stringify(report.checks);
const output = {
  ...report,
  evidence_hash: createHash("sha256").update(canonical).digest("hex"),
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/p0-risk-object-key-drill.json",
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(output, null, 2));
