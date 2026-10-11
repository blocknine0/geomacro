import { createHash } from "node:crypto";
import type { GeomacroRiskObject } from "./risk-object-contract";
import {
  canonicalRiskObjectJson,
  type RiskObjectVerificationKeys,
} from "./risk-object-signing.server";
import { assertCommercialRiskObjectDeliverable } from "./commercial-risk-object-policy";
import { assertFedericoPublicationReady } from "./federico-publication-policy";

/**
 * Optional, PRIVATE query-time partner bridge. No Supabase/other database,
 * B2, network request, payment or partner allowance is used here.
 *
 * A caller must supply real reviewed evidence and a genuinely signed GRO.
 * This does not turn discovery results, an annual structural statistic, or an
 * issuer-calculated score into a receiver-approved signal.
 */
export type OnDemandPartnerProfile = "CANONICAL" | "FEDERICO_STRICT";

export type PreparedOnDemandPartnerArtifact = Readonly<{
  schema: "geomacro.on-demand-partner-artifact.v1";
  profile: OnDemandPartnerProfile;
  record_sha256: string;
  payload_hash: string;
  signing_key_id: string;
  subject_id: string;
  observed_at: string;
  /** Private exact canonical signed artifact; NEVER log or expose on public search. */
  signed_risk_object_json: string;
  locally_verified: true;
  deployed_registry_verified: false;
  external_partner_approved: false;
  live_review_authorized: false;
  payment_authorized: false;
  persistence_performed: false;
}>;

const PRECISE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function prepareOnDemandPartnerArtifact(
  object: GeomacroRiskObject,
  options: {
    profile: OnDemandPartnerProfile;
    now?: Date;
    verification_keys?: RiskObjectVerificationKeys;
  },
): PreparedOnDemandPartnerArtifact {
  if (!object || !options ||
      !["CANONICAL", "FEDERICO_STRICT"].includes(options.profile)) {
    throw new Error("ON_DEMAND_PARTNER_PROFILE_INVALID");
  }
  const now = options.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("ON_DEMAND_PARTNER_CLOCK_INVALID");
  }
  if (!object.observed_at || !PRECISE_TIMESTAMP.test(object.observed_at) ||
      !Number.isFinite(Date.parse(object.observed_at))) {
    throw new Error("ON_DEMAND_PARTNER_ORIGINAL_OBSERVATION_MISSING");
  }
  // Reuse the exact production GRO signing, key lifecycle and commercial gates.
  // Caller-provided verification keys MUST originate from its trusted registry.
  assertCommercialRiskObjectDeliverable(object, {
    now,
    verification_keys: options.verification_keys,
  });

  if (options.profile === "FEDERICO_STRICT") {
    if (object.subject.type !== "country" ||
        !/^[A-Z]{3}$/.test(object.subject.id) ||
        object.provenance.reproducibility?.calculation_namespace !==
          "federico_strict_evidence_v1") {
      throw new Error("ON_DEMAND_FEDERICO_PROFILE_INCOMPATIBLE");
    }
    assertFedericoPublicationReady(object);
    // The strict receiver must be able to corroborate actual original event
    // dates; last_seen_at/retrieval time is not a publisher clock substitute.
    for (const item of object.evidence) {
      const published = item.material_evidence_at;
      if (!published || !PRECISE_TIMESTAMP.test(published) ||
          !Number.isFinite(Date.parse(published)) ||
          Date.parse(published) > now.getTime() ||
          now.getTime() - Date.parse(published) > SIX_HOURS_MS) {
        throw new Error("ON_DEMAND_FEDERICO_ORIGINAL_NOT_FRESH");
      }
    }
  }
  const canonical = canonicalRiskObjectJson(object);
  const recordHash = createHash("sha256").update(canonical, "utf8").digest("hex");

  return Object.freeze({
    schema: "geomacro.on-demand-partner-artifact.v1" as const,
    profile: options.profile,
    record_sha256: recordHash,
    payload_hash: object.integrity.payload_hash!,
    signing_key_id: object.integrity.signing_key_id!,
    subject_id: object.subject.id,
    observed_at: object.observed_at,
    signed_risk_object_json: canonical,
    locally_verified: true as const,
    deployed_registry_verified: false as const,
    external_partner_approved: false as const,
    live_review_authorized: false as const,
    payment_authorized: false as const,
    persistence_performed: false as const,
  });
}

/** Produces the existing Federico envelope only; does not send /review. */
export function federicoReviewEnvelopeFromPrepared(
  prepared: PreparedOnDemandPartnerArtifact,
): { risk_object: GeomacroRiskObject; as_of: string } {
  if (prepared.profile !== "FEDERICO_STRICT" ||
      prepared.external_partner_approved !== false ||
      prepared.live_review_authorized !== false ||
      createHash("sha256").update(prepared.signed_risk_object_json, "utf8").digest("hex") !==
        prepared.record_sha256) {
    throw new Error("ON_DEMAND_FEDERICO_REVIEW_ENVELOPE_INVALID");
  }
  const parsed = JSON.parse(prepared.signed_risk_object_json) as GeomacroRiskObject;
  if (parsed.observed_at !== prepared.observed_at ||
      canonicalRiskObjectJson(parsed) !== prepared.signed_risk_object_json) {
    throw new Error("ON_DEMAND_FEDERICO_RECORD_MISMATCH");
  }
  return { risk_object: parsed, as_of: prepared.observed_at };
}
