import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
  type KeyObject,
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

  /**
   * Optional operational cross-check. When supplied, the
   * public key must match the public key derived from the
   * private signing key or signing fails closed.
   */
  public_key_spki_b64?: string;

  /**
   * Optional signing-key validity window. These timestamps are
   * compared with the signed object's generated_at timestamp.
   */
  not_before?: string;
  not_after?: string;
};

export type RiskObjectVerificationKeyStatus =
  | "active"
  | "retired"
  | "revoked";

export type RiskObjectVerificationKeyRecord = {
  public_key_spki_b64: string;
  status?: RiskObjectVerificationKeyStatus;
  not_before?: string | null;
  not_after?: string | null;
};

/**
 * Backward-compatible verification-key input.
 *
 * Historical configuration used:
 *   { "key-id": "<base64-spki>" }
 *
 * Production rotation can now use:
 *   {
 *     "key-id": {
 *       "public_key_spki_b64": "<base64-spki>",
 *       "status": "retired",
 *       "not_before": "...",
 *       "not_after": "..."
 *     }
 *   }
 */
export type RiskObjectVerificationKeys =
  Record<
    string,
    string |
      RiskObjectVerificationKeyRecord
  >;

type NormalizedVerificationKeyRecord = {
  key_id: string;
  public_key_spki_b64: string;
  status: RiskObjectVerificationKeyStatus;
  not_before: string | null;
  not_after: string | null;
};

type NormalizedVerificationKeys =
  Record<
    string,
    NormalizedVerificationKeyRecord
  >;

const KEY_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

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

function validateKeyId(
  keyId: string,
): string {
  const normalized =
    keyId.trim();

  if (
    !KEY_ID_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "Risk Object key_id must be 1-128 URL/log-safe characters",
    );
  }

  return normalized;
}

function parseTimestamp(
  value: string,
  field: string,
): string {
  const timestamp =
    new Date(value);

  if (
    Number.isNaN(
      timestamp.getTime(),
    )
  ) {
    throw new Error(
      `${field} must be a valid timestamp`,
    );
  }

  return timestamp.toISOString();
}

function optionalTimestamp(
  value: unknown,
  field: string,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    throw new Error(
      `${field} must be a timestamp string`,
    );
  }

  return parseTimestamp(
    value,
    field,
  );
}

function validateWindow(
  notBefore: string | null,
  notAfter: string | null,
  fieldPrefix: string,
) {
  if (
    notBefore &&
    notAfter &&
    Date.parse(notBefore) >
      Date.parse(notAfter)
  ) {
    throw new Error(
      `${fieldPrefix} validity window is inverted`,
    );
  }
}

function decodeCanonicalBase64(
  value: string,
  field: string,
): Buffer {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > 16384 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      normalized,
    )
  ) {
    throw new Error(
      `${field} must be canonical base64`,
    );
  }

  const decoded =
    Buffer.from(
      normalized,
      "base64",
    );

  const roundTrip =
    decoded.toString("base64");

  if (
    roundTrip.replace(/=+$/u, "") !==
    normalized.replace(/=+$/u, "")
  ) {
    throw new Error(
      `${field} must be canonical base64`,
    );
  }

  return decoded;
}

function requireEd25519Key(
  key: KeyObject,
  field: string,
): KeyObject {
  if (
    key.asymmetricKeyType !==
    "ed25519"
  ) {
    throw new Error(
      `${field} must be an Ed25519 key`,
    );
  }

  return key;
}

function privateKeyFromBase64(
  value: string,
) {
  return requireEd25519Key(
    createPrivateKey({
      key:
        decodeCanonicalBase64(
          value,
          "Risk Object private key",
        ),

      format: "der",
      type: "pkcs8",
    }),
    "Risk Object private key",
  );
}

function publicKeyFromBase64(
  value: string,
) {
  return requireEd25519Key(
    createPublicKey({
      key:
        decodeCanonicalBase64(
          value,
          "Risk Object public key",
        ),

      format: "der",
      type: "spki",
    }),
    "Risk Object public key",
  );
}

function publicKeyBase64(
  key: KeyObject,
): string {
  return Buffer.from(
    key.export({
      format: "der",
      type: "spki",
    }),
  ).toString("base64");
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
    key_id:
      validateKeyId(keyId),

    private_key_pkcs8_b64:
      privateKey,

    public_key_spki_b64:
      process.env
        .RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64
        ?.trim() ||
      undefined,

    not_before:
      process.env
        .RISK_OBJECT_SIGNING_KEY_NOT_BEFORE
        ?.trim() ||
      undefined,

    not_after:
      process.env
        .RISK_OBJECT_SIGNING_KEY_NOT_AFTER
        ?.trim() ||
      undefined,
  };
}

