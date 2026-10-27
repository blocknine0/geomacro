import { country195ByIso3 } from "./canonical-country-registry-195";

export const TEMPORAL_CORRIDOR_EVIDENCE_VERSION =
  "geomacro.temporal-corridor-evidence.v1" as const;

export type VerifiedTimedMetric = Readonly<{
  country_iso3: string;
  dimension: string;
  metric: string;
  unit: string;
  numeric_value: number;
  reference_period_start: string;
  reference_period_end: string;
  reference_period_granularity: "day" | "month" | "quarter" | "year";
  /** Admission must verify this against the actual underlying source proof. */
  qualified_state: "VERIFIED";
  /** Private hashed/traced observation identity. */
  evidence_hash: string;
}>;

const SHA = /^[a-f0-9]{64}$/u;
function time(s: unknown) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(s))
    return NaN;
  return Date.parse(s);
}
function assertMetric(m: VerifiedTimedMetric): void {
  if (!m || !country195ByIso3(m.country_iso3) || !SHA.test(m.evidence_hash) ||
      m.qualified_state !== "VERIFIED" || !m.dimension?.trim() || !m.metric?.trim() ||
      !m.unit?.trim() || !Number.isFinite(m.numeric_value) ||
      !["day","month","quarter","year"].includes(m.reference_period_granularity) ||
      !Number.isFinite(time(m.reference_period_start)) ||
      !Number.isFinite(time(m.reference_period_end)) ||
      time(m.reference_period_start) > time(m.reference_period_end))
    throw Error("TIMED_METRIC_UNQUALIFIED_OR_INVALID");
}
function assertCompatible(a: VerifiedTimedMetric, b: VerifiedTimedMetric) {
  assertMetric(a); assertMetric(b);
  if (a.dimension !== b.dimension || a.metric !== b.metric ||
      a.unit !== b.unit || a.reference_period_granularity !== b.reference_period_granularity)
    throw Error("TEMPORAL_METRIC_UNIT_OR_DIMENSION_MISMATCH");
}
function rounded(n: number) {
  if (!Number.isFinite(n)) throw Error("TEMPORAL_NONFINITE_DELTA");
  return Number(n.toPrecision(12));
}
/** Only exact like-for-like, equal-period country pairs. Not physical routes. */
export function compareVerifiedCorridorEndpoints(
  origin: VerifiedTimedMetric, destination: VerifiedTimedMetric,
  originIso3: string, destinationIso3: string,
) {
  assertCompatible(origin, destination);
  if (originIso3 === destinationIso3 || !country195ByIso3(originIso3) ||
      !country195ByIso3(destinationIso3) ||
      origin.country_iso3 !== originIso3 || destination.country_iso3 !== destinationIso3)
    throw Error("CORRIDOR_DIRECTION_OR_SUBJECT_MISMATCH");
  if (origin.reference_period_start !== destination.reference_period_start ||
      origin.reference_period_end !== destination.reference_period_end)
    throw Error("CORRIDOR_SOURCE_PERIOD_NOT_ALIGNED");
  return {
    schema_version: TEMPORAL_CORRIDOR_EVIDENCE_VERSION,
    subject: { type: "corridor" as const,
      origin_country_iso3: originIso3, destination_country_iso3: destinationIso3 },
    metric: origin.metric, dimension: origin.dimension, unit: origin.unit,
    reference_period: {
      start: origin.reference_period_start, end: origin.reference_period_end,
      granularity: origin.reference_period_granularity,
    },
    origin_value: origin.numeric_value,
    destination_value: destination.numeric_value,
    destination_minus_origin: rounded(destination.numeric_value - origin.numeric_value),
    composition_method: "TIME_ALIGNED_ENDPOINT_COMPARISON_ONLY" as const,
    direct_bilateral_relationship_verified: false as const,
    physical_or_payment_route_modeled: false as const,
    /** Hashes remain private in the governed evidence layer. */
    evidence_hashes_internal: [origin.evidence_hash, destination.evidence_hash],
  };
}

/** The previous state must be verified, distinct and strictly before current. */
export function compareVerifiedHistoricalBaseline(current: VerifiedTimedMetric, previous: VerifiedTimedMetric) {
  assertCompatible(current, previous);
  if (current.country_iso3 !== previous.country_iso3 ||
      time(previous.reference_period_end) >= time(current.reference_period_start) ||
      current.evidence_hash === previous.evidence_hash)
    throw Error("HISTORICAL_BASELINE_NOT_PREVIOUS_COMPARABLE_STATE");
  const delta = rounded(current.numeric_value - previous.numeric_value);
  return {
    schema_version: TEMPORAL_CORRIDOR_EVIDENCE_VERSION,
    country_iso3: current.country_iso3,
    dimension: current.dimension,
    metric: current.metric, unit: current.unit,
    prior_period: { start: previous.reference_period_start, end: previous.reference_period_end },
    current_period: { start: current.reference_period_start, end: current.reference_period_end },
    previous_verified_value: previous.numeric_value,
    current_verified_value: current.numeric_value,
    delta,
    direction: delta > 0 ? "INCREASED" as const : delta < 0 ? "DECREASED" as const : "UNCHANGED" as const,
    percent_change: previous.numeric_value === 0 ? null :
      rounded((current.numeric_value / previous.numeric_value - 1) * 100),
    evidence_hashes_internal: [previous.evidence_hash, current.evidence_hash],
    inferred_real_time_movement: false as const,
  };
}
