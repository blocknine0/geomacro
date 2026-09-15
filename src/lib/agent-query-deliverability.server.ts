import type { AgentQueryPlan } from "./agent-query-plan";
import {
  assertCommercialSourcesEligible,
  type CommercialSourceEligibility,
} from "./commercial-source-eligibility.server";
import {
  loadStructuralContext,
  type StructuralContext,
  type StructuralObservation,
} from "./structural-context.server";

export type AgentQueryAvailabilityCode =
  | "AVAILABLE"
  | "NOT_AVAILABLE"
  | "INSUFFICIENT_COVERAGE"
  | "STALE_REQUIRED_DATA"
  | "COMMERCIAL_SOURCE_NOT_ELIGIBLE";

export type AgentQueryDeliverability = {
  deliverable: boolean;
  code: AgentQueryAvailabilityCode;
  query_plan_hash: string;
  checked_at: string;
  missing_modules: string[];
  stale_modules: string[];
  ineligible_source_ids: string[];
  source_contracts: Array<{
    source_id: string;
    commercial_usage_status: string | null;
    raw_redistribution_allowed: boolean;
    attribution_required: boolean;
    licence_name: string | null;
  }>;
  subjects: Array<{
    subject: AgentQueryPlan["subjects"][number];
    status: StructuralContext["status"];
    available_modules: string[];
    latest_evidence_at: string | null;
    required_source_ids: string[];
  }>;
};

const STRUCTURAL_MODULE_ALIASES: Record<string, readonly string[]> = {
  sovereign_fiscal: ["sovereign_fiscal", "fiscal", "sovereign", "debt"],
  political_governance: ["political_governance", "governance", "political"],
  macro_monetary: ["macro_monetary", "macro", "monetary"],
  external_fx: ["external_fx", "fx", "external", "currency"],
  sanctions_restrictions: ["sanctions_restrictions", "sanctions", "restrictions"],
  geopolitical_security: ["geopolitical_security", "conflict", "security", "geopolitical"],
  trade_corridor: ["trade_corridor", "trade", "corridor"],
  energy_commodities: ["energy_commodities", "energy", "commodities"],
  critical_minerals: ["critical_minerals", "minerals"],
  banking_financial_system: ["banking_financial_system", "banking", "financial_system"],
  food_agriculture: ["food_agriculture", "food", "agriculture"],
  natural_hazards: ["natural_hazards", "hazards", "disaster"],
  hot_topics: ["hot_topics", "live_event", "event", "news"],
};

const EXTERNAL_MODULES = new Set(["signed_risk_object", "risk_gate", "gri_context"]);

