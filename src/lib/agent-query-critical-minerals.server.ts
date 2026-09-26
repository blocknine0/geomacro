import { createHash } from "node:crypto";

import type { AgentQueryPlan } from "./agent-query-plan";
import {
  evaluateEarlyWarningDerivedEligibility,
  type EarlyWarningSourcePolicyRow,
} from "./early-warning-source-eligibility.server";
import { requireRiskSupabase } from "./risk-supabase.server";

export const AGENT_CRITICAL_MINERALS_SOURCE_ID = "usgs_mcs" as const;
export const AGENT_CRITICAL_MINERALS_METHOD_VERSION =
  "agent-critical-minerals-usgs-evidence-v1" as const;

export type AgentCriticalMineralsModuleResult = {
  deliverable: boolean;
  code:
    | "AVAILABLE"
    | "NOT_COUNTRY_SUBJECT"
    | "SOURCE_NOT_ELIGIBLE"
    | "OBSERVATION_NOT_AVAILABLE"
    | "OBSERVATION_STALE"
    | "OBSERVATION_NOT_VERIFIED";
  subject: AgentQueryPlan["subjects"][number];
  source_id: typeof AGENT_CRITICAL_MINERALS_SOURCE_ID;
  source_observed_at: string | null;
  source_normalized_hashes: string[];
  source_contract: {
    commercial_usage_status: string | null;
    enabled_for_ingestion: boolean;
    enabled_for_commercial_signals: boolean;
    raw_redistribution_allowed: boolean;
    delivery_boundary: "DERIVED_ONLY";
    raw_payload_allowed: false;
    attribution_required: boolean;
    licence_name: string | null;
  } | null;
  state: null | {
    methodology_version: typeof AGENT_CRITICAL_MINERALS_METHOD_VERSION;
    coverage: "EVIDENCE_ONLY";
    latest_observation_year: number;
    observation_count: number;
    commodity_count: number;
    commodities: string[];
    metric_count: number;
    metrics: string[];
    evidence_hash: string;
  };
};

function unavailable(
  subject: AgentQueryPlan["subjects"][number],
  code: AgentCriticalMineralsModuleResult["code"],
  sourceContract: AgentCriticalMineralsModuleResult["source_contract"] = null,
  sourceObservedAt: string | null = null,
  hashes: string[] = [],
): AgentCriticalMineralsModuleResult {
  return {
    deliverable: false,
    code,
    subject,
    source_id: AGENT_CRITICAL_MINERALS_SOURCE_ID,
    source_observed_at: sourceObservedAt,
    source_normalized_hashes: hashes,
    source_contract: sourceContract,
    state: null,
  };
}

function evidenceHash(hashes: string[]) {
  return createHash("sha256").update([...hashes].sort().join("\n")).digest("hex");
}