function normalizeVerificationKeyRecord(
  keyIdRaw: string,
  value:
    string |
    RiskObjectVerificationKeyRecord,
): NormalizedVerificationKeyRecord {
  const keyId =
    validateKeyId(
      keyIdRaw,
    );

  let publicKey:
    string;

  let status:
    RiskObjectVerificationKeyStatus =
      "active";

  let notBefore:
    string | null = null;

  let notAfter:
    string | null = null;

  if (
    typeof value === "string"
  ) {
    publicKey =
      value.trim();
  } else if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    publicKey =
      value
        .public_key_spki_b64
        ?.trim();

    const suppliedStatus =
      value.status ??
      "active";

    if (
      suppliedStatus !== "active" &&
      suppliedStatus !== "retired" &&
      suppliedStatus !== "revoked"
    ) {
      throw new Error(
        `Invalid Risk Object key status for ${keyId}`,
      );
    }

    status =
      suppliedStatus;

    notBefore =
      optionalTimestamp(
        value.not_before,
        `${keyId}.not_before`,
      );

    notAfter =
      optionalTimestamp(
        value.not_after,
        `${keyId}.not_after`,
      );
  } else {
    throw new Error(
      `Invalid Risk Object verification key record for ${keyId}`,
    );
  }

  if (!publicKey) {
    throw new Error(
      `Missing public key for ${keyId}`,
    );
  }

  // Parsing here validates both DER structure and Ed25519 algorithm.
  publicKeyFromBase64(
    publicKey,
  );

  validateWindow(
    notBefore,
    notAfter,
    keyId,
  );

  return {
    key_id:
      keyId,

    public_key_spki_b64:
      publicKey,

    status,
    not_before:
      notBefore,
    not_after:
      notAfter,
  };
}

export function normalizeRiskObjectVerificationKeys(
  input:
    RiskObjectVerificationKeys,
): NormalizedVerificationKeys {
  const normalized:
    NormalizedVerificationKeys = {};

  for (
    const [keyId, value] of
    Object.entries(input)
  ) {
    const record =
      normalizeVerificationKeyRecord(
        keyId,
        value,
      );

    if (
      normalized[record.key_id]
    ) {
      throw new Error(
        `Duplicate Risk Object key_id ${record.key_id}`,
      );
    }

    normalized[record.key_id] =
      record;
  }

  return normalized;
}

export function loadRiskObjectVerificationKeysFromEnv():
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
      const [keyId, value] of
      Object.entries(parsed)
    ) {
      if (
        typeof value === "string"
      ) {
        keys[keyId] =
          value;
        continue;
      }

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        keys[keyId] =
          value as
            RiskObjectVerificationKeyRecord;
        continue;
      }

      throw new Error(
        "Invalid Risk Object verification key registry",
      );
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
    Boolean(currentKeyId) !==
    Boolean(currentPublicKey)
  ) {
    throw new Error(
      "Risk Object current signing key ID/public key must be configured together",
    );
  }

  if (
    currentKeyId &&
    currentPublicKey
  ) {
    const normalizedId =
      validateKeyId(
        currentKeyId,
      );

    const existing =
      keys[normalizedId];

    if (existing) {
      const existingRecord =
        normalizeVerificationKeyRecord(
          normalizedId,
          existing,
        );

      const currentRecord =
        normalizeVerificationKeyRecord(
          normalizedId,
          {
            public_key_spki_b64:
              currentPublicKey,
          },
        );

      if (
        existingRecord
          .public_key_spki_b64 !==
        currentRecord
          .public_key_spki_b64
      ) {
        throw new Error(
          `Risk Object key registry conflicts with current key ${normalizedId}`,
        );
      }

      // Preserve status/validity metadata from the registry. In particular,
      // never let current-key env variables silently overwrite revocation.
    } else {
      keys[normalizedId] = {
        public_key_spki_b64:
          currentPublicKey,

        status:
          "active",

        not_before:
          process.env
            .RISK_OBJECT_SIGNING_KEY_NOT_BEFORE
            ?.trim() ||
          null,

        not_after:
          process.env
            .RISK_OBJECT_SIGNING_KEY_NOT_AFTER
            ?.trim() ||
          null,
      };
    }
  }

  // Validate the complete merged registry before returning it.
  normalizeRiskObjectVerificationKeys(
    keys,
  );

  return keys;
}

