import {
  createPrivateKey,
  createPublicKey,
} from "node:crypto";

/**
 * Production hosting may provide the current Risk Object key id and private
 * signing material without a redundant public-key secret. The public key is
 * deterministic public material, so derive it server-side when it is absent.
 *
 * If an explicit public key is configured, this helper leaves it untouched;
 * the existing signing/readiness code continues to verify that it matches the
 * private key and the verification registry. No private material is returned
 * or logged.
 */
export function ensureRiskObjectRuntimePublicKey(): string | null {
  const keyId =
    process.env.RISK_OBJECT_SIGNING_KEY_ID?.trim();
  const explicitPublic =
    process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64?.trim();

  if (!keyId) {
    return explicitPublic || null;
  }

  if (explicitPublic) {
    return explicitPublic;
  }

  const privateKeyB64 =
    process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64?.trim();

  if (!privateKeyB64) {
    return null;
  }

  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });

  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Risk Object signing private key is not Ed25519");
  }

  const publicKeyB64 = Buffer.from(
    createPublicKey(privateKey).export({
      format: "der",
      type: "spki",
    }),
  ).toString("base64");

  process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64 =
    publicKeyB64;

  return publicKeyB64;
}
