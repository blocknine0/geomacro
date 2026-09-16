import { createHash } from "node:crypto";

import {
  CEWS_METHOD_VERSION,
  EARLY_WARNING_SCHEMA_VERSION,
  computeCews,
  localTimestampFor,
  publicEarlyWarningEligible,
  type CewsInputs,
  type MarketRelevanceLevel,
} from "./early-warning-contract";
import { requireRiskSupabase } from "./risk-supabase.server";

export const EARLY_WARNING_PUBLIC_POLICY_VERSION = "public-alert-policy-v1" as const;

export type EarlyWarningBuildInput = {
  alert_key: string;
  visibility?: "public" | "private";
  country_iso3: string;
  country_name: string;
  country_timezone: string;
  event_family: string;
  event_title: string;
  primary_cause: string;
  cews_inputs: CewsInputs;
  confidence: number;
  independent_evidence_count: number;
  official_source_present: boolean;
  evidence_refs?: string[];
  transmission_channels?: string[];
  market_relevance?: Record<string, MarketRelevanceLevel>;
  source_risk_object_id?: string | null;
  source_event_ids?: string[];
  first_source_seen_at_utc?: string | null;
  detected_at_utc: string;
  public_url?: string | null;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value), "utf8").digest("hex");
}

function boundedText(value: unknown, field: string, maxLength: number) {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${field} is invalid`);
  }
  return normalized;
}

function isoTimestamp(value: unknown, field: string) {
  const normalized = boundedText(value, field, 80);
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} must be a valid ISO timestamp`);
  return date.toISOString();
}

function validateMarketRelevance(input: Record<string, MarketRelevanceLevel> | undefined) {
  const allowed = new Set<MarketRelevanceLevel>([
    "LOW",
    "MODERATE",
    "HIGH",
    "VERY_HIGH",
    "CRITICAL",
  ]);
  const result: Record<string, MarketRelevanceLevel> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    const name = String(key).trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(name) || !allowed.has(value)) {
      throw new Error("market_relevance contains an invalid entry");
    }
    result[name] = value;
  }
  return result;
}

function boundedStringArray(input: string[] | undefined, field: string, maxItems = 50) {
  const values = input ?? [];
  if (!Array.isArray(values) || values.length > maxItems) {
    throw new Error(`${field} is invalid`);
  }
  return values.map((value) => boundedText(value, field, 500));
}

function publicEligibilityReasons(input: {
  visibility: "public" | "private";
  status: "NORMAL" | "WATCH" | "ELEVATED" | "WARNING" | "CRITICAL";
  confidence: number;
  independentEvidenceCount: number;
  officialSourcePresent: boolean;
}) {
  const reasons: string[] = [];
  if (input.visibility !== "public") reasons.push("visibility_not_public");
  if (input.status !== "WARNING" && input.status !== "CRITICAL") reasons.push("status_below_public_threshold");
  if (input.confidence < 0.7) reasons.push("confidence_below_public_threshold");
  if (!input.officialSourcePresent && input.independentEvidenceCount < 2) reasons.push("insufficient_confirmation");
  return reasons.length ? reasons : ["eligible"];
}

