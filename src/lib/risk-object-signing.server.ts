import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";

import {
  GRO_CANONICALIZATION_VERSION,
  GRO_SCHEMA_VERSION,
  GRO_SIGNATURE_SCHEME,
  type GeomacroRiskObject,
} from "./risk-object-contract";

export type RiskObjectSigningMaterial = {
  key_id: string;
  private_key_pkcs8_b64: string;
};

export type RiskObjectVerificationKeys =
  Record<string, string>;

function canonicalizeJson(
  value: unknown,
): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const input =
      value as Record<string, unknown>;

    const output:
      Record<string, unknown> = {};

    for (
      const key of Object.keys(input).sort()
    ) {
      output[key] =
        canonicalizeJson(input[key]);
    }

    return output;
  }

  return value;
}

export function canonicalRiskObjectJson(
  value: unknown,
): string {
  return JSON.stringify(
    canonicalizeJson(value),
  );
}

function signableRiskObject(
  object: GeomacroRiskObject,
): GeomacroRiskObject {
  return {
    ...object,

    integrity: {
      ...object.integrity,

      // These two fields cannot sign/hash themselves.
      payload_hash: null,
      signature: null,
    },
  };
}

export function riskObjectPayloadHash(
  object: GeomacroRiskObject,
): string {
  const canonical =
    canonicalRiskObjectJson(
      signableRiskObject(object),
    );

  return createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex");
}

function signingMaterialFromEnv():
  RiskObjectSigningMaterial {
  const keyId =
    process.env
      .RISK_OBJECT_SIGNING_KEY_ID
      ?.trim();

  const privateKey =
    process.env
      .RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64
      ?.trim();

  if (!keyId || !privateKey) {
    throw new Error(
      "Risk Object signing key is not configured",
    );
  }

  return {
    key_id: keyId,
    private_key_pkcs8_b64:
      privateKey,
  };
}

function verificationKeysFromEnv():
  RiskObjectVerificationKeys {
  const keys:
    RiskObjectVerificationKeys = {};

  const raw =
    process.env
      .RISK_OBJECT_VERIFY_KEYS_JSON
      ?.trim();

  if (raw) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        "RISK_OBJECT_VERIFY_KEYS_JSON is not valid JSON",
      );
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error(
        "RISK_OBJECT_VERIFY_KEYS_JSON must be an object",
      );
    }

    for (
      const [keyId, publicKey] of
      Object.entries(parsed)
    ) {
      if (
        typeof publicKey !== "string" ||
        !keyId.trim() ||
        !publicKey.trim()
      ) {
        throw new Error(
          "Invalid Risk Object verification key registry",
        );
      }

      keys[keyId] =
        publicKey.trim();
    }
  }

  const currentKeyId =
    process.env
      .RISK_OBJECT_SIGNING_KEY_ID
      ?.trim();

  const currentPublicKey =
    process.env
      .RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64
      ?.trim();

  if (
    currentKeyId &&
    currentPublicKey
  ) {
    keys[currentKeyId] =
      currentPublicKey;
  }

  return keys;
}

function privateKeyFromBase64(
  value: string,
) {
  return createPrivateKey({
    key:
      Buffer.from(
        value,
        "base64",
      ),

    format: "der",
    type: "pkcs8",
  });
}

function publicKeyFromBase64(
  value: string,
) {
  return createPublicKey({
    key:
      Buffer.from(
        value,
        "base64",
      ),

    format: "der",
    type: "spki",
  });
}

export function signRiskObject(
  object: GeomacroRiskObject,
  material:
    RiskObjectSigningMaterial =
      signingMaterialFromEnv(),
): GeomacroRiskObject {
  if (
    object.schema_version !==
    GRO_SCHEMA_VERSION
  ) {
    throw new Error(
      `Cannot sign unsupported GRO schema ${object.schema_version}`,
    );
  }

  const prepared:
    GeomacroRiskObject = {
      ...object,

      integrity: {
        ...object.integrity,

        payload_hash: null,

        canonicalization:
          GRO_CANONICALIZATION_VERSION,

        signature: null,

        signature_scheme:
          GRO_SIGNATURE_SCHEME,

        signing_key_id:
          material.key_id,
      },
    };

  const canonical =
    canonicalRiskObjectJson(
      signableRiskObject(prepared),
    );

  const payloadHash =
    createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex");

  const privateKey =
    privateKeyFromBase64(
      material
        .private_key_pkcs8_b64,
    );

  const signature =
    signBytes(
      null,
      Buffer.from(
        canonical,
        "utf8",
      ),
      privateKey,
    ).toString("base64");

  const signed:
    GeomacroRiskObject = {
      ...prepared,

      integrity: {
        ...prepared.integrity,

        payload_hash:
          payloadHash,

        signature,
      },
    };

  const publicKey =
    createPublicKey(privateKey);

  const selfVerified =
    verifyBytes(
      null,
      Buffer.from(
        canonical,
        "utf8",
      ),
      publicKey,
      Buffer.from(
        signature,
        "base64",
      ),
    );

  if (!selfVerified) {
    throw new Error(
      "Risk Object signature self-verification failed",
    );
  }

  return signed;
}

export function
verifyRiskObjectSignature(
  object: GeomacroRiskObject,
  verificationKeys:
    RiskObjectVerificationKeys =
      verificationKeysFromEnv(),
): {
  valid: boolean;
  reason: string | null;
} {
  if (
    object.schema_version !==
    GRO_SCHEMA_VERSION
  ) {
    return {
      valid: false,
      reason:
        "unsupported_schema_version",
    };
  }

  const integrity =
    object.integrity;

  if (
    integrity.canonicalization !==
      GRO_CANONICALIZATION_VERSION ||
    integrity.signature_scheme !==
      GRO_SIGNATURE_SCHEME ||
    !integrity.signing_key_id ||
    !integrity.payload_hash ||
    !integrity.signature
  ) {
    return {
      valid: false,
      reason:
        "missing_or_invalid_signing_metadata",
    };
  }

  const publicKeyBase64 =
    verificationKeys[
      integrity.signing_key_id
    ];

  if (!publicKeyBase64) {
    return {
      valid: false,
      reason:
        "unknown_signing_key",
    };
  }

  const canonical =
    canonicalRiskObjectJson(
      signableRiskObject(object),
    );

  const recalculatedHash =
    createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex");

  if (
    recalculatedHash !==
    integrity.payload_hash
  ) {
    return {
      valid: false,
      reason:
        "payload_hash_mismatch",
    };
  }

  let valid = false;

  try {
    valid =
      verifyBytes(
        null,
        Buffer.from(
          canonical,
          "utf8",
        ),
        publicKeyFromBase64(
          publicKeyBase64,
        ),
        Buffer.from(
          integrity.signature,
          "base64",
        ),
      );
  } catch {
    return {
      valid: false,
      reason:
        "signature_verification_error",
    };
  }

  return {
    valid,
    reason:
      valid
        ? null
        : "invalid_signature",
  };
}
