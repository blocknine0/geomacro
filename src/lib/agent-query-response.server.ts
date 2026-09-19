import { createHash, randomUUID } from "node:crypto";
import type { AgentQueryPlan } from "./agent-query-plan";
import { demoPolicyFromPreset } from "./agentic-demo-contract";
import { loadCommercialRiskObjectForAgentQuery } from "./agent-query-external-modules.server";
import { loadAgentHotTopics } from "./agent-query-hot-topics.server";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import { loadStructuralContext } from "./structural-context.server";
import {
  GEOMACRO_INTELLIGENCE_CONTRACT_VERSION,
  GEOMACRO_INTELLIGENCE_PRICE_USDC,
  GEOMACRO_INTELLIGENCE_PRODUCT_ID,
  GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
  intelligenceStateVersion,
  publicStructuralCoverage,
  publicStructuralDevelopment,
  publicStructuralObservation,
} from "./geomacro-intelligence-contract";

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

type LoadedRiskObject = {
  subject: AgentQueryPlan["subjects"][number];
  object: NonNullable<Awaited<ReturnType<typeof loadCommercialRiskObjectForAgentQuery>>>;
};

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
  const limit = perModuleLimit(plan.detail);

  for (const module of structuralModules) {
    const observations = context.observations
      .filter((row) => moduleMatches(module, row.dimension))
      .slice(0, limit)
      .map((row) => publicStructuralObservation(row, plan.as_of ?? new Date().toISOString()));
    const coverage = context.metadata.coverage
      .filter((row) => moduleMatches(module, row.dimension))
      .slice(0, limit)
      .map((row) => publicStructuralCoverage(row));
    intelligence[module] = { observations, coverage };
  }

  const allObservations = context.observations
    .slice(0, Math.max(limit, 12))
    .map((row) => publicStructuralObservation(row, plan.as_of ?? new Date().toISOString()));
  const stateVersionInputHash = hash({
    observation_hashes: context.observations
      .map((row) => row.normalized_hash)
      .filter((value): value is string => typeof value === "string")
      .sort(),
    coverage: context.metadata.coverage
      .map((row) => ({
        dimension: row.dimension,
        country_iso3: row.country_iso3,
        coverage_year: row.coverage_year,
        coverage_status: row.coverage_status,
        latest_observed_at: row.latest_observed_at,
      }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  });

  return {
    subject,
    stateVersionInputHash,
    intelligence,
    evidence_summary: {
      observation_count: allObservations.length,
      available_dimensions: [...new Set(allObservations.map((row) => row.dimension))].sort(),
      latest_observed_at:
        allObservations
          .map((row) => row.observed_at ?? row.published_at ?? row.retrieved_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
    },
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

function publicRiskObjectAttestation(
  entry: LoadedRiskObject,
) {
  const { subject, object } = entry;
  return {
    subject,
    object: {
      risk_object_id: object.object_id,
      schema_version: object.schema_version,
      risk: {
        score: object.risk.score,
        label: object.risk.label,
        previous_score: object.risk.previous_score ?? null,
        delta: object.risk.delta ?? null,
        direction: object.risk.direction,
      },
      confidence: object.confidence,
      attribution: [...object.attribution]
        .sort((a, b) => Math.abs(b.delta_contribution ?? 0) - Math.abs(a.delta_contribution ?? 0))
        .slice(0, 5)
        .map((row) => ({
          driver: row.driver,
          score_contribution: row.score_contribution,
          delta_contribution: row.delta_contribution,
          event_count: row.event_count,
          weight: row.weight,
        })),
      methodology_version: object.methodology_version,
      generated_at: object.generated_at,
      expires_at: object.expires_at,
      verification: {
        status: object.verification.status,
        last_verified_at: object.verification.last_verified_at,
      },
      commercial_eligibility_status: object.commercial_eligibility.status,
      integrity: {
        input_hash: object.integrity.input_hash,
        data_hash: object.integrity.data_hash,
        calculation_hash: object.integrity.calculation_hash,
        payload_hash: object.integrity.payload_hash,
        signature_scheme: object.integrity.signature_scheme,
        signing_key_id: object.integrity.signing_key_id,
      },
      delivery_boundary: "SIGNED_RISK_OBJECT_ATTESTATION_ONLY",
    },
  } as const;
}


function publicRiskState(object: LoadedRiskObject["object"]) {
  return {
    risk: object.risk,
    confidence: object.confidence,
    attribution: [...object.attribution]
      .sort((a, b) => Math.abs(b.delta_contribution ?? 0) - Math.abs(a.delta_contribution ?? 0))
      .slice(0, 5)
      .map((row) => ({
        driver: row.driver,
        score_contribution: row.score_contribution,
        delta_contribution: row.delta_contribution,
        event_count: row.event_count,
        weight: row.weight,
      })),
    evidence_summary: object.evidence_summary,
    methodology_version: object.methodology_version,
    observed_at: object.observed_at ?? object.generated_at,
    generated_at: object.generated_at,
    expires_at: object.expires_at,
    verification: {
      status: object.verification.status,
      last_verified_at: object.verification.last_verified_at,
    },
    integrity: {
      calculation_hash: object.integrity.calculation_hash,
      payload_hash: object.integrity.payload_hash,
      signature_scheme: object.integrity.signature_scheme,
      signing_key_id: object.integrity.signing_key_id,
    },
  };
}

async function buildCurrentState(
  plan: AgentQueryPlan,
  structural: Awaited<ReturnType<typeof structuralSubject>>[],
  riskObjects: LoadedRiskObject[],
  hotTopics: Awaited<ReturnType<typeof loadAgentHotTopics>>[],
) {
  const riskBySubject = new Map(riskObjects.map((entry) => [subjectKey(entry.subject), entry.object]));
  const hotBySubject = new Map(
    hotTopics.map((result) => [subjectKey(result.subject), result]),
  );

  const asOf = plan.as_of ?? new Date().toISOString();

  return Promise.all(plan.subjects.map(async (subject) => {
    const key = subjectKey(subject);
    const structuralRow = structural.find((item) => subjectKey(item.subject) === key);
    const risk = riskBySubject.get(key);
    const hot = hotBySubject.get(key);

    const historicalReferencePoints = risk
      ? await Promise.all(
          [
            ["30d", 30],
            ["90d", 90],
          ] as const,
        ).then(async (windows) =>
          Promise.all(
            windows.map(async ([window, days]) => {
              const referenceAsOf = new Date(Date.parse(asOf) - days * 86_400_000).toISOString();
              const reference = await loadCommercialRiskObjectForAgentQuery(subject, referenceAsOf);
              if (!reference) return {
                window,
                available: false,
                as_of: referenceAsOf,
              };
              return {
                window,
                available: true,
                as_of: reference.generated_at,
                score: reference.risk.score,
                label: reference.risk.label,
                delta_from_current: Number((risk.object.risk.score - reference.risk.score).toFixed(4)),
                object_id: reference.object_id,
                methodology_version: reference.methodology_version,
              };
            }),
          ),
        )
      : [];

    const developmentInputs = (hot?.events ?? []).map((event) => publicStructuralDevelopment({
      event_id: event.event_id,
      story_key: event.story_key,
      event_type: event.event_type,
      families: event.families,
      primary_country: event.primary_country,
      countries: event.countries,
      severity: event.severity,
      confidence: event.confidence,
      direction: event.direction,
      status: event.status,
      first_seen_at: event.first_seen_at,
      last_seen_at: event.last_seen_at,
      last_observed_at: event.last_observed_at,
      evidence_count: event.evidence_count,
      independent_source_count: event.independent_source_count,
      structure_version: event.structure_version,
      classification_version: event.classification_version,
    }));

      const stateVersion = intelligenceStateVersion({
      subject,
      as_of: asOf,
      risk_calculation_hash: risk?.integrity.calculation_hash ?? null,
      structural_observation_hashes:
        structuralRow?.stateVersionInputHash
          ? [structuralRow.stateVersionInputHash]
          : [],
      structural_coverage: structuralRow
        ? Object.values(structuralRow.intelligence).flatMap((value) =>
            value && typeof value === "object" && "coverage" in value &&
            Array.isArray((value as { coverage?: unknown[] }).coverage)
              ? (value as { coverage: ReturnType<typeof publicStructuralCoverage>[] }).coverage
              : [],
          )
        : [],
      event_versions: developmentInputs.map((event) => event.event_version),
    });

    return {
      subject,
      state_version: stateVersion,
      risk: risk ? publicRiskState(risk) : null,
      historical_context: {
        reference_states: historicalReferencePoints,
      },
      structural: structuralRow?.evidence_summary ?? null,
      live: {
        current_event_signal: hot?.current_event_signal ?? false,
        event_count: hot?.commercially_deliverable_event_count ?? 0,
        pipeline_lag_seconds: hot?.source_pipeline.lag_seconds ?? null,
        checked_at: hot?.checked_at ?? null,
      },
      developments: developmentInputs,
    };
  }));
}

function buildDirectAnswer(
  plan: AgentQueryPlan,
  states: Awaited<ReturnType<typeof buildCurrentState>>,
) {
  const supported = states.filter((state) => state.risk !== null);
  if (!supported.length) {
    return {
      status: "INSUFFICIENT_STATE",
      headline: "Geomacro could not establish a current verified risk state for this request.",
      what_changed: [],
      why_it_matters: "The response contains only data modules that passed the commercial delivery contract.",
    } as const;
  }

  if (plan.intent === "comparison" || plan.intent === "ranking_filter") {
    return {
      status: "SUPPORTED",
      headline: `${supported.length} subjects have current verified Geomacro risk states.`,
      what_changed: supported.map((state) => ({
        subject: state.subject,
        score: state.risk!.risk.score,
        delta: state.risk!.risk.delta,
        direction: state.risk!.risk.direction,
      })),
      why_it_matters: "Scores, movements and structural developments are returned as versioned state rather than raw news.",
    } as const;
  }

  const state = supported[0];
  const risk = state.risk!;
  const deltaText =
    typeof risk.risk.delta === "number"
      ? `, ${risk.risk.delta >= 0 ? "up" : "down"} ${Math.abs(risk.risk.delta).toFixed(2)} points from the previous published state`
      : "";
  const driverText = risk.attribution
    .slice(0, 3)
    .map((driver) => `${driver.driver} ${driver.delta_contribution === null ? "no comparable delta" : `${driver.delta_contribution >= 0 ? "+" : ""}${driver.delta_contribution.toFixed(2)}`}`)
    .join(", ");

  return {
    status: "SUPPORTED",
    headline: `${state.subject.type === "country" ? state.subject.country_iso3 : `${state.subject.origin_country_iso3} → ${state.subject.destination_country_iso3}`} is ${risk.risk.label} at ${risk.risk.score.toFixed(2)}/100${deltaText}.`,
    what_changed: [
      driverText ? `Largest attributed movements: ${driverText}.` : "No compatible driver delta is available.",
      state.developments.length
        ? `${state.developments.length} canonical material development(s) are currently linked to this state.`
        : "No current material development passed the commercial live-event contract.",
    ],
    why_it_matters: "Geomacro combines historical structural context with current verified developments and exposes the resulting state as versioned derived intelligence.",
  } as const;
}

function intentAnalysis(plan: AgentQueryPlan, riskObjects: LoadedRiskObject[]) {
  if (plan.intent === "ranking_filter") {
    if (!plan.ranking || riskObjects.length !== plan.subjects.length) {
      throw new Error("RANKING_PRODUCT_NOT_DELIVERABLE");
    }
    const multiplier = plan.ranking.order === "high_to_low" ? -1 : 1;
    const rows = riskObjects
      .map(({ subject, object }) => ({
        subject,
        risk_object_id: object.object_id,
        score: object.risk.score,
        label: object.risk.label,
        confidence: object.confidence,
        delta: object.risk.delta,
        methodology_version: object.methodology_version,
        verification_status: object.verification.status,
      }))
      .sort((a, b) => {
        const byScore = (a.score - b.score) * multiplier;
        return byScore || stableJson(a.subject).localeCompare(stableJson(b.subject));
      })
      .slice(0, plan.ranking.limit ?? plan.subjects.length)
      .map((row, index) => ({ rank: index + 1, ...row }));
    return {
      type: "ranking_filter",
      metric: plan.ranking.metric,
      order: plan.ranking.order,
      complete_subject_coverage: true,
      evaluated_subject_count: plan.subjects.length,
      rows,
    };
  }

  if (plan.intent === "change_since") {
    const entry = riskObjects[0];
    if (
      !entry ||
      typeof entry.object.risk.previous_score !== "number" ||
      typeof entry.object.risk.delta !== "number"
    ) {
      throw new Error("CHANGE_ATTRIBUTION_NOT_DELIVERABLE");
    }
    return {
      type: "change_since",
      baseline: "previous_published",
      subject: entry.subject,
      risk_object_id: entry.object.object_id,
      previous_score: entry.object.risk.previous_score,
      current_score: entry.object.risk.score,
      delta: entry.object.risk.delta,
      direction: entry.object.risk.direction,
      drivers: entry.object.attribution.map((driver) => ({
        driver: driver.driver,
        previous_to_current_delta_contribution: driver.delta_contribution,
        current_score_contribution: driver.score_contribution,
        event_count: driver.event_count,
        weight: driver.weight,
      })),
      methodology_version: entry.object.methodology_version,
    };
  }

  if (plan.intent === "audit") {
    if (riskObjects.length !== plan.subjects.length) throw new Error("AUDIT_PRODUCT_NOT_DELIVERABLE");
    return {
      type: "audit",
      independently_verifiable: true,
      signed_object_count: riskObjects.length,
      objects: riskObjects.map(({ subject, object }) => ({
        subject,
        risk_object_id: object.object_id,
        methodology_version: object.methodology_version,
        calculation_hash: object.integrity.calculation_hash,
        data_hash: object.integrity.data_hash,
        input_hash: object.integrity.input_hash,
        payload_hash: object.integrity.payload_hash,
        signature_scheme: object.integrity.signature_scheme,
        signing_key_id: object.integrity.signing_key_id,
        verification_status: object.verification.status,
        commercial_eligibility_status: object.commercial_eligibility.status,
        ...publicRiskObjectAttestation({ subject, object }),
      })),
    };
  }

  if (plan.intent === "comparison") {
    return {
      type: "comparison",
      atomic_subject_coverage: true,
      compared_subject_count: plan.subjects.length,
      compared_modules: plan.required_modules,
      missing_subjects: [],
    };
  }

  if (plan.intent === "corridor") {
    return { type: "corridor", directional: true, subject: plan.subjects[0] };
  }

  if (plan.intent === "risk_gate") {
    return {
      type: "risk_gate",
      advisory_only: true,
      execution_authorized: false,
      action_context: plan.risk_gate_context,
    };
  }

  return { type: "single_subject", subject: plan.subjects[0] };
}

export async function assembleAgentQueryResponse(input: {
  plan: AgentQueryPlan;
  requestId: string;
  clientRequestId?: string | null;
  priceUsdc?: string | null;
}) {
  const { plan } = input;
  const structural = await Promise.all(plan.subjects.map((subject) => structuralSubject(plan, subject)));
  const includeRiskObject = plan.required_modules.includes("signed_risk_object");
  const includeRiskGate = plan.required_modules.includes("risk_gate");
  const includeHotTopics = plan.required_modules.includes("hot_topics");

  const riskObjects: LoadedRiskObject[] = includeRiskObject
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
  const publicHotTopics = hotTopics.map((result) => ({
    deliverable: result.deliverable,
    code: result.code,
    checked_at: result.checked_at,
    requested_families: result.requested_families,
    matched_families: result.matched_families,
    live_pipeline: {
      status: result.source_pipeline.status,
      last_success_at: result.source_pipeline.last_success_at,
      lag_seconds: result.source_pipeline.lag_seconds,
    },
    subject: result.subject,
    current_event_signal: result.current_event_signal,
    commercially_deliverable_event_count: result.commercially_deliverable_event_count,
    excluded_non_deliverable_event_count: result.excluded_non_deliverable_event_count,
    events: result.events.map((event) =>
      publicStructuralDevelopment({
        event_id: event.event_id,
        story_key: event.story_key,
        event_type: event.event_type,
        families: event.families,
        primary_country: event.primary_country,
        countries: event.countries,
        severity: event.severity,
        confidence: event.confidence,
        direction: event.direction,
        status: event.status,
        first_seen_at: event.first_seen_at,
        last_seen_at: event.last_seen_at,
        evidence_count: event.evidence_count,
        independent_source_count: event.independent_source_count,
        structure_version: event.structure_version,
        classification_version: event.classification_version,
      }),
    ),
    limitations: result.limitations,
  }));
  const currentStates = await buildCurrentState(plan, structural, riskObjects, hotTopics);
  const adaptiveAnalysis = intentAnalysis(plan, riskObjects);

  const core = {
    schema_version: GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
    product: GEOMACRO_INTELLIGENCE_PRODUCT_ID,
    request_id: input.requestId,
    client_request_id: input.clientRequestId ?? null,
    query_plan_hash: plan.query_plan_hash,
    question_interpretation: {
      normalized_question: plan.question_key,
      intent: plan.intent,
      topics: plan.topics,
      required_modules: plan.required_modules,
      ranking: plan.ranking,
      change: plan.change,
    },
    subjects: plan.subjects,
    as_of: plan.as_of ?? new Date().toISOString(),
    analysis: adaptiveAnalysis,
    structural: structural.map(({ stateVersionInputHash: _stateVersionInputHash, ...publicRow }) => publicRow),
    hot_topics: publicHotTopics,
    risk_gate: riskGates,
    signed_risk_objects: riskObjects.map(publicRiskObjectAttestation),
    gri_context: gri,
    current_state: currentStates,
    answer: buildDirectAnswer(
      plan,
      currentStates,
    ),
    methodology: {
      query_schema_version: plan.schema_version,
      response_schema_version: GEOMACRO_INTELLIGENCE_RESPONSE_SCHEMA,
      product_contract_version: GEOMACRO_INTELLIGENCE_CONTRACT_VERSION,
      pricing_phase: "EARLY_ADOPTION_10K",
      price_usdc:
        input.priceUsdc === undefined
          ? GEOMACRO_INTELLIGENCE_PRICE_USDC
          : input.priceUsdc,
      current_event_delivery: includeHotTopics ? "structured-derived-intelligence-only" : null,
      intent_method: "deterministic-governed-v1",
      ranking_metric: plan.ranking?.metric ?? null,
      change_baseline: plan.change?.baseline ?? null,
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
