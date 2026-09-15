import { createPublicKey } from "node:crypto";

import {
  GRO_CANONICALIZATION_VERSION,
  GRO_SCHEMA_VERSION,
  GRO_SIGNATURE_SCHEME,
} from "./risk-object-contract";

import {
  publicRiskObjectVerificationKeySet,
} from "./risk-object-signing.server";

export const RISK_OBJECT_JWKS_PATH = "/.well-known/jwks.json" as const;
export const RISK_OBJECT_TRUST_PATH = "/.well-known/geomacro-risk-keys.json" as const;
export const RISK_OBJECT_VERIFICATION_PATH = "/api/risk-object-keys" as const;
export const RISK_OBJECT_TRUST_VERSION = "geomacro-risk-trust-v1" as const;

export type PublicRiskObjectJwk = {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  use: "sig";
  alg: "EdDSA";
  geomacro_status: "active" | "retired" | "revoked";
  geomacro_not_before: string | null;
  geomacro_not_after: string | null;
};

function spkiBase64ToJwk(input: {
  key_id: string;
  public_key_spki_b64: string;
  status: "active" | "retired" | "revoked";
  not_before: string | null;
  not_after: string | null;
}): PublicRiskObjectJwk {
  const publicKey = createPublicKey({
    key: Buffer.from(input.public_key_spki_b64, "base64"),
    format: "der",
    type: "spki",
  });

  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Risk Object verification key must be Ed25519");
  }

  const exported = publicKey.export({
    format: "jwk",
  }) as {
    kty?: string;
    crv?: string;
    x?: string;
  };

  if (
    exported.kty !== "OKP" ||
    exported.crv !== "Ed25519" ||
    typeof exported.x !== "string" ||
    !exported.x
  ) {
    throw new Error("Risk Object verification key could not be exported as Ed25519 JWK");
  }

  return {
    kty: "OKP",
    crv: "Ed25519",
    x: exported.x,
    kid: input.key_id,
    use: "sig",
    alg: "EdDSA",
    geomacro_status: input.status,
    geomacro_not_before: input.not_before,
    geomacro_not_after: input.not_after,
  };
}

export function publicRiskObjectJwks() {
  const keySet = publicRiskObjectVerificationKeySet();

  return {
    keys: keySet.keys.map(spkiBase64ToJwk),
  };
}

function normalizedRegistryAddress(value: string | undefined) {
  const candidate = value?.trim() ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(candidate) ? candidate : null;
}

export function publicRiskObjectTrustDiscovery(origin = "https://geomacro.live") {
  const normalizedOrigin = origin.replace(/\/$/u, "");
  const baseSepoliaRegistry = normalizedRegistryAddress(
    process.env.RISK_OBJECT_KEY_REGISTRY_BASE_SEPOLIA,
  );
  const arcTestnetRegistry = normalizedRegistryAddress(
    process.env.RISK_OBJECT_KEY_REGISTRY_ARC_TESTNET,
  );

  return {
    issuer: "Geomacro" as const,
    trust_version: RISK_OBJECT_TRUST_VERSION,
    risk_object_schema: GRO_SCHEMA_VERSION,
    signature_scheme: GRO_SIGNATURE_SCHEME,
    canonicalization: GRO_CANONICALIZATION_VERSION,
    jwks_uri: `${normalizedOrigin}${RISK_OBJECT_JWKS_PATH}`,
    verification_endpoint: `${normalizedOrigin}${RISK_OBJECT_VERIFICATION_PATH}`,
    signed_observation_timestamp: "observed_at" as const,
    onchain_key_registries: {
      base_sepolia: {
        chain_id: 84532,
        caip2: "eip155:84532",
        address: baseSepoliaRegistry,
        status: baseSepoliaRegistry ? "configured" : "not_configured",
      },
      arc_testnet: {
        chain_id: 5042002,
        caip2: "eip155:5042002",
        address: arcTestnetRegistry,
        status: arcTestnetRegistry ? "configured" : "not_configured",
      },
    },
    execution_authorized: false as const,
  };
}