function assertSigningWindow(
  object: GeomacroRiskObject,
  material:
    RiskObjectSigningMaterial,
) {
  const generatedAt =
    parseTimestamp(
      object.generated_at,
      "Risk Object generated_at",
    );

  const notBefore =
    optionalTimestamp(
      material.not_before,
      "Risk Object signing key not_before",
    );

  const notAfter =
    optionalTimestamp(
      material.not_after,
      "Risk Object signing key not_after",
    );

  validateWindow(
    notBefore,
    notAfter,
    "Risk Object signing key",
  );

  const generatedMs =
    Date.parse(generatedAt);

  if (
    notBefore &&
    generatedMs <
      Date.parse(notBefore)
  ) {
    throw new Error(
      "Risk Object signing key is not yet valid for generated_at",
    );
  }

  if (
    notAfter &&
    generatedMs >
      Date.parse(notAfter)
  ) {
    throw new Error(
      "Risk Object signing key is no longer valid for generated_at",
    );
  }
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

  const keyId =
    validateKeyId(
      material.key_id,
    );

  assertSigningWindow(
    object,
    material,
  );

  const privateKey =
    privateKeyFromBase64(
      material
        .private_key_pkcs8_b64,
    );

  const derivedPublicKey =
    createPublicKey(
      privateKey,
    );

  if (
    material.public_key_spki_b64
  ) {
    const configuredPublic =
      publicKeyBase64(
        publicKeyFromBase64(
          material
            .public_key_spki_b64,
        ),
      );

    const derivedPublic =
      publicKeyBase64(
        derivedPublicKey,
      );

    if (
      configuredPublic !==
      derivedPublic
    ) {
      throw new Error(
        "Risk Object signing private/public key mismatch",
      );
    }
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
          keyId,
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

  const selfVerified =
    verifyBytes(
      null,
      Buffer.from(
        canonical,
        "utf8",
      ),
      derivedPublicKey,
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

function keyLifecycleFailure(
  record:
    NormalizedVerificationKeyRecord,
  object:
    GeomacroRiskObject,
): string | null {
  if (
    record.status ===
    "revoked"
  ) {
    return "signing_key_revoked";
  }

  const generatedAt =
    Date.parse(
      object.generated_at,
    );

  if (
    !Number.isFinite(
      generatedAt,
    )
  ) {
    return "invalid_generated_at";
  }

  if (
    record.not_before &&
    generatedAt <
      Date.parse(
        record.not_before,
      )
  ) {
    return "signing_key_not_yet_valid";
  }

  if (
    record.not_after &&
    generatedAt >
      Date.parse(
        record.not_after,
      )
  ) {
    return "signing_key_outside_validity_window";
  }

  // Retired keys remain valid for historical objects generated within
  // their validity window. Retirement prevents new signing operationally;
  // revocation is the state that invalidates signatures.
  return null;
}

export function
verifyRiskObjectSignature(
  object: GeomacroRiskObject,
  verificationKeys:
    RiskObjectVerificationKeys =
      loadRiskObjectVerificationKeysFromEnv(),
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

  let normalizedKeys:
    NormalizedVerificationKeys;

  try {
    normalizedKeys =
      normalizeRiskObjectVerificationKeys(
        verificationKeys,
      );
  } catch {
    return {
      valid: false,
      reason:
        "verification_key_registry_error",
    };
  }

  const keyRecord =
    normalizedKeys[
      integrity.signing_key_id
    ];

  if (!keyRecord) {
    return {
      valid: false,
      reason:
        "unknown_signing_key",
    };
  }

  const lifecycleFailure =
    keyLifecycleFailure(
      keyRecord,
      object,
    );

  if (lifecycleFailure) {
    return {
      valid: false,
      reason:
        lifecycleFailure,
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
          keyRecord
            .public_key_spki_b64,
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

export type PublicRiskObjectVerificationKeySet = {
  issuer: "Geomacro";
  signature_scheme:
    typeof GRO_SIGNATURE_SCHEME;
  canonicalization:
    typeof GRO_CANONICALIZATION_VERSION;
  keys: Array<{
    key_id: string;
    public_key_spki_b64: string;
    status: RiskObjectVerificationKeyStatus;
    not_before: string | null;
    not_after: string | null;
  }>;
};

/**
 * Public, non-secret verification material suitable for customer/agent
 * signature verification and rotation/revocation awareness.
 */
export function publicRiskObjectVerificationKeySet(
  verificationKeys:
    RiskObjectVerificationKeys =
      loadRiskObjectVerificationKeysFromEnv(),
): PublicRiskObjectVerificationKeySet {
  const normalized =
    normalizeRiskObjectVerificationKeys(
      verificationKeys,
    );

  return {
    issuer: "Geomacro",
    signature_scheme:
      GRO_SIGNATURE_SCHEME,
    canonicalization:
      GRO_CANONICALIZATION_VERSION,

    keys:
      Object.values(normalized)
        .sort(
          (a, b) =>
            a.key_id.localeCompare(
              b.key_id,
            ),
        )
        .map(
          record => ({
            key_id:
              record.key_id,
            public_key_spki_b64:
              record
                .public_key_spki_b64,
            status:
              record.status,
            not_before:
              record.not_before,
            not_after:
              record.not_after,
          }),
        ),
  };
}
