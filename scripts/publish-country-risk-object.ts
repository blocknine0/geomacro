import {
  publishCountryRiskObject,
} from "../src/lib/country-risk-publisher.server";

import {
  verifyRiskObjectSignature,
} from "../src/lib/risk-object-signing.server";

import type {
  RiskObjectDeliveryProfile,
} from "../src/lib/public-demo-risk-profile";

const rawIso3 =
  process.argv[2] ?? "";

const iso3 =
  rawIso3
    .trim()
    .toUpperCase();

const profile =
  (process.argv[3]?.trim() ||
    "CANONICAL") as RiskObjectDeliveryProfile;

if (
  profile !== "CANONICAL" &&
  profile !== "PUBLIC_DEMO" &&
  profile !== "FEDERICO_STRICT"
) {
  throw new Error(
    "Profile must be CANONICAL, PUBLIC_DEMO, or FEDERICO_STRICT",
  );
}

if (!/^[A-Z]{3}$/.test(iso3)) {
  throw new Error(
    "Usage: publish-country-risk-object.ts <ISO3>",
  );
}

const result =
  await publishCountryRiskObject({
    country_iso3: iso3,
  });

const signatureCheck =
  verifyRiskObjectSignature(
    result.object,
  );

const object =
  result.object;

console.log(
  JSON.stringify(
    {
      published:
        result.context.published,

      object_id:
        object.object_id,

      schema_version:
        object.schema_version,

      delivery_profile:
        profile,

      subject:
        object.subject,

      risk: {
        score:
          object.risk.score,

        label:
          object.risk.label,

        previous_score:
          object.risk.previous_score,

        delta:
          object.risk.delta,

        direction:
          object.risk.direction,
      },

      confidence:
        object.confidence,

      score_band:
        object.risk.score_band,

      uncertainty_interval:
        object.risk.uncertainty_interval,

      decision_readiness:
        object.decision_readiness,

      evidence_summary:
        object.evidence_summary,

      commercial_eligibility:
        object
          .commercial_eligibility,

      verification:
        object.verification,

      integrity: {
        calculation_hash:
          object.integrity
            .calculation_hash,

        payload_hash:
          object.integrity
            .payload_hash,

        canonicalization:
          object.integrity
            .canonicalization,

        signature_scheme:
          object.integrity
            .signature_scheme,

        signing_key_id:
          object.integrity
            .signing_key_id,

        signature_present:
          Boolean(
            object.integrity
              .signature,
          ),

        signature_valid:
          signatureCheck.valid,

        signature_reason:
          signatureCheck.reason,
      },

      context:
        result.context,
    },
    null,
    2,
  ),
);

if (
  !signatureCheck.valid ||
  object.schema_version !==
    "gro-1.1" ||
  !object.integrity.payload_hash ||
  !object.integrity.signature
) {
  process.exit(1);
}