export function buildEarlyWarningAlertRecord(input: EarlyWarningBuildInput) {
  const alertKey = boundedText(input.alert_key, "alert_key", 200);
  if (alertKey.length < 8) throw new Error("alert_key is too short");

  const countryIso3 = boundedText(input.country_iso3, "country_iso3", 3).toUpperCase();
  if (!/^[A-Z]{3}$/.test(countryIso3)) throw new Error("country_iso3 must be ISO3-like uppercase text");

  const visibility = input.visibility ?? "private";
  const confidence = Number(input.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }
  if (!Number.isInteger(input.independent_evidence_count) || input.independent_evidence_count < 0) {
    throw new Error("independent_evidence_count must be a non-negative integer");
  }

  const detectedAtUtc = isoTimestamp(input.detected_at_utc, "detected_at_utc");
  const firstSourceSeenAtUtc = input.first_source_seen_at_utc
    ? isoTimestamp(input.first_source_seen_at_utc, "first_source_seen_at_utc")
    : null;
  if (firstSourceSeenAtUtc && firstSourceSeenAtUtc > detectedAtUtc) {
    throw new Error("first_source_seen_at_utc cannot be after detected_at_utc");
  }

  const result = computeCews(input.cews_inputs);
  const evidenceRefs = boundedStringArray(input.evidence_refs, "evidence_refs");
  const sourceEventIds = boundedStringArray(input.source_event_ids, "source_event_ids");
  const transmissionChannels = boundedStringArray(input.transmission_channels, "transmission_channels", 20);
  const marketRelevance = validateMarketRelevance(input.market_relevance);

  const publicEligible = publicEarlyWarningEligible({
    visibility,
    status: result.status,
    confidence,
    independent_evidence_count: input.independent_evidence_count,
    official_source_present: Boolean(input.official_source_present),
  });

  const evidenceHash = sha256({
    independent_evidence_count: input.independent_evidence_count,
    official_source_present: Boolean(input.official_source_present),
    evidence_refs: evidenceRefs,
    source_event_ids: sourceEventIds,
    first_source_seen_at_utc: firstSourceSeenAtUtc,
  });

  const calculationHash = sha256({
    methodology_version: CEWS_METHOD_VERSION,
    cews_inputs: input.cews_inputs,
    cews_contributions: result.weighted_contributions,
    cews_score: result.score,
    status: result.status,
  });

  return {
    alert_key: alertKey,
    schema_version: EARLY_WARNING_SCHEMA_VERSION,
    methodology_version: CEWS_METHOD_VERSION,
    methodology_calibrated: false,
    content_type: "early_warning" as const,
    visibility,
    country_iso3: countryIso3,
    country_name: boundedText(input.country_name, "country_name", 120),
    country_timezone: boundedText(input.country_timezone, "country_timezone", 80),
    event_family: boundedText(input.event_family, "event_family", 80),
    event_title: boundedText(input.event_title, "event_title", 240),
    primary_cause: boundedText(input.primary_cause, "primary_cause", 1000),
    status: result.status,
    cews_score: result.score,
    cews_inputs: input.cews_inputs,
    cews_contributions: result.weighted_contributions,
    confidence,
    independent_evidence_count: input.independent_evidence_count,
    official_source_present: Boolean(input.official_source_present),
    evidence_refs: evidenceRefs,
    transmission_channels: transmissionChannels,
    market_relevance: marketRelevance,
    source_risk_object_id: input.source_risk_object_id
      ? boundedText(input.source_risk_object_id, "source_risk_object_id", 200)
      : null,
    source_event_ids: sourceEventIds,
    first_source_seen_at_utc: firstSourceSeenAtUtc,
    detected_at_utc: detectedAtUtc,
    detected_at_local: localTimestampFor(detectedAtUtc, input.country_timezone),
    public_url: input.public_url ? boundedText(input.public_url, "public_url", 500) : null,
    public_eligible: publicEligible,
    public_policy_version: EARLY_WARNING_PUBLIC_POLICY_VERSION,
    public_eligibility_reasons: publicEligibilityReasons({
      visibility,
      status: result.status,
      confidence,
      independentEvidenceCount: input.independent_evidence_count,
      officialSourcePresent: Boolean(input.official_source_present),
    }),
    evidence_hash: evidenceHash,
    calculation_hash: calculationHash,
  };
}

export async function persistEarlyWarningAlert(input: EarlyWarningBuildInput) {
  const record = buildEarlyWarningAlertRecord(input);
  const db = requireRiskSupabase();

  const { data, error } = await db
    .from("early_warning_alerts")
    .insert(record)
    .select("id,alert_key,evidence_hash,calculation_hash,status,cews_score,detected_at_utc,detected_at_local,public_eligible")
    .single();

  if (!error) return data;
  if (error.code !== "23505") throw error;

  const existing = await db
    .from("early_warning_alerts")
    .select("id,alert_key,evidence_hash,calculation_hash,status,cews_score,detected_at_utc,detected_at_local,public_eligible")
    .eq("alert_key", record.alert_key)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (!existing.data) throw error;
  if (
    existing.data.evidence_hash !== record.evidence_hash ||
    existing.data.calculation_hash !== record.calculation_hash
  ) {
    throw new Error("alert_key collision: existing early warning has different evidence or calculation hashes");
  }

  return existing.data;
}