function observationTime(row: StructuralObservation): number | null {
  const raw = row.observed_at ?? row.published_at ?? row.retrieved_at;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function moduleMatchesDimension(module: string, dimension: string) {
  const normalized = dimension.trim().toLowerCase();
  return (STRUCTURAL_MODULE_ALIASES[module] ?? [module]).some(
    (alias) => normalized === alias || normalized.includes(alias),
  );
}

function structuralModulesFor(context: StructuralContext) {
  const modules = new Set<string>();
  for (const module of Object.keys(STRUCTURAL_MODULE_ALIASES)) {
    if (context.observations.some((row) => moduleMatchesDimension(module, row.dimension))) {
      modules.add(module);
    }
    if (
      context.metadata.coverage.some(
        (row) =>
          moduleMatchesDimension(module, row.dimension) &&
          row.coverage_status.toUpperCase() !== "UNAVAILABLE",
      )
    ) {
      modules.add(module);
    }
  }
  return modules;
}

function latestModuleTime(context: StructuralContext, module: string): number | null {
  let latest: number | null = null;
  for (const row of context.observations) {
    if (!moduleMatchesDimension(module, row.dimension)) continue;
    const time = observationTime(row);
    if (time !== null && (latest === null || time > latest)) latest = time;
  }
  for (const row of context.metadata.coverage) {
    if (!moduleMatchesDimension(module, row.dimension) || !row.latest_observed_at) continue;
    const time = Date.parse(row.latest_observed_at);
    if (Number.isFinite(time) && (latest === null || time > latest)) latest = time;
  }
  return latest;
}

function requiredSourceIds(context: StructuralContext, requiredModules: string[]) {
  const ids = new Set<string>();
  for (const row of context.observations) {
    if (requiredModules.some((module) => moduleMatchesDimension(module, row.dimension))) {
      ids.add(row.source_id);
    }
  }
  for (const row of context.metadata.coverage) {
    if (
      row.coverage_status.toUpperCase() !== "UNAVAILABLE" &&
      requiredModules.some((module) => moduleMatchesDimension(module, row.dimension))
    ) {
      ids.add(row.source_id);
    }
  }
  return [...ids].sort();
}

type SourceCheckResult = {
  eligible: boolean;
  ineligible_source_ids: string[];
  results?: CommercialSourceEligibility[];
};

export async function checkAgentQueryDeliverability(
  plan: AgentQueryPlan,
  options?: {
    now?: Date;
    externalModuleChecker?: (input: {
      module: string;
      subject: AgentQueryPlan["subjects"][number];
      plan: AgentQueryPlan;
    }) => Promise<boolean>;
    sourceEligibilityChecker?: (sourceIds: string[]) => Promise<SourceCheckResult>;
  },
): Promise<AgentQueryDeliverability> {
  const now = options?.now ?? new Date();
  const requiredStructural = plan.required_modules.filter((module) => !EXTERNAL_MODULES.has(module));
  const missing = new Set<string>();
  const stale = new Set<string>();
  const ineligibleSources = new Set<string>();
  const sourceContracts = new Map<string, AgentQueryDeliverability["source_contracts"][number]>();
  const subjects: AgentQueryDeliverability["subjects"] = [];
  const sourceChecker = options?.sourceEligibilityChecker ?? assertCommercialSourcesEligible;

  for (const subject of plan.subjects) {
    const context = await loadStructuralContext(subject);
    const available = structuralModulesFor(context);
    let latestEvidence: number | null = null;

    if (context.status !== "AVAILABLE") {
      requiredStructural.forEach((module) => missing.add(module));
    } else {
      for (const module of requiredStructural) {
        if (!available.has(module)) {
          missing.add(module);
          continue;
        }
        const latest = latestModuleTime(context, module);
        if (latest !== null) {
          latestEvidence = latestEvidence === null ? latest : Math.max(latestEvidence, latest);
          const maxAgeSeconds = plan.module_max_age_seconds[module];
          if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
            stale.add(module);
          } else if (now.getTime() - latest > maxAgeSeconds * 1_000) {
            stale.add(module);
          }
        } else {
          stale.add(module);
        }
      }
    }

    const sourceIds = requiredSourceIds(context, requiredStructural);
    if (requiredStructural.length > 0 && context.status === "AVAILABLE") {
      if (sourceIds.length === 0) {
        requiredStructural.forEach((module) => missing.add(module));
      } else {
        const sourceEligibility = await sourceChecker(sourceIds);
        if (!sourceEligibility.eligible) {
          sourceEligibility.ineligible_source_ids.forEach((sourceId) => ineligibleSources.add(sourceId));
        }
        for (const result of sourceEligibility.results ?? []) {
          sourceContracts.set(result.source_id, {
            source_id: result.source_id,
            commercial_usage_status: result.commercial_usage_status,
            raw_redistribution_allowed: result.raw_redistribution_allowed,
            attribution_required: result.attribution_required,
            licence_name: result.licence_name,
          });
        }
      }
    }

    for (const module of plan.required_modules.filter((item) => EXTERNAL_MODULES.has(item))) {
      const ok = options?.externalModuleChecker
        ? await options.externalModuleChecker({ module, subject, plan })
        : false;
      if (!ok) missing.add(module);
    }

    subjects.push({
      subject,
      status: context.status,
      available_modules: [...available].sort(),
      latest_evidence_at: latestEvidence === null ? null : new Date(latestEvidence).toISOString(),
      required_source_ids: sourceIds,
    });
  }

  const missingModules = [...missing].sort();
  const staleModules = [...stale].sort();
  const ineligibleSourceIds = [...ineligibleSources].sort();
  const deliverable =
    missingModules.length === 0 && staleModules.length === 0 && ineligibleSourceIds.length === 0;
  const anyUnavailable = subjects.some((subject) => subject.status !== "AVAILABLE");
  const code: AgentQueryAvailabilityCode = deliverable
    ? "AVAILABLE"
    : ineligibleSourceIds.length > 0
      ? "COMMERCIAL_SOURCE_NOT_ELIGIBLE"
      : anyUnavailable && requiredStructural.length > 0
        ? "NOT_AVAILABLE"
        : missingModules.length > 0
          ? "INSUFFICIENT_COVERAGE"
          : "STALE_REQUIRED_DATA";

  return {
    deliverable,
    code,
    query_plan_hash: plan.query_plan_hash,
    checked_at: now.toISOString(),
    missing_modules: missingModules,
    stale_modules: staleModules,
    ineligible_source_ids: ineligibleSourceIds,
    source_contracts: [...sourceContracts.values()].sort((a, b) => a.source_id.localeCompare(b.source_id)),
    subjects,
  };
}
