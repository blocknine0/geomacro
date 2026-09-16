export const EARLY_WARNING_SCHEMA_VERSION = "early-warning-1.0" as const;
export const CEWS_METHOD_VERSION = "cews-v0.1.0-provisional" as const;

export type EarlyWarningStatus =
  | "NORMAL"
  | "WATCH"
  | "ELEVATED"
  | "WARNING"
  | "CRITICAL";

export type MarketRelevanceLevel =
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "VERY_HIGH"
  | "CRITICAL";

export type CewsInputs = {
  novelty: number;
  severity: number;
  escalation_velocity: number;
  structural_vulnerability: number;
  transmission_potential: number;
  evidence_confidence: number;
  source_reliability: number;
  recency: number;
};

export const CEWS_WEIGHTS: Readonly<Record<keyof CewsInputs, number>> = {
  novelty: 0.1,
  severity: 0.2,
  escalation_velocity: 0.15,
  structural_vulnerability: 0.15,
  transmission_potential: 0.15,
  evidence_confidence: 0.1,
  source_reliability: 0.1,
  recency: 0.05,
};

export type CewsResult = {
  methodology_version: typeof CEWS_METHOD_VERSION;
  score: number;
  status: EarlyWarningStatus;
  weighted_contributions: Record<keyof CewsInputs, number>;
  calibrated: false;
};

function bounded100(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${field} must be a finite number from 0 to 100`);
  }
  return value;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function earlyWarningStatus(score: number): EarlyWarningStatus {
  const value = bounded100(score, "score");
  if (value < 30) return "NORMAL";
  if (value < 50) return "WATCH";
  if (value < 65) return "ELEVATED";
  if (value < 80) return "WARNING";
  return "CRITICAL";
}

export function computeCews(input: CewsInputs): CewsResult {
  const contributions = Object.fromEntries(
    (Object.keys(CEWS_WEIGHTS) as Array<keyof CewsInputs>).map((key) => {
      const value = bounded100(input[key], key);
      return [key, round2(value * CEWS_WEIGHTS[key])];
    }),
  ) as Record<keyof CewsInputs, number>;

  const score = round2(
    Object.values(contributions).reduce((sum, value) => sum + value, 0),
  );

  return {
    methodology_version: CEWS_METHOD_VERSION,
    score,
    status: earlyWarningStatus(score),
    weighted_contributions: contributions,
    calibrated: false,
  };
}

export function assertIanaTimeZone(timeZone: string) {
  const normalized = String(timeZone ?? "").trim();
  if (!normalized || normalized.length > 80) {
    throw new Error("country_timezone is invalid");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalized }).format(new Date(0));
  } catch {
    throw new Error("country_timezone must be a valid IANA timezone");
  }
  return normalized;
}

export function localTimestampFor(utcIso: string, timeZone: string) {
  const zone = assertIanaTimeZone(timeZone);
  const date = new Date(utcIso);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("detected_at_utc must be a valid ISO timestamp");
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const offset = String(parts.timeZoneName ?? "GMT+00:00").replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

export function publicEarlyWarningEligible(input: {
  visibility: "public" | "private";
  status: EarlyWarningStatus;
  confidence: number;
  independent_evidence_count: number;
  official_source_present: boolean;
}) {
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    return false;
  }
  if (!Number.isInteger(input.independent_evidence_count) || input.independent_evidence_count < 0) {
    return false;
  }
  return (
    input.visibility === "public" &&
    (input.status === "WARNING" || input.status === "CRITICAL") &&
    input.confidence >= 0.7 &&
    (input.official_source_present || input.independent_evidence_count >= 2)
  );
}
