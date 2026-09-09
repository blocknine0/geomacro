import {
  CORRIDOR_RISK_METHOD_VERSION,
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  type GeomacroRiskObject,
} from "./risk-object-contract";

import {
  riskObjectPayloadHash,
  verifyRiskObjectSignature,
  type RiskObjectVerificationKeys,
} from "./risk-object-signing.server";

export const RISK_OBJECT_VERIFICATION_VERSION =
  "gro-verification-v1.0.0" as const;

const HEX_64 = /^[a-f0-9]{64}$/i;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

type RecordLike = Record<string, unknown>;

export type PublicRiskObjectVerificationStatus =
  | "VERIFIED"
  | "EXPIRED"
  | "INVALID";

export type PublicRiskObjectVerificationReport = {
  verification_version:
    typeof RISK_OBJECT_VERIFICATION_VERSION;

  valid: boolean;
  status: PublicRiskObjectVerificationStatus;

  cryptographic_valid: boolean;
  contract_valid: boolean;
  fresh: boolean;

  reason_codes: string[];

  checks: {
    schema_version: boolean;
    issuer: boolean;
    subject: boolean;
    methodology: boolean;
    timestamps: boolean;
    integrity_hashes_present: boolean;
    payload_hash_matches: boolean;
    signature: boolean;
    freshness: boolean;
  };

  artifact: {
    object_id: string | null;
    schema_version: string | null;
    subject: {
      type: string | null;
      id: string | null;
    };
    methodology_version: string | null;
    generated_at: string | null;
    expires_at: string | null;
    payload_hash: string | null;
    data_hash: string | null;
    calculation_hash: string | null;
    signing_key_id: string | null;
    commercial_eligibility_status: string | null;
    internal_verification_status: string | null;
  };
};

function asRecord(
  value: unknown,
): RecordLike | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as RecordLike;
}

function stringValue(
  value: unknown,
): string | null {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value.trim()
    : null;
}

function validTimestamp(
  value: string | null,
): boolean {
  return Boolean(
    value &&
      Number.isFinite(
        Date.parse(value),
      ),
  );
}

function validHash(
  value: unknown,
): boolean {
  return typeof value === "string" &&
    HEX_64.test(value);
}

function basicShape(
  input: unknown,
) {
  const object = asRecord(input);
  const subject =
    object
      ? asRecord(object.subject)
      : null;
  const integrity =
    object
      ? asRecord(object.integrity)
      : null;
  const commercialEligibility =
    object
      ? asRecord(
          object.commercial_eligibility,
        )
      : null;
  const internalVerification =
    object
      ? asRecord(object.verification)
      : null;

  return {
    object,
    subject,
    integrity,
    commercialEligibility,
    internalVerification,
  };
}

function subjectCheck(
  subject: RecordLike | null,
): boolean {
  if (!subject) return false;

  const type = stringValue(
    subject.type,
  );
  const id = stringValue(
    subject.id,
  );

  if (!id) return false;

  if (type === "country") {
    return /^[A-Z]{3}$/.test(id);
  }

  if (type === "corridor") {
    return id.length <= 256;
  }

  return false;
}

function methodologyCheck(
  subject: RecordLike | null,
  methodologyVersion: string | null,
): boolean {
  const type =
    subject
      ? stringValue(subject.type)
      : null;

  if (type === "country") {
    return methodologyVersion ===
      COUNTRY_RISK_METHOD_VERSION;
  }

  if (type === "corridor") {
    return methodologyVersion ===
      CORRIDOR_RISK_METHOD_VERSION;
  }

  return false;
}

function pushReason(
  reasons: string[],
  condition: boolean,
  reason: string,
) {
  if (!condition) {
    reasons.push(reason);
  }
}

/**
 * Verify a Geomacro Risk Object as a public trust artifact.
 *
 * This verifies current contract shape, issuer, methodology,
 * cryptographic payload integrity/signature and freshness.
 * It deliberately does not recalculate input/data/calculation hashes
 * because that requires the governed source evidence set. Those hashes
 * remain signed integrity references for later reproducibility proofs.
 */
