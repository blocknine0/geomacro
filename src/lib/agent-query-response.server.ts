import { createHash, randomUUID } from "node:crypto";
import type { AgentQueryPlan } from "./agent-query-plan";
import { demoPolicyFromPreset } from "./agentic-demo-contract";
import { loadCommercialRiskObjectForAgentQuery } from "./agent-query-external-modules.server";
import { loadAgentHotTopics } from "./agent-query-hot-topics.server";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import { loadStructuralContext, type StructuralObservation } from "./structural-context.server";

const MODULE_ALIASES: Record<string, readonly string[]> = {
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
};

const EXTERNAL_MODULES = new Set(["signed_risk_object", "risk_gate", "gri_context", "hot_topics"]);

function moduleMatches(module: string, dimension: string) {
  const normalized = dimension.trim().toLowerCase();
  return (MODULE_ALIASES[module] ?? [module]).some(
    (alias) => normalized === alias || normalized.includes(alias),
  );
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function hash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function observation(row: StructuralObservation) {
  return {
    observation_id: row.observation_id,
    source_id: row.source_id,
    source_record_id: row.source_record_id,
    source_url: row.source_url,
    dimension: row.dimension,
    country_iso3: row.country_iso3,
    partner_country_iso3: row.partner_country_iso3,
    observed_at: row.observed_at,
    published_at: row.published_at,
    metric: row.metric,
    value_numeric: row.value_numeric,
    value_text: row.value_text,
    unit: row.unit,
    event_type: row.event_type,
    signal_type: row.signal_type,
    parser_version: row.parser_version,
    methodology_status: row.methodology_status,
    quality_status: row.quality_status,
    provenance: row.provenance,
    normalized_hash: row.normalized_hash,
    retrieved_at: row.retrieved_at,
  };
}

function perModuleLimit(detail: AgentQueryPlan["detail"]) {
  return detail === "compact" ? 2 : detail === "full" ? 12 : 5;
}

async function structuralSubject(plan: AgentQueryPlan, subject: AgentQueryPlan["subjects"][number]) {
  const context = await loadStructuralContext(subject);
  const structuralModules = plan.required_modules.filter((module) => !EXTERNAL_MODULES.has(module));
  if (structuralModules.length > 0 && context.status !== "AVAILABLE") {
    throw new Error("STRUCTURAL_CONTEXT_NOT_DELIVERABLE");
  }
  const intelligence: Record<string, unknown> = {};
  const sourceIds = new Set<string>();
  const limit = perModuleLimit(plan.detail);

  for (const module of structuralModules) {
    const observations = context.observations
      .filter((row) => moduleMatches(module, row.dimension))
      .slice(0, limit)
      .map((row) => {
        sourceIds.add(row.source_id);
        return observation(row);
      });
    const coverage = context.metadata.coverage
      .filter((row) => moduleMatches(module, row.dimension))
      .slice(0, limit)
      .map((row) => {
        sourceIds.add(row.source_id);
        return {
          source_id: row.source_id,
          dimension: row.dimension,
          country_iso3: row.country_iso3,
          coverage_year: row.coverage_year,
          coverage_status: row.coverage_status,
          observation_count: row.observation_count,
          latest_observed_at: row.latest_observed_at,
          updated_at: row.updated_at,
        };
      });
    intelligence[module] = { observations, coverage };
  }

  return {
    subject,
    intelligence,
    source_ids: [...sourceIds].sort(),
    serving: {
      layer: context.metadata.serving_layer,
      warehouse_methodology_status: context.metadata.warehouse_methodology_status,
      composition_method: context.metadata.composition_method,
      route_modeling_status: context.metadata.route_modeling_status,
      direct_evidence_status: context.metadata.direct_evidence_status,
    },
  };
}

async function riskGateForSubject(plan: AgentQueryPlan, subject: AgentQueryPlan["subjects"][number]) {
  const context = plan.risk_gate_context;
  if (!context) throw new Error("RISK_GATE_CONTEXT_REQUIRED");
  const policy = demoPolicyFromPreset(context.policy_preset);
  const actionContext: { action_type: string; currency: "USDC"; amount?: number } = {
    action_type: context.action_type,
    currency: "USDC",
  };
  if (context.amount_usdc !== undefined) actionContext.amount = context.amount_usdc;
  const requestId = `adaptive:${randomUUID()}`;
  const result = subject.type === "country"
    ? await evaluateCountryRiskGate({
        request_id: requestId,
        country_iso3: subject.country_iso3,
        action_context: actionContext,
        policy,
        evaluated_at: plan.as_of ?? undefined,
      })
    : await evaluateCorridorRiskGate({
        request_id: requestId,
        origin_country_iso3: subject.origin_country_iso3,
        destination_country_iso3: subject.destination_country_iso3,
        action_context: actionContext,
        policy,
        evaluated_at: plan.as_of ?? undefined,
      });
  if (result.context.execution_authorized !== false || result.response.execution_authorized !== false) {
    throw new Error("RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
  }
  return result;
}

function publicGri(risk: Awaited<ReturnType<typeof readPublicGlobalRisk>>) {
  return {
    scope: "global",
    snapshot_id: risk.snapshotId,
    as_of: risk.snapshotAsOf,
    score: risk.score,
    raw_score: risk.rawScore,
    previous_score: risk.previous,
    previous_raw_score: risk.previousRaw,
    coverage: risk.coverage,
    weighted_confidence: risk.weightedConfidence,
    event_count: risk.eventCount,
    source_count: risk.sourceCount,
    methodology_version: risk.methodologyVersion,
    proof_version: risk.proofVersion,
    verification_status: risk.verificationStatus,
    proof_hash: risk.proofHash,
    evidence_hash: risk.evidenceHash,
    calculation_hash: risk.calculationHash,
    input_hash: risk.inputHash,
    methodology_hash: risk.methodologyHash,
    disposition_hash: risk.dispositionHash,
    change_hash: risk.changeHash,
    change_attribution: risk.drivers,
  };
}

export async function assembleAgentQueryResponse(input: {
  plan: AgentQueryPlan;
  requestId: string;
  clientRequestId?: string | null;
}) {
  const { plan } = input;
  const structural = await Promise.all(plan.subjects.map((subject) => structuralSubject(plan, subject)));
  const includeRiskObject = plan.required_modules.includes("signed_risk_object");
  const includeRiskGate = plan.required_modules.includes("risk_gate");
  const includeHotTopics = plan.required_modules.includes("hot_topics");

  const riskObjects = includeRiskObject
    ? await Promise.all(plan.subjects.map(async (subject) => {
        const object = await loadCommercialRiskObjectForAgentQuery(subject, plan.as_of ?? new Date().toISOString());
        if (!object) throw new Error("SIGNED_RISK_OBJECT_NOT_DELIVERABLE");
        return { subject, object };
      }))
    : [];

  const riskGates = includeRiskGate
    ? await Promise.all(plan.subjects.map(async (subject) => ({ subject, result: await riskGateForSubject(plan, subject) })))
    : [];

  const hotTopics = includeHotTopics
    ? await Promise.all(plan.subjects.map(async (subject) => {
        const result = await loadAgentHotTopics({ plan, subject });
        if (!result.deliverable) throw new Error(`HOT_TOPICS_NOT_DELIVERABLE:${result.code}`);
        return result;
      }))
    : [];

  const gri = plan.required_modules.includes("gri_context") ? publicGri(await readPublicGlobalRisk()) : null;

  const core = {
    schema_version: "geomacro.adaptive-intelligence-response.v1",
    product: "geomacro_adaptive_risk_intelligence_v1",
    request_id: input.requestId,
    client_request_id: input.clientRequestId ?? null,
    query_plan_hash: plan.query_plan_hash,
    question_interpretation: {
      normalized_question: plan.question_key,
      topics: plan.topics,
      required_modules: plan.required_modules,
    },
    subjects: plan.subjects,
    as_of: plan.as_of ?? new Date().toISOString(),
    structural,
    hot_topics: hotTopics,
    risk_gate: riskGates,
    signed_risk_objects: riskObjects,
    gri_context: gri,
    methodology: {
      query_schema_version: plan.schema_version,
      response_schema_version: "geomacro.adaptive-intelligence-response.v1",
      current_event_delivery: includeHotTopics ? "structured-derived-intelligence-only" : null,
    },
    limitations: {
      execution_authorized: false,
      missing_is_never_zero_risk: true,
      only_prechecked_required_modules_delivered: true,
      current_event_raw_source_material_redistributed: false,
      corridor_route_modeling_may_be_unavailable: structural.some((item) => item.serving.route_modeling_status === "NOT_MODELED"),
    },
    execution_authorized: false,
  };

  return {
    ...core,
    delivered_product_hash: hash(core),
  };
}
