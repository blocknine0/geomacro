import type {
  PublicRiskObjectVerificationKeySet,
  RiskObjectVerificationKeys,
} from "./risk-object-signing.server";

export const PINNED_RISK_OBJECT_PUBLIC_REGISTRY_VERSION =
  "geomacro-risk-public-registry-2026-10-08.v1" as const;

const PINNED_KEYS = [
  {
    key_id: "geomacro-risk-2026-02",
    public_key_spki_b64:
      "MCowBQYDK2VwAyEASbcPf48wkPOngubSwToXXZd2rCzRoC9n/tnpuyj25dw=",
    status: "retired" as const,
    not_before: null,
    not_after: null,
  },
  {
    key_id: "geomacro-risk-2026-03",
    public_key_spki_b64:
      "MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k=",
    status: "active" as const,
    not_before: null,
    not_after: null,
  },
] as const;

export function pinnedRiskObjectVerificationKeys(): RiskObjectVerificationKeys {
  return Object.fromEntries(
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
}

export function pinnedRiskObjectVerificationKeySet(): PublicRiskObjectVerificationKeySet {
  return {
    issuer: "Geomacro",
    signature_scheme: "Ed25519",
    canonicalization: "geomacro-canonical-json-v1",
    keys: PINNED_KEYS.map((key) => ({ ...key })),
  };
}
