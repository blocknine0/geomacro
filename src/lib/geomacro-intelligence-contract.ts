import { createHash } from "node:crypto";

export const GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA =
  "geomacro.adaptive-intelligence-response.v1" as const;

export const GEOMACRO_INTELLIGENCE_CONTRACT_VERSION =
  "geomacro.intelligence-contract.v1" as const;

export const GEOMACRO_INTELLIGENCE_PRODUCT_ID =
  "geomacro_adaptive_risk_intelligence_v1" as const;

export const GEOMACRO_INTELLIGENCE_PRICE_USDC =
  "0.05" as const;

export const GEOMACRO_INTELLIGENCE_LAUNCH_DELIVERY_TARGET =
  10_000 as const;

export type IntelligenceDirection =
  | "escalating"
  | "cooling"
  | "steady"
  | "unknown";

export type IntelligenceSubject =
  | {
      type: "country";
      country_iso3: string;
    }
  | {
      type: "corridor";
      origin_country_iso3: string;
      destination_country_iso3: string;
    };

export type PublicStructuralObservation = {
  observation_id: string;
  dimension: string;
  country_iso3: string | null;
  partner_country_iso3: string | null;
  observed_at: string | null;
  published_at: string | null;
  metric: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  event_type: string | null;
  signal_type: string | null;
  retrieved_at: string | null;
};

export type PublicStructuralCoverage = {
  dimension: string;
  country_iso3: string;
  coverage_year: number;
  coverage_status: string;
  observation_count: number;
  latest_observed_at: string | null;
  updated_at: string;
};

export type PublicStructuralDevelopment = {
  event_id: string;
  event_version: string;
  event_type: string | null;
  families: string[];
  affected_countries: string[];
  materiality: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number | null;
  direction: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  last_observed_at: string;
  evidence_count: number;
  corroboration_count: number;
  structure_version: string;
  classification_version: string | null;
  delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY";
};

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Runtime delivery contract for the paid adaptive intelligence product.
 *
 * This validator intentionally checks the commercial boundary and structural
 * machine contract, not every optional research field. It runs before any
 * provider settlement so a malformed product can never become a successful
 * paid delivery.
 */
