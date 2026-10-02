import { createHash } from "node:crypto";

import type { AgentQueryPlan } from "./agent-query-plan";
import { readB2AgentGovernedModule, type B2AgentCriticalMineralsState } from "./b2-agent-governed-modules.server";
import { checkCommercialSourceEligibility } from "./commercial-source-eligibility.server";
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
    certification_state: string | null;
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

async function b2Fallback(
  input: {
    subject: Extract<AgentQueryPlan["subjects"][number], { type: "country" }>;
    as_of: string;
    max_age_seconds: number;
  },
  sourceContract: NonNullable<AgentCriticalMineralsModuleResult["source_contract"]>,
): Promise<AgentCriticalMineralsModuleResult | null> {
  const entry = await readB2AgentGovernedModule(
    input.subject.country_iso3,
    "critical_minerals",
  );
  if (!entry || !("evidence_hash" in entry.state)) return null;
  const asOfMs = Date.parse(input.as_of);
  const observedMs = Date.parse(entry.source_observed_at);
  if (!Number.isFinite(asOfMs) || !Number.isFinite(observedMs) || observedMs > asOfMs) return null;
  if (
    !Number.isFinite(input.max_age_seconds) ||
    input.max_age_seconds <= 0 ||
    asOfMs - observedMs > input.max_age_seconds * 1_000
  ) {
    return unavailable(
      input.subject,
      "OBSERVATION_STALE",
      sourceContract,
      entry.source_observed_at,
      entry.source_normalized_hashes,
    );
  }
  const state = entry.state as B2AgentCriticalMineralsState;
  return {
    deliverable: true,
    code: "AVAILABLE",
    subject: input.subject,
    source_id: AGENT_CRITICAL_MINERALS_SOURCE_ID,
    source_observed_at: entry.source_observed_at,
    source_normalized_hashes: [...entry.source_normalized_hashes],
    source_contract: sourceContract,
    state: {
      methodology_version: AGENT_CRITICAL_MINERALS_METHOD_VERSION,
      coverage: "EVIDENCE_ONLY",
      latest_observation_year: state.latest_observation_year,
      observation_count: state.observation_count,
      commodity_count: state.commodity_count,
      commodities: [...state.commodities],
      metric_count: state.metric_count,
      metrics: [...state.metrics],
      evidence_hash: state.evidence_hash,
    },
  };
}

export async function loadAgentCriticalMineralsModule(input: {
  subject: AgentQueryPlan["subjects"][number];
  as_of: string;
  max_age_seconds: number;
}): Promise<AgentCriticalMineralsModuleResult> {
  if (input.subject.type !== "country") {
    return unavailable(input.subject, "NOT_COUNTRY_SUBJECT");
  }

  const eligibility = await checkCommercialSourceEligibility(
    AGENT_CRITICAL_MINERALS_SOURCE_ID,
  );
  const sourceContract = {
    certification_state: eligibility.certification_state,
    commercial_usage_status: eligibility.commercial_usage_status,
    enabled_for_ingestion: eligibility.enabled_for_ingestion,
    enabled_for_commercial_signals: eligibility.enabled_for_commercial_signals,
    raw_redistribution_allowed: eligibility.raw_redistribution_allowed,
    delivery_boundary: eligibility.delivery_boundary,
    raw_payload_allowed: eligibility.raw_payload_allowed,
    attribution_required: eligibility.attribution_required,
    licence_name: eligibility.licence_name,
  };
  if (!eligibility.eligible) {
    return unavailable(input.subject, "SOURCE_NOT_ELIGIBLE", sourceContract);
  }

  try {
    const db = requireRiskSupabase();
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
  } catch (primaryError) {
    const fallback = await b2Fallback({ ...input, subject: input.subject }, sourceContract);
    if (fallback) {
      console.warn("[agent-critical-minerals] primary governed store unavailable; using fresh verified B2 derived state");
      return fallback;
    }
    throw primaryError;
  }
}
