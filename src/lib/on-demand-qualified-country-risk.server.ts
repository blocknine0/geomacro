import { createHash } from "node:crypto";
import { buildCountryRiskObject, type CountryRiskEventInput } from "./country-risk-engine";
import {
  applyCountryRiskCommercialEligibility,
  type StructuredEventCommercialEligibility,
} from "./country-risk-commercial-eligibility";
import { assertFedericoPublicationReady } from "./federico-publication-policy";
import { withRiskObjectObservationTimestamp } from "./risk-object-observation";
import {
  assertRiskObjectJsonKeysSafe,
  canonicalRiskObjectJson,
  signRiskObject,
  type RiskObjectSigningMaterial,
  type RiskObjectVerificationKeys,
} from "./risk-object-signing.server";
import {
  prepareOnDemandPartnerArtifact,
  type OnDemandPartnerProfile,
  type PreparedOnDemandPartnerArtifact,
} from "./on-demand-partner-artifact.server";

export type VerifiedOnDemandCategory = "geopolitics" | "macro" | "rare_earth";

/**
 * Only a trusted server-side qualification implementation may produce this
 * receipt. The caller may not pass a user-created or discovery-generated
 * "VERIFIED" flag. Each receipt is bound to the exact immutable evidence
 * snapshot via its SHA-256 fingerprint.
 */
export type VerifiedOnDemandEvidenceReceipt = Readonly<{
  schema: "geomacro.on-demand-qualified-events.v1";
  category: VerifiedOnDemandCategory;
  country_iso3: string;
  exact_evidence_sha256: string;
  event_ids: string[];
  independent_claims_verified: true;
  verified_commercial_rights: true;
  event_commercial_eligibility: StructuredEventCommercialEligibility[];
}>;

type Qualifier = (input: Readonly<{
  category: VerifiedOnDemandCategory;
  country_iso3: string;
  evidence_sha256: string;
  events: ReadonlyArray<CountryRiskEventInput>;
  now: Date;
}>) => Promise<VerifiedOnDemandEvidenceReceipt | null>;

export type OnDemandCountryScoringInput = {
  category: VerifiedOnDemandCategory;
  country_iso3: string;
  country_name?: string | null;
  events: CountryRiskEventInput[];
  profile?: OnDemandPartnerProfile;
  now?: Date;
};

export type OnDemandCountryScoringDependencies = {
  /** REQUIRED backend qualification. No default, network fetch or client assertion. */
  qualifyEvidence: Qualifier;
  signingMaterial: RiskObjectSigningMaterial;
  /** Trusted active key registry; never accept a key supplied by a public customer. */
  verificationKeys: RiskObjectVerificationKeys;
};

const NATIVE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const MAX_LIVE_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_EVENTS = 12;
const HEX64 = /^[a-f0-9]{64}$/;

function timestamp(value: unknown, clock: number): number {
  if (typeof value !== "string" || !NATIVE_TIMESTAMP.test(value))
    throw Error("ON_DEMAND_QUALIFIED_ORIGINAL_CLOCK_INVALID");
  const date = Date.parse(value);
  if (!Number.isFinite(date) || date > clock ||
      clock - date > MAX_LIVE_AGE_MS)
    throw Error("ON_DEMAND_QUALIFIED_ORIGINAL_NOT_FRESH");
  return date;
}

function validatedSnapshot(
  input: OnDemandCountryScoringInput,
  now: Date,
): { evidence: CountryRiskEventInput[]; sha256: string; eventIds: string[] } {
  if (!["geopolitics", "macro", "rare_earth"].includes(input.category) ||
      !/^[A-Z]{3}$/.test(input.country_iso3) ||
      !Array.isArray(input.events) || input.events.length < 1 ||
      input.events.length > MAX_EVENTS)
    throw Error("ON_DEMAND_QUALIFIED_EVENT_SCOPE_INVALID");
  const clock = now.getTime();
  assertRiskObjectJsonKeysSafe(input.events);
  // A canonical copy prevents the trusted qualifier from accidentally scoring
  // references mutated by an asynchronous upstream caller.
  const evidence = JSON.parse(canonicalRiskObjectJson(input.events)) as CountryRiskEventInput[];
  const eventIds = new Set<string>();
  for (const event of evidence) {
    if (!event || event.domain !== input.category ||
        typeof event.id !== "string" || !/^[a-zA-Z0-9._:-]{3,128}$/.test(event.id) ||
        eventIds.has(event.id) || event.primary_country !== input.country_iso3 ||
        !event.countries?.includes(input.country_iso3) ||
        typeof event.title !== "string" || !event.title.trim() ||
        typeof event.event_type !== "string" || !event.event_type.trim() ||
        !(Number.isFinite(event.severity) && (event.severity as number)>0 &&
          (event.severity as number)<=100) ||
        !(Number.isFinite(event.confidence) && (event.confidence as number)>0 &&
          (event.confidence as number)<=100) ||
        !Number.isFinite(event.relevance_weight) ||
        (event.relevance_weight as number)<=0 || (event.relevance_weight as number)>1 ||
        !event.structure_version?.trim() ||
        event.corroboration_status !== "CONFIRMED") {
      throw Error("ON_DEMAND_QUALIFIED_EVENT_UNVERIFIED");
    }
    const families = event.source_families ?? [];
    const ids = event.source_ids ?? [];
    if (new Set(families).size < 2 || families.some(x=>!x || !x.trim()) ||
        new Set(ids).size < 2 ||
        (event.independent_source_count ?? 0) < 2 ||
        (event.evidence_count ?? 0) < 2)
      throw Error("ON_DEMAND_QUALIFIED_INDEPENDENT_EVIDENCE_MISSING");
    const native = timestamp(event.material_evidence_at,clock);
    const first = timestamp(event.first_seen_at,clock);
    const last = timestamp(event.last_seen_at,clock);
    if (first > last || native > last)
      throw Error("ON_DEMAND_QUALIFIED_ORIGINAL_CLOCK_ORDER_INVALID");
    eventIds.add(event.id);
  }
  const canonical = canonicalRiskObjectJson(evidence);
  return {
    evidence,
    sha256:createHash("sha256").update(canonical,"utf8").digest("hex"),
    eventIds:[...eventIds].sort(),
  };
}