export function verifyPublicRiskObjectArtifact(
  input: unknown,
  options?: {
    now?: Date;
    verification_keys?: RiskObjectVerificationKeys;
  },
): PublicRiskObjectVerificationReport {
  const now = options?.now ?? new Date();
  const shape = basicShape(input);

  const objectId =
    shape.object
      ? stringValue(shape.object.object_id)
      : null;
  const schemaVersion =
    shape.object
      ? stringValue(shape.object.schema_version)
      : null;
  const issuer =
    shape.object
      ? stringValue(shape.object.issuer)
      : null;
  const methodologyVersion =
    shape.object
      ? stringValue(
          shape.object.methodology_version,
        )
      : null;
  const generatedAt =
    shape.object
      ? stringValue(shape.object.generated_at)
      : null;
  const expiresAt =
    shape.object
      ? stringValue(shape.object.expires_at)
      : null;

  const subjectType =
    shape.subject
      ? stringValue(shape.subject.type)
      : null;
  const subjectId =
    shape.subject
      ? stringValue(shape.subject.id)
      : null;

  const payloadHash =
    shape.integrity
      ? stringValue(
          shape.integrity.payload_hash,
        )
      : null;
  const dataHash =
    shape.integrity
      ? stringValue(shape.integrity.data_hash)
      : null;
  const calculationHash =
    shape.integrity
      ? stringValue(
          shape.integrity.calculation_hash,
        )
      : null;
  const signingKeyId =
    shape.integrity
      ? stringValue(
          shape.integrity.signing_key_id,
        )
      : null;

  const schemaOk =
    schemaVersion === GRO_SCHEMA_VERSION;
  const issuerOk =
    issuer === "Geomacro";
  const subjectOk =
    subjectCheck(shape.subject);
  const methodologyOk =
    methodologyCheck(
      shape.subject,
      methodologyVersion,
    );

  const timestampsOk =
    validTimestamp(generatedAt) &&
    validTimestamp(expiresAt) &&
    Date.parse(generatedAt as string) <=
      Date.parse(expiresAt as string) &&
    Date.parse(generatedAt as string) <=
      now.getTime() + MAX_CLOCK_SKEW_MS;

  const integrityHashesPresent =
    Boolean(
      shape.integrity &&
        validHash(shape.integrity.input_hash) &&
        validHash(shape.integrity.data_hash) &&
        validHash(
          shape.integrity.calculation_hash,
        ) &&
        validHash(shape.integrity.payload_hash),
    );

  let payloadHashMatches = false;
  let signatureValid = false;
  let signatureReason: string | null = null;

  const minimumShapeForCrypto =
    Boolean(
      shape.object &&
        shape.subject &&
        shape.integrity &&
        objectId &&
        generatedAt &&
        expiresAt,
    );

  if (minimumShapeForCrypto) {
    try {
      const riskObject =
        input as GeomacroRiskObject;

      payloadHashMatches =
        riskObjectPayloadHash(riskObject) ===
        riskObject.integrity.payload_hash;

      const signatureCheck =
        verifyRiskObjectSignature(
          riskObject,
          options?.verification_keys,
        );

      signatureValid =
        signatureCheck.valid;
      signatureReason =
        signatureCheck.reason;
    } catch {
      payloadHashMatches = false;
      signatureValid = false;
      signatureReason =
        "verification_error";
    }
  } else {
    signatureReason =
      "malformed_risk_object";
  }

  const fresh =
    timestampsOk &&
    Date.parse(expiresAt as string) >=
      now.getTime();

  const reasons: string[] = [];

  pushReason(
    reasons,
    Boolean(shape.object && objectId),
    "malformed_risk_object",
  );
  pushReason(
    reasons,
    schemaOk,
    "unsupported_schema_version",
  );
  pushReason(
    reasons,
    issuerOk,
    "issuer_mismatch",
  );
  pushReason(
    reasons,
    subjectOk,
    "invalid_subject",
  );
  pushReason(
    reasons,
    methodologyOk,
    "methodology_mismatch",
  );
  pushReason(
    reasons,
    timestampsOk,
    "invalid_timestamps",
  );
  pushReason(
    reasons,
    integrityHashesPresent,
    "missing_or_invalid_integrity_hashes",
  );
  pushReason(
    reasons,
    payloadHashMatches,
    "payload_hash_mismatch",
  );

  if (!signatureValid) {
    reasons.push(
      signatureReason ??
        "invalid_signature",
    );
  }

  if (
    timestampsOk &&
    !fresh
  ) {
    reasons.push("artifact_expired");
  }

  const contractValid =
    Boolean(
      shape.object &&
        objectId &&
        schemaOk &&
        issuerOk &&
        subjectOk &&
        methodologyOk &&
        timestampsOk &&
        integrityHashesPresent,
    );

  const valid =
    contractValid &&
    payloadHashMatches &&
    signatureValid &&
    fresh;

  return {
    verification_version:
      RISK_OBJECT_VERIFICATION_VERSION,

    valid,
    status:
      valid
        ? "VERIFIED"
        : contractValid &&
            payloadHashMatches &&
            signatureValid &&
            !fresh
          ? "EXPIRED"
          : "INVALID",

    cryptographic_valid:
      payloadHashMatches &&
      signatureValid,
    contract_valid:
      contractValid,
    fresh,

    reason_codes:
      Array.from(
        new Set(reasons),
      ),

    checks: {
      schema_version: schemaOk,
      issuer: issuerOk,
      subject: subjectOk,
      methodology: methodologyOk,
      timestamps: timestampsOk,
      integrity_hashes_present:
        integrityHashesPresent,
      payload_hash_matches:
        payloadHashMatches,
      signature: signatureValid,
      freshness: fresh,
    },

    artifact: {
      object_id: objectId,
      schema_version: schemaVersion,
      subject: {
        type: subjectType,
        id: subjectId,
      },
      methodology_version:
        methodologyVersion,
      generated_at: generatedAt,
      expires_at: expiresAt,
      payload_hash: payloadHash,
      data_hash: dataHash,
      calculation_hash:
        calculationHash,
      signing_key_id: signingKeyId,
      commercial_eligibility_status:
        shape.commercialEligibility
          ? stringValue(
              shape.commercialEligibility.status,
            )
          : null,
      internal_verification_status:
        shape.internalVerification
          ? stringValue(
              shape.internalVerification.status,
            )
          : null,
    },
  };
}