export function assertGeomacroIntelligenceResponseContract(payload: unknown): asserts payload is Record<string, unknown> {
  if (!isRecord(payload)) throw new Error("INTELLIGENCE_RESPONSE_NOT_OBJECT");
  if (payload.schema_version !== GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA) {
    throw new Error("INTELLIGENCE_RESPONSE_SCHEMA_VERSION_MISMATCH");
  }
  if (payload.product !== GEOMACRO_INTELLIGENCE_PRODUCT_ID) {
    throw new Error("INTELLIGENCE_RESPONSE_PRODUCT_MISMATCH");
  }
  if (typeof payload.request_id !== "string" || payload.request_id.length < 8) {
    throw new Error("INTELLIGENCE_RESPONSE_REQUEST_ID_MISSING");
  }
  if (!isSha256(payload.query_plan_hash)) {
    throw new Error("INTELLIGENCE_RESPONSE_QUERY_PLAN_HASH_INVALID");
  }
  if (!Array.isArray(payload.subjects) || payload.subjects.length < 1 || payload.subjects.length > 25) {
    throw new Error("INTELLIGENCE_RESPONSE_SUBJECTS_INVALID");
  }

  for (const field of [
    "question_interpretation",
    "analysis",
    "structural",
    "hot_topics",
    "risk_gate",
    "signed_risk_objects",
    "gri_context",
    "current_state",
    "answer",
    "methodology",
    "limitations",
  ]) {
    if (field === "gri_context" && payload[field] === null) continue;
    if (!isRecord(payload[field]) && !Array.isArray(payload[field])) {
      throw new Error(`INTELLIGENCE_RESPONSE_FIELD_INVALID:${field}`);
    }
  }

  if (payload.execution_authorized !== false) {
    throw new Error("INTELLIGENCE_RESPONSE_EXECUTION_BOUNDARY_VIOLATION");
  }
  if (!isSha256(payload.delivered_product_hash)) {
    throw new Error("INTELLIGENCE_RESPONSE_PRODUCT_HASH_INVALID");
  }
  const { delivered_product_hash: deliveredProductHash, ...responseWithoutProductHash } = payload;
  if (computeGeomacroIntelligenceProductHash(responseWithoutProductHash) !== deliveredProductHash) {
    throw new Error("INTELLIGENCE_RESPONSE_PRODUCT_HASH_MISMATCH");
  }

  if (!Array.isArray(payload.risk_gate)) throw new Error("INTELLIGENCE_RESPONSE_RISK_GATE_INVALID");
  for (const row of payload.risk_gate) {
    if (!isRecord(row)) throw new Error("INTELLIGENCE_RESPONSE_RISK_GATE_ROW_INVALID");
    const result = row.result;
    if (!isRecord(result)) throw new Error("INTELLIGENCE_RESPONSE_RISK_GATE_RESULT_MISSING");
    const context = result.context;
    const response = result.response;
    if (isRecord(context) && context.execution_authorized !== false) {
      throw new Error("INTELLIGENCE_RESPONSE_RISK_GATE_CONTEXT_EXECUTION_VIOLATION");
    }
    if (isRecord(response) && response.execution_authorized !== false) {
      throw new Error("INTELLIGENCE_RESPONSE_RISK_GATE_RESPONSE_EXECUTION_VIOLATION");
    }
  }

  if (!Array.isArray(payload.signed_risk_objects)) {
    throw new Error("INTELLIGENCE_RESPONSE_SIGNED_OBJECTS_INVALID");
  }
  for (const row of payload.signed_risk_objects) {
    if (!isRecord(row)) throw new Error("INTELLIGENCE_RESPONSE_SIGNED_OBJECT_ROW_INVALID");
    if (!isRecord(row.object)) throw new Error("INTELLIGENCE_RESPONSE_SIGNED_OBJECT_ATTESTATION_MISSING");
    const object = row.object;
    if (typeof object.risk_object_id !== "string" || object.risk_object_id.length < 1) {
      throw new Error("INTELLIGENCE_RESPONSE_RISK_OBJECT_ID_MISSING");
    }
    if (!isRecord(object.verification) || object.verification.status !== "VERIFIED") {
      throw new Error("INTELLIGENCE_RESPONSE_RISK_OBJECT_VERIFICATION_INVALID");
    }
    if (object.delivery_boundary !== "SIGNED_RISK_OBJECT_ATTESTATION_ONLY") {
      throw new Error("INTELLIGENCE_RESPONSE_RISK_OBJECT_DELIVERY_BOUNDARY_INVALID");
    }
    if (!isRecord(object.integrity) || !isSha256(object.integrity.payload_hash)) {
      throw new Error("INTELLIGENCE_RESPONSE_RISK_OBJECT_PAYLOAD_HASH_INVALID");
    }
  }

  if (!isRecord(payload.limitations) || payload.limitations.execution_authorized !== false) {
    throw new Error("INTELLIGENCE_RESPONSE_LIMITATIONS_EXECUTION_BOUNDARY_INVALID");
  }
  if (!isRecord(payload.methodology) || payload.methodology.response_schema_version !== GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA) {
    throw new Error("INTELLIGENCE_RESPONSE_METHODOLOGY_CONTRACT_INVALID");
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function sha256(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function computeGeomacroIntelligenceProductHash(
  payloadWithoutProductHash: unknown,
) {
  return sha256(payloadWithoutProductHash);
}

function ageSeconds(value: string | null, asOf: string) {
  if (!value) return null;
  const observed = Date.parse(value);
  const reference = Date.parse(asOf);
  if (!Number.isFinite(observed) || !Number.isFinite(reference)) return null;
  return Math.max(0, Math.floor((reference - observed) / 1000));
}

function freshnessStatus(age: number | null) {
  if (age === null) return "UNKNOWN" as const;
  if (age <= 86_400) return "CURRENT" as const;
  if (age <= 7 * 86_400) return "AGING" as const;
  return "STALE" as const;
}

/**
 * Public structural observations deliberately exclude source identity,
 * source URLs, provenance blobs and raw article material.
 */
export function publicStructuralObservation(
  row: import("./structural-context.server").StructuralObservation,
  asOf: string,
): PublicStructuralObservation & {
  freshness: {
    age_seconds: number | null;
    status: "CURRENT" | "AGING" | "STALE" | "UNKNOWN";
  };
} {
  const observationTimestamp =
    row.observed_at ?? row.published_at ?? row.retrieved_at;
  const age = ageSeconds(observationTimestamp, asOf);
  return {
    observation_id: row.observation_id,
    dimension: row.dimension,
    country_iso3: row.country_iso3,
    partner_country_iso3: row.partner_country_iso3,
    observed_at: row.observed_at,
    published_at: row.published_at,
    metric: row.metric,
    value_numeric: row.value_numeric,
    value_text: row.value_text,
    unit: row.unit,
    event_type: row.event_type,
    signal_type: row.signal_type,
    retrieved_at: row.retrieved_at,
    freshness: {
      age_seconds: age,
      status: freshnessStatus(age),
    },
  };
}

export function publicStructuralCoverage(row: {
  dimension: string;
  country_iso3: string;
  coverage_year: number;
  coverage_status: string;
  observation_count: number;
  latest_observed_at: string | null;
  updated_at: string;
}): PublicStructuralCoverage {
  return {
    dimension: row.dimension,
    country_iso3: row.country_iso3,
    coverage_year: row.coverage_year,
    coverage_status: row.coverage_status,
    observation_count: row.observation_count,
    latest_observed_at: row.latest_observed_at,
    updated_at: row.updated_at,
  };
}

function materiality(severity: number | null): PublicStructuralDevelopment["materiality"] {
  const value = typeof severity === "number" && Number.isFinite(severity) ? severity : 0;
  if (value >= 80) return "CRITICAL";
  if (value >= 65) return "HIGH";
  if (value >= 40) return "MEDIUM";
  return "LOW";
}

/**
 * One canonical live event may have many upstream observations. The event
 * identity remains stable while this derived version changes when its
 * material structured interpretation changes. A passive last-seen timestamp
 * refresh does not create a new commercial event version.
 */
export function structuralEventVersion(event: {
  event_id: string;
  story_key: string;
  event_type: string | null;
  primary_country: string | null;
  countries: string[];
  severity: number | null;
  confidence: number | null;
  direction: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  structure_version: string;
  classification_version: string | null;
}) {
  return `sev_${sha256({
    event_id: event.event_id,
    story_key: event.story_key,
    event_type: event.event_type,
    primary_country: event.primary_country,
    countries: [...event.countries].sort(),
    severity: event.severity,
    confidence: event.confidence,
    direction: event.direction,
    status: event.status,
    first_seen_at: event.first_seen_at,
    structure_version: event.structure_version,
    classification_version: event.classification_version,
  }).slice(0, 24)}`;
}

export function publicStructuralDevelopment(event: {
  event_id: string;
  story_key: string;
  event_type: string | null;
  families: string[];
  primary_country: string | null;
  countries: string[];
  severity: number | null;
  confidence: number | null;
  direction: string | null;
  status: string;
  first_seen_at: string;
  last_seen_at: string;
  last_observed_at: string;
  evidence_count: number;
  independent_source_count: number;
  structure_version: string;
  classification_version: string | null;
}): PublicStructuralDevelopment {
  const countries = new Set<string>();
  if (event.primary_country && /^[A-Z]{3}$/.test(event.primary_country)) {
    countries.add(event.primary_country);
  }
  for (const country of event.countries) {
    if (/^[A-Z]{3}$/.test(country)) countries.add(country);
  }

  return {
    event_id: event.event_id,
    event_version: structuralEventVersion(event),
    event_type: event.event_type,
    families: [...new Set(event.families)].sort(),
    affected_countries: [...countries].sort(),
    materiality: materiality(event.severity),
    confidence: event.confidence,
    direction: event.direction,
    status: event.status,
    first_seen_at: event.first_seen_at,
    last_seen_at: event.last_seen_at,
    last_observed_at: event.last_observed_at,
    evidence_count: Math.max(0, event.evidence_count),
    corroboration_count: Math.max(0, event.independent_source_count),
    structure_version: event.structure_version,
    classification_version: event.classification_version,
    delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY",
  };
}

export function intelligenceStateVersion(input: {
  subject: IntelligenceSubject;
  as_of: string;
  risk_calculation_hash?: string | null;
  structural_observation_hashes: string[];
  structural_coverage: Array<{
    dimension: string;
    country_iso3: string;
    coverage_year: number;
    coverage_status: string;
    latest_observed_at: string | null;
  }>;
  event_versions: string[];
}) {
  return `gstate_${sha256({
    schema_version: GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
    subject: input.subject,
    risk_calculation_hash: input.risk_calculation_hash ?? null,
    structural_observation_hashes: [...input.structural_observation_hashes].sort(),
    structural_coverage: input.structural_coverage
      .map((row) => ({
        dimension: row.dimension,
        country_iso3: row.country_iso3,
        coverage_year: row.coverage_year,
        coverage_status: row.coverage_status,
        latest_observed_at: row.latest_observed_at,
      }))
      .sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
    event_versions: [...input.event_versions].sort(),
  }).slice(0, 32)}`;
}
