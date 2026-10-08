import { createHash } from "node:crypto";

import {
  normalizeRiskObjectVerificationKeys,
  type PublicRiskObjectVerificationKeySet,
  type RiskObjectVerificationKeys,
} from "./risk-object-signing.server";

export const PINNED_RISK_OBJECT_PUBLIC_REGISTRY_VERSION =
  "geomacro-risk-public-registry-2026-10-08.v1" as const;

const PINNED_KEYS = [
  {
    key_id: "geomacro-risk-2026-02",
    public_key_spki_b64:
      "MCowBQYDK2VwAyEASbcPf48wkPOngubSwToXXZd2rCzRoC9n/tnpuyj25dw=",
    public_key_fingerprint_sha256:
      "526a7956d2a9ccd10b94d05fd4bc19e4464f1e431734bc60ab5b0d9c9b1ad6ec",
    status: "retired" as const,
    not_before: null,
    not_after: null,
  },
  {
    key_id: "geomacro-risk-2026-03",
    public_key_spki_b64:
      "MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k=",
    public_key_fingerprint_sha256:
      "432f35218570c80c09d56a8005390f6d3111a932ba93298f4ffd86d9896c0b90",
    status: "active" as const,
    not_before: null,
    not_after: null,
  },
] as const;

function assertPinnedRegistry() {
  const active = PINNED_KEYS.filter((key) => key.status === "active");
  if (active.length !== 1 || active[0]?.key_id !== "geomacro-risk-2026-03") {
    throw new Error("Pinned Risk Object registry must contain exactly the current active key");
  }

  for (const key of PINNED_KEYS) {
    const spki = Buffer.from(key.public_key_spki_b64, "base64");
    const fingerprint = createHash("sha256").update(spki).digest("hex");
    if (fingerprint !== key.public_key_fingerprint_sha256) {
      throw new Error(`Pinned Risk Object public-key fingerprint mismatch for ${key.key_id}`);
    }
  }
}

export function pinnedRiskObjectVerificationKeys(): RiskObjectVerificationKeys {
  assertPinnedRegistry();
  const keys: RiskObjectVerificationKeys = Object.fromEntries(
    PINNED_KEYS.map((key) => [
      key.key_id,
      {
        public_key_spki_b64: key.public_key_spki_b64,
        status: key.status,
        not_before: key.not_before,
        not_after: key.not_after,
      },
    ]),
  );
  normalizeRiskObjectVerificationKeys(keys);
  return keys;
}

export function pinnedRiskObjectVerificationKeySet(): PublicRiskObjectVerificationKeySet {
  const keys = pinnedRiskObjectVerificationKeys();
  const normalized = normalizeRiskObjectVerificationKeys(keys);
  return {
    issuer: "Geomacro",
    signature_scheme: "Ed25519",
    canonicalization: "geomacro-canonical-json-v1",
    keys: Object.values(normalized)
      .sort((a, b) => a.key_id.localeCompare(b.key_id))
      .map((key) => ({
        key_id: key.key_id,
        public_key_spki_b64: key.public_key_spki_b64,
        status: key.status,
        not_before: key.not_before,
        not_after: key.not_after,
      })),
  };
}
