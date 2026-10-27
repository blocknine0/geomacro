import { country195ByIso3 } from "./canonical-country-registry-195";
import { sourceNativeObservationTime } from "./source-native-observation-time";
import type { StructuralObservation } from "./structural-context.server";

/**
 * Private evidence record. This is not a customer response schema: never
 * serialize the internal evidence ID, source lineage or provenance outside
 * the governed server-side preparation path.
 */
export const CANONICAL_STRUCTURAL_EVIDENCE_VERSION =
  "geomacro.canonical-structural-evidence.v1" as const;

export type MeasurementPeriod = Readonly<{
  start: string;
  end: string;
  granularity: "instant" | "day" | "month" | "quarter" | "year" | "custom";
}>;

export type CanonicalStructuralEvidence = Readonly<{
  schema_version: typeof CANONICAL_STRUCTURAL_EVIDENCE_VERSION;
  evidence_id: string;
  normalized_hash: string;
  country_iso3: string;
  partner_country_iso3: string | null;
  dimension: string;
  metric: string;
  observation_date: string;
  measurement_period: MeasurementPeriod;
  value: number | string;
  unit: string;
  data_quality: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalClock(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 19) === value.slice(0, 19)
    ? new Date(time).toISOString() : null;
}

function dateStart(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? new Date(time).toISOString() : null;
}

function explicitPeriod(value: unknown): MeasurementPeriod | null {
  if (typeof value === "string") {
    if (/^\d{4}$/u.test(value)) {
      return { start: value + "-01-01T00:00:00.000Z", end: value + "-12-31T23:59:59.999Z", granularity: "year" };
    }
    if (/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value)) {
      const [year, month] = value.split("-").map(Number);
      const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return { start: value + "-01T00:00:00.000Z", end: value + "-" + String(last).padStart(2, "0") + "T23:59:59.999Z", granularity: "month" };
    }
    const start = dateStart(value);
    return start ? { start, end: value + "T23:59:59.999Z", granularity: "day" } : null;
  }
  if (!isRecord(value)) return null;
  const start = canonicalClock(value.start) ?? dateStart(value.start);
  const end = canonicalClock(value.end) ?? (typeof value.end === "string" && dateStart(value.end)
    ? value.end + "T23:59:59.999Z" : null);
  const granularity = value.granularity;
  if (!start || !end || !["instant", "day", "month", "quarter", "year", "custom"].includes(String(granularity))) return null;
  return { start, end, granularity: granularity as MeasurementPeriod["granularity"] };
}

function nativeMeasurementPeriod(row: StructuralObservation): MeasurementPeriod | null {
  const provenance = isRecord(row.provenance) ? row.provenance : null;
  if (provenance && Object.hasOwn(provenance, "measurement_period"))
    return explicitPeriod(provenance.measurement_period);
  const observed = canonicalClock(row.observed_at);
  if (!observed) return null;
  // These are source-native reference period declarations from existing
  // verified release adapters; never infer an annual or quarterly period
  // merely from the year/month of an arbitrary timestamp.
  if (provenance?.date_precision === "YEAR" && typeof provenance.reference_year === "number" && Number.isInteger(provenance.reference_year)) {
    const year = provenance.reference_year as number;
    if (year >= 1900 && year <= 2200 && observed === year + "-12-31T23:59:59.000Z")
      return explicitPeriod(String(year));
  }
  if (provenance?.date_precision === "QUARTER" && /^\d{4}-(?:03-31|06-30|09-30|12-31)T23:59:59\.000Z$/u.test(observed)) {
    const year = Number(observed.slice(0, 4));
    const month = Number(observed.slice(5, 7));
    const firstMonth = String(month - 2).padStart(2, "0");
    return {
      start: year + "-" + firstMonth + "-01T00:00:00.000Z",
      end: observed.slice(0, 10) + "T23:59:59.999Z",
      granularity: "quarter",
    };
  }
  // Genuine event observations are point-in-time measurements. This does not
  // confer a publication or source-verification status.
  if (typeof row.event_type === "string" && row.event_type.trim())
    return { start: observed, end: observed, granularity: "instant" };
  return null;
}

/** Null means the row cannot qualify a purchased structural observation. */
export function canonicalStructuralEvidence(
  row: StructuralObservation,
  asOf: string,
): CanonicalStructuralEvidence | null {
  const asOfClock = canonicalClock(asOf);
  if (!asOfClock || !row || !country195ByIso3(row.country_iso3 ?? "") ||
    (row.partner_country_iso3 !== null && !country195ByIso3(row.partner_country_iso3 ?? "")) ||
    typeof row.observation_id !== "string" || !row.observation_id.trim() ||
    typeof row.source_id !== "string" || !row.source_id.trim() ||
    typeof row.dimension !== "string" || !row.dimension.trim() ||
    typeof row.metric !== "string" || !row.metric.trim() ||
    !/^[a-f0-9]{64}$/u.test(row.normalized_hash)) return null;

  const observationDate = canonicalClock(row.observed_at);
  const nativeTime = sourceNativeObservationTime(row, Date.parse(asOfClock));
  const period = nativeMeasurementPeriod(row);
  if (!observationDate || nativeTime === null || !period ||
    Date.parse(period.start) > Date.parse(period.end) ||
    Date.parse(period.end) > Date.parse(asOfClock) ||
    Date.parse(period.start) > Date.parse(asOfClock)) return null;

  const quality = typeof row.quality_status === "string" ? row.quality_status.trim().toUpperCase() : "";
  if (!quality || /(?:UNKNOWN|UNVERIFIED|PENDING|REVIEW|REJECT|INVALID|FAILED)/u.test(quality)) return null;
  const numeric = typeof row.value_numeric === "number" && Number.isFinite(row.value_numeric);
  const text = typeof row.value_text === "string" && row.value_text.trim().length > 0;
  if (!numeric && !text) return null;
  const unit = typeof row.unit === "string" ? row.unit.trim() : "";
  if (!unit || unit.length > 100) return null;

  return {
    schema_version: CANONICAL_STRUCTURAL_EVIDENCE_VERSION,
    evidence_id: row.source_id + ":" + row.observation_id,
    normalized_hash: row.normalized_hash,
    country_iso3: row.country_iso3!,
    partner_country_iso3: row.partner_country_iso3,
    dimension: row.dimension.trim(),
    metric: row.metric.trim(),
    observation_date: observationDate,
    measurement_period: period,
    value: numeric ? row.value_numeric! : row.value_text!.trim(),
    unit,
    data_quality: quality,
  };
}
