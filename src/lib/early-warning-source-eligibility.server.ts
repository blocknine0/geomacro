import { requireRiskSupabase } from "./risk-supabase.server";

export type EarlyWarningSourcePolicyRow = {
  source_id: string;
  commercial_usage_status: string | null;
  enabled_for_ingestion: boolean | null;
  enabled_for_commercial_signals: boolean | null;
  raw_redistribution_allowed: boolean | null;
  attribution_required: boolean | null;
  licence_name: string | null;
};

export type EarlyWarningObservationPolicyRow = {
  observation_id: string;
  source_id: string;
  quality_status: string | null;
  commercial_eligibility_status: string | null;
};

export type EarlyWarningDerivedEligibility = {
  eligible: boolean;
  source_id: string;
  observation_id: string | null;
  delivery_boundary: "DERIVED_ONLY";
  raw_payload_allowed: false;
  attribution_required: boolean;
  licence_name: string | null;
  reason_codes: string[];
};

const SOURCE_DERIVED_STATUSES = new Set([
  "COMMERCIAL_OK",
  "DERIVED_ONLY",
]);

const OBSERVATION_DERIVED_STATUSES = new Set([
  "VERIFIED",
  "DERIVED_ONLY",
]);

/**
 * Early Warning is a derived-intelligence product.
 *
 * Unlike endpoints that expose structured source rows, this policy NEVER grants
 * permission to serialize third-party raw payloads. Raw redistribution is not a
 * prerequisite because the output contract is Geomacro-derived intelligence,
 * but the source must still be explicitly approved for commercial signals.
 */
export function evaluateEarlyWarningDerivedEligibility(input: {
  source: EarlyWarningSourcePolicyRow | null;
  observation?: EarlyWarningObservationPolicyRow | null;
}): EarlyWarningDerivedEligibility {
  const sourceId = input.source?.source_id ?? input.observation?.source_id ?? "";
  const reasons: string[] = [];

  if (!input.source) {
    reasons.push("SOURCE_NOT_REGISTERED");
  } else {
    if (!SOURCE_DERIVED_STATUSES.has(String(input.source.commercial_usage_status ?? ""))) {
      reasons.push(`SOURCE_STATUS_${input.source.commercial_usage_status ?? "MISSING"}`);
    }
    if (input.source.enabled_for_ingestion !== true) {
      reasons.push("SOURCE_INGESTION_DISABLED");
    }
    if (input.source.enabled_for_commercial_signals !== true) {
      reasons.push("SOURCE_COMMERCIAL_SIGNALS_DISABLED");
    }
  }

  if (input.observation !== undefined) {
    if (!input.observation) {
      reasons.push("OBSERVATION_NOT_FOUND");
    } else {
      if (input.source && input.observation.source_id !== input.source.source_id) {
        reasons.push("OBSERVATION_SOURCE_MISMATCH");
      }
      if (input.observation.quality_status !== "VERIFIED") {
        reasons.push(`OBSERVATION_QUALITY_${input.observation.quality_status ?? "MISSING"}`);
      }
      if (!OBSERVATION_DERIVED_STATUSES.has(String(input.observation.commercial_eligibility_status ?? ""))) {
        reasons.push(
          `OBSERVATION_COMMERCIAL_STATUS_${input.observation.commercial_eligibility_status ?? "MISSING"}`,
        );
      }
    }
  }

  return {
    eligible: reasons.length === 0,
    source_id: sourceId,
    observation_id: input.observation?.observation_id ?? null,
    delivery_boundary: "DERIVED_ONLY",
    raw_payload_allowed: false,
    attribution_required: input.source?.attribution_required === true,
    licence_name: input.source?.licence_name ?? null,
    reason_codes: reasons,
  };
}

export async function checkEarlyWarningDerivedSourceEligibility(input: {
  source_id: string;
  observation_id?: string | null;
}) {
  const sourceId = String(input.source_id ?? "").trim();
  if (!sourceId) {
    return evaluateEarlyWarningDerivedEligibility({ source: null });
  }

  const db = requireRiskSupabase();
  const sourceResult = await db
    .from("live_external_sources")
    .select(
      "source_id,commercial_usage_status,enabled_for_ingestion,enabled_for_commercial_signals,raw_redistribution_allowed,attribution_required,licence_name",
    )
    .eq("source_id", sourceId)
    .maybeSingle();

  if (sourceResult.error) throw sourceResult.error;

  const observationId = String(input.observation_id ?? "").trim();
  if (!observationId) {
    return evaluateEarlyWarningDerivedEligibility({
      source: (sourceResult.data as EarlyWarningSourcePolicyRow | null) ?? null,
    });
  }

  const observationResult = await db
    .from("live_external_observations")
    .select("observation_id,source_id,quality_status,commercial_eligibility_status")
    .eq("observation_id", observationId)
    .maybeSingle();

  if (observationResult.error) throw observationResult.error;

  return evaluateEarlyWarningDerivedEligibility({
    source: (sourceResult.data as EarlyWarningSourcePolicyRow | null) ?? null,
    observation: (observationResult.data as EarlyWarningObservationPolicyRow | null) ?? null,
  });
}

export async function assertEarlyWarningDerivedSourcesEligible(
  inputs: Iterable<{ source_id: string; observation_id?: string | null }>,
) {
  const normalized = [...inputs].map((item) => ({
    source_id: String(item.source_id ?? "").trim(),
    observation_id: item.observation_id ? String(item.observation_id).trim() : null,
  }));

  const results = await Promise.all(
    normalized.map((item) => checkEarlyWarningDerivedSourceEligibility(item)),
  );

  return {
    eligible: results.length > 0 && results.every((result) => result.eligible),
    results,
    ineligible: results.filter((result) => !result.eligible),
  };
}
