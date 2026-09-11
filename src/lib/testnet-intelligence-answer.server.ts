type StructuralObservationLike = {
  dimension?: unknown;
  metric?: unknown;
  value_numeric?: unknown;
  value_text?: unknown;
  unit?: unknown;
  observed_at?: unknown;
};

type SeverityLike = {
  latest_severity?: unknown;
  max_recent_severity?: unknown;
  events?: unknown;
};

type IntelligenceDataLike = {
  subject?: unknown;
  severity?: SeverityLike;
  observations?: StructuralObservationLike[];
  note?: unknown;
};

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function severityBand(value: number | null) {
  if (value == null) return "unavailable";
  if (value >= 80) return "critical";
  if (value >= 60) return "high";
  if (value >= 40) return "elevated";
  if (value >= 20) return "moderate";
  return "low";
}

function observationText(row: StructuralObservationLike) {
  const dimension = typeof row.dimension === "string" ? row.dimension.trim() : "";
  const metric = typeof row.metric === "string" ? row.metric.trim() : "";
  const numeric = finiteNumber(row.value_numeric);
  const text = typeof row.value_text === "string" ? row.value_text.trim() : "";
  const unit = typeof row.unit === "string" ? row.unit.trim() : "";
  const value = numeric != null ? `${numeric}${unit ? ` ${unit}` : ""}` : text;
  const label = [dimension, metric].filter(Boolean).join(" / ");
  if (!label && !value) return null;
  return value ? `${label || "Structural signal"}: ${value}` : label;
}

export function buildTestnetIntelligenceAnswer(data: IntelligenceDataLike) {
  const latestSeverity = finiteNumber(data.severity?.latest_severity);
  const maxRecentSeverity = finiteNumber(data.severity?.max_recent_severity);
  const observations = Array.isArray(data.observations)
    ? data.observations.map(observationText).filter((item): item is string => Boolean(item)).slice(0, 3)
    : [];
  const eventCount = Array.isArray(data.severity?.events) ? data.severity?.events.length : 0;

  const direct = latestSeverity == null
    ? "Current severity is unavailable from the live structured-event feed for this subject."
    : `Current severity is ${latestSeverity}/100 (${severityBand(latestSeverity)}).`;

  return {
    direct_answer: direct,
    current_severity: {
      score: latestSeverity,
      band: severityBand(latestSeverity),
      max_recent_score: maxRecentSeverity,
      recent_event_count: eventCount,
      scale: "0-100" as const,
    },
    structural_summary: observations,
    evidence_note: typeof data.note === "string" ? data.note : null,
    generation_method: "deterministic_from_geomacro_structured_data" as const,
  };
}