function assertReceipt(
  receipt: VerifiedOnDemandEvidenceReceipt | null,
  input: OnDemandCountryScoringInput,
  snapshot: ReturnType<typeof validatedSnapshot>,
): asserts receipt is VerifiedOnDemandEvidenceReceipt {
  if (!receipt || receipt.schema !== "geomacro.on-demand-qualified-events.v1" ||
      receipt.category !== input.category ||
      receipt.country_iso3 !== input.country_iso3 ||
      !HEX64.test(receipt.exact_evidence_sha256) ||
      receipt.exact_evidence_sha256 !== snapshot.sha256 ||
      receipt.independent_claims_verified !== true ||
      receipt.verified_commercial_rights !== true ||
      !Array.isArray(receipt.event_ids) ||
      JSON.stringify(receipt.event_ids) !== JSON.stringify(snapshot.eventIds) ||
      !Array.isArray(receipt.event_commercial_eligibility) ||
      receipt.event_commercial_eligibility.length !== snapshot.eventIds.length) {
    throw Error("ON_DEMAND_QUALIFICATION_NOT_VERIFIED");
  }
  const eligibilityIds=new Set<string>();
  for (const item of receipt.event_commercial_eligibility) {
    if (!item || eligibilityIds.has(item.event_id) ||
        !snapshot.eventIds.includes(item.event_id) ||
        !["VERIFIED","DERIVED_ONLY"].includes(item.status) ||
        !Array.isArray(item.reason_codes) ||
        item.reason_codes.some(reason=>typeof reason!=="string")) {
      throw Error("ON_DEMAND_QUALIFICATION_RIGHTS_NOT_VERIFIED");
    }
    eligibilityIds.add(item.event_id);
  }
}

/**
 * Private trusted-pipeline seam:
 * REAL categorized events -> independent/rights qualification -> existing
 * country scoring method -> existing commercial policy -> Ed25519 -> exact
 * canonical partner handoff. Absolutely no Supabase/B2/write/payment call.
 *
 * This MUST NOT accept a request body as evidence or use the raw discovery
 * candidates as eligible input. Until a real governed qualifier implements the
 * injected callback, the production API must continue to return no-charge 422.
 */
export async function scoreAndSignQualifiedOnDemandCountry(
  input: OnDemandCountryScoringInput,
  deps: OnDemandCountryScoringDependencies,
): Promise<PreparedOnDemandPartnerArtifact> {
  if (!deps || typeof deps.qualifyEvidence !== "function" ||
      !deps.signingMaterial || !deps.verificationKeys)
    throw Error("ON_DEMAND_TRUSTED_QUALIFIER_REQUIRED");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime()))
    throw Error("ON_DEMAND_QUALIFIED_CLOCK_INVALID");
  const snapshot=validatedSnapshot(input,now);
  const receipt=await deps.qualifyEvidence(Object.freeze({
    category:input.category,
    country_iso3:input.country_iso3,
    evidence_sha256:snapshot.sha256,
    events:snapshot.evidence,
    now:new Date(now),
  }));
  assertReceipt(receipt,input,snapshot);
  if (createHash("sha256").update(canonicalRiskObjectJson(snapshot.evidence),"utf8").digest("hex") !==
      snapshot.sha256)
    throw Error("ON_DEMAND_QUALIFIED_EVIDENCE_CHANGED");

  const scored=await buildCountryRiskObject({
    country_iso3:input.country_iso3,
    country_name:input.country_name??null,
    events:snapshot.evidence,
    as_of:now.toISOString(),
    ...(input.profile === "FEDERICO_STRICT"
      ? {calculation_namespace:"federico_strict_evidence_v1"} : {}),
  });
  // Never sign an empty, carried-forward or mis-scoped GRO even if a
  // qualifier erroneously returns a full green receipt.
  if (scored.evidence.length !== snapshot.eventIds.length ||
      scored.evidence.some(item=>!snapshot.eventIds.includes(item.event_id)) ||
      scored.evidence_summary.independent_source_count < 2)
    throw Error("ON_DEMAND_QUALIFIED_SCORING_INCOMPLETE");
  const commercial=applyCountryRiskCommercialEligibility(
    scored,receipt.event_commercial_eligibility);
  const observed=withRiskObjectObservationTimestamp(commercial,now.toISOString());
  if (observed.verification.status !== "VERIFIED" ||
      observed.commercial_eligibility.status !== "VERIFIED")
    throw Error("ON_DEMAND_QUALIFIED_COMMERCIAL_NOT_VERIFIED");
  if (input.profile === "FEDERICO_STRICT") assertFedericoPublicationReady(observed);
  const signed=signRiskObject(observed,deps.signingMaterial);
  return prepareOnDemandPartnerArtifact(signed,{
    profile:input.profile??"CANONICAL",now,
    verification_keys:deps.verificationKeys,
  });
}