export async function loadAgentCriticalMineralsModule(input: {
  subject: AgentQueryPlan["subjects"][number];
  as_of: string;
  max_age_seconds: number;
}): Promise<AgentCriticalMineralsModuleResult> {
  if (input.subject.type !== "country") {
    return unavailable(input.subject, "NOT_COUNTRY_SUBJECT");
  }

  const db = requireRiskSupabase();
  const sourceResult = await db
    .from("live_external_sources")
    .select(
      "source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name",
    )
    .eq("source_id", AGENT_CRITICAL_MINERALS_SOURCE_ID)
    .maybeSingle();
  if (sourceResult.error) throw sourceResult.error;

  const source = (sourceResult.data as EarlyWarningSourcePolicyRow | null) ?? null;
  const eligibility = evaluateEarlyWarningDerivedEligibility({ source });
  const sourceContract = {
    commercial_usage_status: source?.commercial_usage_status ?? null,
    enabled_for_ingestion: source?.enabled_for_ingestion === true,
    enabled_for_commercial_signals: source?.enabled_for_commercial_signals === true,
    raw_redistribution_allowed: source?.raw_redistribution_allowed === true,
    delivery_boundary: eligibility.delivery_boundary,
    raw_payload_allowed: false as const,
    attribution_required: eligibility.attribution_required,
    licence_name: eligibility.licence_name,
  };
  if (!eligibility.eligible) {
    return unavailable(input.subject, "SOURCE_NOT_ELIGIBLE", sourceContract);
  }

  const result = await db
    .from("live_external_observations")
    .select(
      "observation_id,commodity,metric,observed_at,normalized_hash,quality_status,commercial_eligibility_status",
    )
    .eq("source_id", AGENT_CRITICAL_MINERALS_SOURCE_ID)
    .eq("category", "CRITICAL_MINERALS")
    .eq("country_iso3", input.subject.country_iso3)
    .lte("observed_at", input.as_of)
    .order("observed_at", { ascending: false })
    .limit(2000);

  if (result.error) throw result.error;
  const rows = result.data ?? [];
  if (rows.length === 0) {
    return unavailable(
      input.subject,
      "OBSERVATION_NOT_AVAILABLE",
      sourceContract,
    );
  }

  const timestamps = rows
    .map((row) => Date.parse(String(row.observed_at ?? "")))
    .filter(Number.isFinite);
  const latestMs = timestamps.length > 0 ? Math.max(...timestamps) : Number.NaN;
  const latestObservedAt = Number.isFinite(latestMs)
    ? new Date(latestMs).toISOString()
    : null;
  const asOfMs = Date.parse(input.as_of);

  if (
    !Number.isFinite(asOfMs) ||
    latestObservedAt === null ||
    !Number.isFinite(input.max_age_seconds) ||
    input.max_age_seconds <= 0 ||
    asOfMs - latestMs > input.max_age_seconds * 1000
  ) {
    return unavailable(
      input.subject,
      "OBSERVATION_STALE",
      sourceContract,
      latestObservedAt,
    );
  }

  const currentRows = rows.filter(
    (row) => Date.parse(String(row.observed_at ?? "")) === latestMs,
  );
  if (
    currentRows.some(
      (row) =>
        row.quality_status !== "VERIFIED" ||
        !["VERIFIED", "DERIVED_ONLY"].includes(
          String(row.commercial_eligibility_status ?? ""),
        ),
    )
  ) {
    return unavailable(
      input.subject,
      "OBSERVATION_NOT_VERIFIED",
      sourceContract,
      latestObservedAt,
    );
  }

  const hashes = [
    ...new Set(
      currentRows
        .map((row) =>
          typeof row.normalized_hash === "string" ? row.normalized_hash : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  if (hashes.length === 0) {
    return unavailable(
      input.subject,
      "OBSERVATION_NOT_VERIFIED",
      sourceContract,
      latestObservedAt,
    );
  }

  const commodities = [
    ...new Set(
      currentRows
        .map((row) =>
          typeof row.commodity === "string" ? row.commodity.trim() : "",
        )
        .filter(Boolean),
    ),
  ].sort();
  const metrics = [
    ...new Set(
      currentRows
        .map((row) => (typeof row.metric === "string" ? row.metric.trim() : ""))
        .filter(Boolean),
    ),
  ].sort();
  const latestObservationYear = new Date(latestMs).getUTCFullYear();

  return {
    deliverable: true,
    code: "AVAILABLE",
    subject: input.subject,
    source_id: AGENT_CRITICAL_MINERALS_SOURCE_ID,
    source_observed_at: latestObservedAt,
    source_normalized_hashes: hashes,
    source_contract: sourceContract,
    state: {
      methodology_version: AGENT_CRITICAL_MINERALS_METHOD_VERSION,
      coverage: "EVIDENCE_ONLY",
      latest_observation_year: latestObservationYear,
      observation_count: currentRows.length,
      commodity_count: commodities.length,
      commodities,
      metric_count: metrics.length,
      metrics,
      evidence_hash: evidenceHash(hashes),
    },
  };
}
