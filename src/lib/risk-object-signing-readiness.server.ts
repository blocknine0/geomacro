import {
  createPrivateKey,
  createPublicKey,
} from "node:crypto";

import {
  loadRiskObjectVerificationKeysFromEnv,
  normalizeRiskObjectVerificationKeys,
} from "./risk-object-signing.server";

function requiredEnv(
  name: string,
): string {
  const value =
    process.env[name]
      ?.trim();

  if (!value) {
    throw new Error(
      `${name} is not configured`,
    );
  }

  return value;
}

function spkiBase64FromPrivate(
  privateKeyB64: string,
): string {
  const privateKey =
    createPrivateKey({
      key:
        Buffer.from(
          privateKeyB64,
          "base64",
        ),
      format: "der",
      type: "pkcs8",
    });

  if (
    privateKey.asymmetricKeyType !==
    "ed25519"
  ) {
    throw new Error(
      "Risk Object signing private key is not Ed25519",
    );
  }

  const publicKey =
    createPublicKey(
      privateKey,
    );

  return Buffer.from(
    publicKey.export({
      format: "der",
      type: "spki",
    }),
  ).toString("base64");
}

function normalizePublicKey(
  value: string,
): string {
  const key =
    createPublicKey({
      key:
        Buffer.from(
          value,
          "base64",
        ),
      format: "der",
      type: "spki",
    });

  if (
    key.asymmetricKeyType !==
    "ed25519"
  ) {
    throw new Error(
      "Risk Object signing public key is not Ed25519",
    );
  }

  return Buffer.from(
    key.export({
      format: "der",
      type: "spki",
    }),
  ).toString("base64");
}

export type RiskObjectSigningReadiness = {
  ready: true;
  key_id: string;
  status: "active";
  not_before: string | null;
  not_after: string | null;
};

/**
 * Validate the complete NEW-signature configuration without exposing or
 * returning private material.
 *
 * This is deliberately stricter than historical verification:
 * retired keys may verify historical objects, but only an active key may
 * satisfy current signing readiness.
 */
export function validateRiskObjectSigningReadiness(
  now = new Date(),
): RiskObjectSigningReadiness {
  if (
    !Number.isFinite(
      now.getTime(),
    )
  ) {
    throw new Error(
      "Invalid readiness clock",
    );
  }

  const keyId =
    requiredEnv(
      "RISK_OBJECT_SIGNING_KEY_ID",
    );

  const privateKey =
    requiredEnv(
      "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",
    );

  const publicKey =
    requiredEnv(
      "RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",
    );

  const derivedPublic =
    spkiBase64FromPrivate(
      privateKey,
    );

  const configuredPublic =
    normalizePublicKey(
      publicKey,
    );

  if (
    derivedPublic !==
    configuredPublic
  ) {
    throw new Error(
      "Risk Object signing private/public key mismatch",
    );
  }

  const registry =
    normalizeRiskObjectVerificationKeys(
      loadRiskObjectVerificationKeysFromEnv(),
    );

  const record =
    registry[keyId];

  if (!record) {
    throw new Error(
      "Current Risk Object signing key is missing from verification registry",
    );
  }

  if (
    record
      .public_key_spki_b64 !==
    configuredPublic
  ) {
    throw new Error(
      "Current Risk Object registry public key mismatch",
    );
  }

  if (
    record.status !==
    "active"
  ) {
    throw new Error(
      "Current Risk Object signing key is not active",
    );
  }

  const nowMs =
    now.getTime();

  if (
    record.not_before &&
    nowMs <
      Date.parse(
        record.not_before,
      )
  ) {
    throw new Error(
      "Current Risk Object signing key is not yet valid",
    );
  }

  if (
    record.not_after &&
    nowMs >
      Date.parse(
        record.not_after,
      )
  ) {
    throw new Error(
      "Current Risk Object signing key has expired",
    );
  }

  return {
    ready: true,
    key_id:
      keyId,
    status: "active",
    not_before:
      record.not_before,
    not_after:
      record.not_after,
  };
}
