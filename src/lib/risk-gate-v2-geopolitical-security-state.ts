import type { RiskGateV2ModuleStateInput } from "./risk-gate-v2-engine";
import type { RiskGateV2Driver } from "./risk-gate-v2-taxonomy";

export const RISK_GATE_V2_GEOPOLITICAL_SECURITY_METHOD_VERSION =
  "risk-gate-v2-geopolitical-security-ucdp-candidate-0.1.0" as const;
export const RISK_GATE_V2_GEOPOLITICAL_LOOKBACK_DAYS = 180;
export const RISK_GATE_V2_GEOPOLITICAL_MAX_SOURCE_LAG_DAYS = 75;
export const RISK_GATE_V2_GEOPOLITICAL_TTL_MS = 24 * 60 * 60 * 1000;

export type UcdpCandidateModuleEvent = {
  country_iso3: string;
  observed_at: string;
  best_deaths: number;
  type_of_violence: string | null;
};

export type UcdpCandidateReleaseEvidence = {
  release_id: string;
  manifest_hash: string;
  coverage_start: string;
  coverage_end: string;
  retrieved_at: string;
  write_completed: true;
  rejected_rows: 0;
  unmapped_rows: 0;
};

function round6(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function parseDate(value: string, field: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid timestamp`);
  return date;
}

function percentileRank(value: number, population: number[]) {
  if (population.length <= 1) return 0;
  let below = 0;
  for (const candidate of population) {
    if (candidate < value) below += 1;
  }
  return below / (population.length - 1);
}

function driverForType(type: string | null): RiskGateV2Driver {
  if (type === "2") return "civil_conflict";
  if (type === "3") return "terrorism_political_violence";
  return "military_escalation";
}

/**
 * Release-consistent UCDP Candidate country module.
 * Score = max(event-count percentile, best-fatality percentile) across the same
 * enabled sovereign denominator and 180-day window. This avoids opaque fixed
 * country weights. A zero event score is allowed only with a clean global
 * release manifest. Coverage stays PARTIAL because organized violence is only
 * one part of the geopolitical-security ontology.
 */
export function buildRiskGateV2GeopoliticalSecuritySnapshot(input: {
  sovereign_iso3: string[];
  events: UcdpCandidateModuleEvent[];
  release: UcdpCandidateReleaseEvidence;
  generated_at: string;
}): Map<string, RiskGateV2ModuleStateInput> {
  if (!input.release.write_completed || input.release.rejected_rows !== 0 || input.release.unmapped_rows !== 0) {
    throw new Error("UCDP geopolitical module requires a clean completed global release manifest");
  }
  if (!/^[0-9a-f]{64}$/.test(input.release.manifest_hash)) {
    throw new Error("UCDP release manifest_hash must be sha256 hex");
  }

  const generatedAt = parseDate(input.generated_at, "generated_at");
  const coverageStart = parseDate(input.release.coverage_start, "coverage_start");
  const coverageEnd = parseDate(input.release.coverage_end, "coverage_end");
  parseDate(input.release.retrieved_at, "retrieved_at");
  if (coverageStart.getTime() > coverageEnd.getTime()) {
    throw new Error("UCDP release coverage_start cannot be after coverage_end");
  }

  const lagDays = Math.max(0, (generatedAt.getTime() - coverageEnd.getTime()) / 86_400_000);
  if (lagDays > RISK_GATE_V2_GEOPOLITICAL_MAX_SOURCE_LAG_DAYS) return new Map();
  const sourceConfidence = lagDays <= 45 ? 0.9 : 0.75;

  const sovereigns = [...new Set(input.sovereign_iso3.map((iso3) => iso3.trim().toUpperCase()))]
    .filter((iso3) => /^[A-Z]{3}$/.test(iso3))
    .sort();
  if (!sovereigns.length) throw new Error("At least one sovereign country is required");
  const sovereignSet = new Set(sovereigns);
  const windowStart = new Date(
    coverageEnd.getTime() - RISK_GATE_V2_GEOPOLITICAL_LOOKBACK_DAYS * 86_400_000,
  );

  const aggregates = new Map<
    string,
    { event_count: number; deaths: number; driver_counts: Map<RiskGateV2Driver, number> }
  >();
  for (const iso3 of sovereigns) {
    aggregates.set(iso3, { event_count: 0, deaths: 0, driver_counts: new Map() });
  }

  for (const event of input.events) {
    const iso3 = event.country_iso3.trim().toUpperCase();
    if (!sovereignSet.has(iso3)) continue;
    const observedAt = parseDate(event.observed_at, "event observed_at");
    if (observedAt.getTime() < windowStart.getTime() || observedAt.getTime() > coverageEnd.getTime()) continue;
    if (!Number.isFinite(event.best_deaths) || event.best_deaths < 0) {
      throw new Error("UCDP best_deaths must be a non-negative finite number");
    }
    const aggregate = aggregates.get(iso3)!;
    aggregate.event_count += 1;
    aggregate.deaths += event.best_deaths;
    const driver = driverForType(event.type_of_violence);
    aggregate.driver_counts.set(driver, (aggregate.driver_counts.get(driver) ?? 0) + 1);
  }

  const eventPopulation = sovereigns.map((iso3) => aggregates.get(iso3)!.event_count);
  const deathPopulation = sovereigns.map((iso3) => aggregates.get(iso3)!.deaths);
  const expiresAt = new Date(generatedAt.getTime() + RISK_GATE_V2_GEOPOLITICAL_TTL_MS);
  const states = new Map<string, RiskGateV2ModuleStateInput>();

  for (const iso3 of sovereigns) {
    const aggregate = aggregates.get(iso3)!;
    const eventPercentile = percentileRank(aggregate.event_count, eventPopulation);
    const deathPercentile = percentileRank(aggregate.deaths, deathPopulation);
    const score = round6(100 * Math.max(eventPercentile, deathPercentile));
    const driverTotal = [...aggregate.driver_counts.values()].reduce((sum, value) => sum + value, 0);
    const drivers = [...aggregate.driver_counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([driver, count]) => ({
        driver,
        score_contribution: driverTotal === 0 ? 0 : round6(score * (count / driverTotal)),
        delta_contribution: null,
        confidence: sourceConfidence,
      }));

    states.set(iso3, {
      module_state_id: `rgv2:${iso3}:geopolitical_security:${input.release.manifest_hash.slice(0, 24)}:${generatedAt.getTime().toString(36)}`,
      module: "geopolitical_security",
      score,
      previous_score: null,
      delta: null,
      confidence: sourceConfidence,
      coverage: "PARTIAL",
      commercial_eligibility_status: "VERIFIED",
      generated_at: generatedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      methodology_version: RISK_GATE_V2_GEOPOLITICAL_SECURITY_METHOD_VERSION,
      risk_object_ids: [],
      drivers,
    });
  }

  return states;
}
