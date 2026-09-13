import { requireRiskSupabase } from "./risk-supabase.server";
import {
  loadStructuralContext,
  type StructuralObservation,
  type StructuralSubject,
} from "./structural-context.server";
import { loadTestnetLiveSeverity } from "./testnet-live-severity.server";
import {
  TESTNET_ASSISTANCE_BOUNDARIES,
  TESTNET_DATA_DELIVERY_VERSION,
  TESTNET_STRUCTURAL_TEST_LIMITS,
} from "./testnet-data-delivery-contract";
import type { TestnetIntelligenceRequest } from "./testnet-intelligence-contract";

function publicObservation(row: StructuralObservation) {
  return {
    observation_id: row.observation_id,
    source_id: row.source_id,
    source_record_id: row.source_record_id,
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
    parser_version: row.parser_version,
    methodology_status: row.methodology_status,
    quality_status: row.quality_status,
    normalized_hash: row.normalized_hash,
    retrieved_at: row.retrieved_at,
  };
}

function publicCoverage(row: {
  source_id: string;
  dimension: string;
  country_iso3: string;
  coverage_year: number;
  coverage_status: string;
  observation_count: number;
  latest_observed_at: string | null;
  updated_at: string;
}) {
  return {
    source_id: row.source_id,
    dimension: row.dimension,
    country_iso3: row.country_iso3,
    coverage_year: row.coverage_year,
    coverage_status: row.coverage_status,
    observation_count: row.observation_count,
    latest_observed_at: row.latest_observed_at,
    updated_at: row.updated_at,
  };
}

function isConcreteSubject(value: TestnetIntelligenceRequest["subject"]): value is StructuralSubject {
  return Boolean(value && value.type !== "global");
}

async function loadGlobalLiveSeverity() {
  const db = requireRiskSupabase();
  const result = await db
    .from("live_structured_events")
    .select("id,event_type,primary_country,countries,severity,confidence,direction,first_seen_at,last_seen_at,structure_version")
    .not("severity", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(200);

  if (result.error) throw result.error;

  const events = ((result.data ?? []) as Record<string, unknown>[])
    .map((row) => ({
      event_id: String(row.id ?? ""),
      event_type: row.event_type == null ? null : String(row.event_type),
      primary_country: row.primary_country == null ? null : String(row.primary_country).toUpperCase(),
      countries: Array.isArray(row.countries)
        ? row.countries.map(String).map((value) => value.toUpperCase()).filter((value) => /^[A-Z]{3}$/.test(value))
        : [],
      severity: Number(row.severity),
      confidence: row.confidence == null ? null : Number(row.confidence),
      direction: row.direction == null ? null : String(row.direction),
      first_seen_at: row.first_seen_at == null ? null : String(row.first_seen_at),
      last_seen_at: row.last_seen_at == null ? null : String(row.last_seen_at),
      structure_version: row.structure_version == null ? null : String(row.structure_version),
    }))
    .filter((row) => Number.isFinite(row.severity) && row.severity >= 0 && row.severity <= 100)
    .slice(0, 12);

  const severityValues = events.map((row) => row.severity);
  return {
    scope: "global" as const,
    scale: "0-100" as const,
    latest_event_severity: events[0]?.severity ?? null,
    max_recent_severity: severityValues.length ? Math.max(...severityValues) : null,
    mean_recent_severity: severityValues.length
      ? Math.round((severityValues.reduce((sum, value) => sum + value, 0) / severityValues.length) * 100) / 100
      : null,
    event_count: events.length,
    events,
  };
}

async function loadSubjectContext(subject: StructuralSubject, observationLimit: number) {
  const [context, liveSeverity] = await Promise.all([
    loadStructuralContext(subject),
    loadTestnetLiveSeverity(subject),
  ]);

  const observations = context.observations.slice(0, observationLimit).map(publicObservation);
  const coverage = context.metadata.coverage
    .slice(0, TESTNET_STRUCTURAL_TEST_LIMITS.max_evidence_references)
    .map(publicCoverage);

  return {
    payload: {
      status: context.status,
      methodology_status: context.methodology_status,
      subject: context.subject,
      observations,
      coverage,
      live_severity: liveSeverity,
      serving: {
        layer: context.metadata.serving_layer,
        warehouse_methodology_status: context.metadata.warehouse_methodology_status,
        composition_method: context.metadata.composition_method,
        route_modeling_status: context.metadata.route_modeling_status,
        direct_evidence_status: context.metadata.direct_evidence_status,
      },
    },
    observation_count: observations.length,
    evidence_reference_count: coverage.length,
  };
}

export async function loadTestnetAssistiveContext(request: TestnetIntelligenceRequest) {
  const primaryAlreadyIncludesStructural =
    request.capability.startsWith("structural_") || request.capability === "risk_gate_bundle";

  let structured_context: Record<string, unknown>;
  let live_severity: Record<string, unknown> | null = null;
  let structuralObservationCount = 0;
  let evidenceReferenceCount = 0;

  if (primaryAlreadyIncludesStructural) {
    structured_context = {
      included_in_primary_payload: true,
      observation_limit: request.capability.endsWith("_digest")
        ? TESTNET_STRUCTURAL_TEST_LIMITS.digest_structural_observations
        : TESTNET_STRUCTURAL_TEST_LIMITS.profile_structural_observations,
      evidence_reference_limit: TESTNET_STRUCTURAL_TEST_LIMITS.max_evidence_references,
    };
  } else if (isConcreteSubject(request.subject)) {
    const subjectContext = await loadSubjectContext(
      request.subject,
      TESTNET_STRUCTURAL_TEST_LIMITS.profile_structural_observations,
    );
    structured_context = subjectContext.payload;
    live_severity = subjectContext.payload.live_severity as Record<string, unknown>;
    structuralObservationCount = subjectContext.observation_count;
    evidenceReferenceCount = subjectContext.evidence_reference_count;
  } else {
    structured_context = {
      status: "PRIMARY_PAYLOAD_IS_STRUCTURED",
      note:
        request.capability === "gri_read"
          ? "The canonical GRI is the structured global context for this request."
          : "The stored Geomacro intelligence response is the structured context for this query.",
    };
    live_severity = await loadGlobalLiveSeverity();
  }

  return {
    contract_version: TESTNET_DATA_DELIVERY_VERSION,
    testing_limits: TESTNET_STRUCTURAL_TEST_LIMITS,
    assistance: TESTNET_ASSISTANCE_BOUNDARIES,
    structured_context,
    live_severity,
    supplemental_counts: {
      structural_observation_count: structuralObservationCount,
      evidence_reference_count: evidenceReferenceCount,
    },
  } as const;
}
