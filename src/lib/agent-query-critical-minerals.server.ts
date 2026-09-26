import { createHash } from "node:crypto";
import type { AgentQueryPlan } from "./agent-query-plan";
import { requireRiskSupabase } from "./risk-supabase.server";

export const AGENT_CRITICAL_MINERALS_SOURCE_ID = "usgs_mcs" as const;
export const AGENT_CRITICAL_MINERALS_METHODOLOGY_VERSION = "geomacro-usgs-mcs-derived-state-v1" as const;

export type AgentCriticalMineralsResult = {
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
  source_contract: null | {
    commercial_usage_status: string | null;
    raw_redistribution_allowed: boolean;
    attribution_required: boolean;
    licence_name: string | null;
    derived_commercial_signals_enabled: boolean;
  };
  state: null | {
    methodology_version: typeof AGENT_CRITICAL_MINERALS_METHODOLOGY_VERSION;
    coverage: "LIMITED" | "BROAD";
    covered_commodities: string[];
    commodity_count: number;
    metric_count: number;
    observation_count: number;
    latest_observed_at: string;
    evidence_hash: string;
    attribution: "U.S. Geological Survey Mineral Commodity Summaries";
    raw_source_material_redistributed: false;
  };
};

function unavailable(
  subject: AgentQueryPlan["subjects"][number],
  code: AgentCriticalMineralsResult["code"],
  sourceContract: AgentCriticalMineralsResult["source_contract"] = null,
  sourceObservedAt: string | null = null,
  hashes: string[] = [],
): AgentCriticalMineralsResult {
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

export async function loadAgentCriticalMineralsModule(input: {
  subject: AgentQueryPlan["subjects"][number];
  as_of: string;
  max_age_seconds: number;
}): Promise<AgentCriticalMineralsResult> {
  if (input.subject.type !== "country") {
    return unavailable(input.subject, "NOT_COUNTRY_SUBJECT");
  }

  const db = requireRiskSupabase();
  const sourceResult = await db
    .from("live_external_sources")
    .select("source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name")
    .eq("source_id", AGENT_CRITICAL_MINERALS_SOURCE_ID)
    .maybeSingle();
  if (sourceResult.error) throw sourceResult.error;
  const source = sourceResult.data as {
    commercial_usage_status?: string | null;
    enabled_for_ingestion?: boolean | null;
    enabled_for_commercial_signals?: boolean | null;
    raw_redistribution_allowed?: boolean | null;
    attribution_required?: boolean | null;
    licence_name?: string | null;
  } | null;

  const sourceContract = source ? {
    commercial_usage_status: source.commercial_usage_status ?? null,
    raw_redistribution_allowed: source.raw_redistribution_allowed === true,
    attribution_required: source.attribution_required === true,
    licence_name: source.licence_name ?? null,
    derived_commercial_signals_enabled: source.enabled_for_commercial_signals === true,
  } : null;
  const sourceEligible =
    source?.commercial_usage_status === "COMMERCIAL_OK" &&
    source.enabled_for_ingestion === true &&
    source.enabled_for_commercial_signals === true;
  if (!sourceEligible) {
    return unavailable(input.subject, "SOURCE_NOT_ELIGIBLE", sourceContract);
  }

  const observationResult = await db
    .from("live_external_observations")
    .select("observed_at,commodity,metric,normalized_hash,quality_status,commercial_eligibility_status")
    .eq("source_id", AGENT_CRITICAL_MINERALS_SOURCE_ID)
    .eq("country_iso3", input.subject.country_iso3)
    .lte("observed_at", input.as_of)
    .order("observed_at", { ascending: false })
    .limit(2000);
  if (observationResult.error) throw observationResult.error;
  const rows = observationResult.data ?? [];
  if (rows.length === 0) {
    return unavailable(input.subject, "OBSERVATION_NOT_AVAILABLE", sourceContract);
  }

  const verified = rows.filter(
    (row) => row.quality_status === "VERIFIED" && row.commercial_eligibility_status === "VERIFIED",
  );
  if (verified.length === 0) {
    return unavailable(input.subject, "OBSERVATION_NOT_VERIFIED", sourceContract);
  }

  const timestamps = verified
    .map((row) => Date.parse(String(row.observed_at ?? "")))
    .filter(Number.isFinite);
  if (timestamps.length === 0) {
    return unavailable(input.subject, "OBSERVATION_NOT_AVAILABLE", sourceContract);
  }
  const latestMs = Math.max(...timestamps);
  const latestObservedAt = new Date(latestMs).toISOString();
  const asOfMs = Date.parse(input.as_of);
  const hashes = [...new Set(verified
    .map((row) => typeof row.normalized_hash === "string" ? row.normalized_hash : null)
    .filter((value): value is string => Boolean(value)))].sort();

  if (
    !Number.isFinite(asOfMs) ||
    !Number.isFinite(input.max_age_seconds) ||
    input.max_age_seconds <= 0 ||
    asOfMs - latestMs > input.max_age_seconds * 1_000
  ) {
    return unavailable(
      input.subject,
      "OBSERVATION_STALE",
      sourceContract,
      latestObservedAt,
      hashes,
    );
  }

  const commodities = [...new Set(verified
    .map((row) => typeof row.commodity === "string" ? row.commodity.trim() : "")
    .filter(Boolean))].sort();
  const metrics = new Set(verified
    .map((row) => typeof row.metric === "string" ? row.metric.trim() : "")
    .filter(Boolean));
  const evidenceHash = createHash("sha256")
    .update(hashes.join("\n"))
    .digest("hex");

  return {
    deliverable: true,
    code: "AVAILABLE",
    subject: input.subject,
    source_id: AGENT_CRITICAL_MINERALS_SOURCE_ID,
    source_observed_at: latestObservedAt,
    source_normalized_hashes: hashes,
    source_contract: sourceContract,
    state: {
      methodology_version: AGENT_CRITICAL_MINERALS_METHODOLOGY_VERSION,
      coverage: commodities.length >= 5 ? "BROAD" : "LIMITED",
      covered_commodities: commodities,
      commodity_count: commodities.length,
      metric_count: metrics.size,
      observation_count: verified.length,
      latest_observed_at: latestObservedAt,
      evidence_hash: evidenceHash,
      attribution: "U.S. Geological Survey Mineral Commodity Summaries",
      raw_source_material_redistributed: false,
    },
  };
}
