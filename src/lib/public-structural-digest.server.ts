import {
  GEOMACRO_ACCESS_TIERS,
  GEOMACRO_CREDIT_CONTRACT_VERSION,
  GEOMACRO_CREDIT_COSTS,
} from "./commercial-access-contract";
import {
  loadStructuralContext,
  type StructuralContext,
  type StructuralObservation,
} from "./structural-context.server";
import type { AgentStructuralQuery } from "./geomacro-agent-contract";

const FREE_LIMIT =
  GEOMACRO_ACCESS_TIERS.free.structured_data
    .max_structural_observations_per_response;

function publicObservation(row: StructuralObservation) {
  return {
    dimension: row.dimension,
    metric: row.metric,
    value_numeric: row.value_numeric,
    value_text: row.value_text,
    unit: row.unit,
    country_iso3: row.country_iso3,
    partner_country_iso3: row.partner_country_iso3,
    observed_at: row.observed_at,
    published_at: row.published_at,
    source_id: row.source_id,
    source_url: row.source_url,
    quality_status: row.quality_status,
    methodology_status: row.methodology_status,
  };
}

function coverageSummary(context: StructuralContext) {
  const coverage = context.metadata.coverage;
  const dimensions = Array.from(
    new Set(coverage.map((row) => row.dimension).filter(Boolean)),
  ).sort();
  const sources = Array.from(
    new Set(coverage.map((row) => row.source_id).filter(Boolean)),
  ).sort();
  const years = coverage
    .map((row) => row.coverage_year)
    .filter((value): value is number => Number.isInteger(value));
  const latestObserved = coverage
    .map((row) => row.latest_observed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;

  return {
    dimensions,
    source_count: sources.length,
    coverage_year_min: years.length ? Math.min(...years) : null,
    coverage_year_max: years.length ? Math.max(...years) : null,
    latest_observed_at: latestObserved,
  };
}

export async function loadPublicStructuralDigest(input: AgentStructuralQuery) {
  const context = await loadStructuralContext(input.subject);
  const isCountry = input.subject.type === "country";

  return {
    status: context.status,
    methodology_status: context.methodology_status,
    subject: context.subject,
    data_format: "governed_structured_digest_v1" as const,
    observations: context.observations.slice(0, FREE_LIMIT).map(publicObservation),
    coverage_summary: coverageSummary(context),
    composition: {
      serving_layer: context.metadata.serving_layer,
      composition_method: context.metadata.composition_method,
      route_modeling_status: context.metadata.route_modeling_status,
      direct_evidence_status: context.metadata.direct_evidence_status,
    },
    note: context.note,
    limits: {
      tier: "free" as const,
      latest_snapshot_only: true,
      max_structural_observations: FREE_LIMIT,
      raw_data_included: false,
      private_warehouse_access: false,
    },
    credits: {
      contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
      nominal_cost: isCountry
        ? GEOMACRO_CREDIT_COSTS.structural_country_digest
        : GEOMACRO_CREDIT_COSTS.structural_corridor_digest,
      durable_metering_active: false,
    },
  };
}
