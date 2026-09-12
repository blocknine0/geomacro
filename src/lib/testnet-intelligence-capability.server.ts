import { createHash } from "node:crypto";

import { answerQuestion } from "./ask-intelligence.server";
import { demoPolicyFromPreset } from "./agentic-demo-contract";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { corridorSubjectId } from "./corridor-risk-engine";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import type { GeomacroRiskObject } from "./risk-object-contract";
import {
  getLatestCompatibleCorridorRiskObject,
  getLatestCompatibleCountryRiskObject,
  getRiskObjectByObjectId,
} from "./risk-object-store.server";
import { verifyPublicRiskObjectArtifact } from "./risk-object-verification.server";
import {
  loadStructuralContext,
  type StructuralObservation,
} from "./structural-context.server";
import { loadTestnetLiveSeverity } from "./testnet-live-severity.server";
import type {
  TestnetIntelligenceRequest,
  TestnetIntelligenceSubject,
} from "./testnet-intelligence-contract";

export type TestnetCapabilityDelivery = {
  data: Record<string, unknown>;
  subject_type: "query" | "global" | "country" | "corridor";
  subject_key: string;
  evidence_reference_count: number;
  structural_observation_count: number;
};

function sha256Json(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function subjectKey(subject: TestnetIntelligenceSubject | undefined) {
  if (!subject || subject.type === "global") return "GLOBAL";
  if (subject.type === "country") return subject.country_iso3.toUpperCase();
  return `${subject.origin_country_iso3.toUpperCase()}>${subject.destination_country_iso3.toUpperCase()}`;
}

function publicObservation(row: StructuralObservation) {
  return {
    observation_id: row.observation_id,
    source_id: row.source_id,
    source_record_id: row.source_record_id,
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
    normalized_hash: row.normalized_hash,
    retrieved_at: row.retrieved_at,
  };
}

function publicCoverage(row: {
  source_id: string;
  dimension: string;
  country_iso3: string | null;
  coverage_year: number | null;
  coverage_status: string;
  observation_count: number;
  latest_observed_at: string | null;
  updated_at: string;
}) {
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
}

function publicRiskObject(object: GeomacroRiskObject) {
  return {
    schema_version: object.schema_version,
    object_id: object.object_id,
    issuer: object.issuer,
    subject: object.subject,
    methodology_version: object.methodology_version,
    corridor_context: object.corridor_context ?? null,
    risk: object.risk,
    confidence: object.confidence,
    attribution: object.attribution,
    evidence: object.evidence.map((item) => ({
      event_id: item.event_id,
      title: item.title,
      event_type: item.event_type,
      severity: item.severity,
      confidence: item.confidence,
      direction: item.direction,
      last_seen_at: item.last_seen_at,
      evidence_count: item.evidence_count,
      independent_source_count: item.independent_source_count,
    })),
    evidence_coverage: object.evidence_coverage,
    evidence_summary: object.evidence_summary,
    provenance: object.provenance,
    verification: object.verification,
    commercial_eligibility: object.commercial_eligibility,
    integrity: object.integrity,
    generated_at: object.generated_at,
    expires_at: object.expires_at,
  };
}

async function loadVerifiedRiskObject(subject: Exclude<TestnetIntelligenceSubject, { type: "global" }>) {
  const object = subject.type === "country"
    ? await getLatestCompatibleCountryRiskObject(subject.country_iso3)
    : await getLatestCompatibleCorridorRiskObject(
        corridorSubjectId(subject.origin_country_iso3, subject.destination_country_iso3),
      );

  if (!object) throw new Error("SIGNED_RISK_OBJECT_UNAVAILABLE");
  const verification = verifyPublicRiskObjectArtifact(object);
  if (!verification.valid) throw new Error("SIGNED_RISK_OBJECT_NOT_VERIFIED");
  return { object, verification };
}

function publicGri(risk: Awaited<ReturnType<typeof readPublicGlobalRisk>>) {
  const changePoints =
    risk.previous === null ? null : risk.score - risk.previous;
  const generatedAtMs = Date.parse(risk.snapshotAsOf);
  const ageSeconds = Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.round((Date.now() - generatedAtMs) / 1000))
    : null;

  return {
    scope: "global",
    snapshot_id: risk.snapshotId,
    as_of: risk.snapshotAsOf,
    age_seconds: ageSeconds,
    display_score: risk.score,
    raw_score: risk.rawScore,
    previous_display_score: risk.previous,
    previous_raw_score: risk.previousRaw,
    change_points: changePoints,
    coverage: risk.coverage,
    weighted_confidence: risk.weightedConfidence,
    event_count: risk.eventCount,
    source_count: risk.sourceCount,
    independent_story_count: risk.independentStoryCount,
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
    reconciliation_residual: risk.reconciliationResidual,
    change_residual: risk.changeResidual,
    change_attribution: risk.drivers,
    top_driver: risk.topDriver,
  };
}

async function structuralData(
  request: TestnetIntelligenceRequest,
  observationLimit: number,
  evidenceLimit: number,
) {
  const subject = request.subject;
  if (!subject || subject.type === "global") throw new Error("SUBJECT_REQUIRED");

  const [context, severity] = await Promise.all([
    loadStructuralContext(subject),
    loadTestnetLiveSeverity(subject),
  ]);
  if (context.status === "NOT_CONFIGURED") throw new Error("STRUCTURAL_DATA_NOT_CONFIGURED");
  if (context.status === "UNAVAILABLE") throw new Error("STRUCTURAL_DATA_UNAVAILABLE");

  const digest = request.capability.endsWith("_digest");
  const effectiveObservationLimit = digest ? Math.min(3, observationLimit) : observationLimit;
  const observations = context.observations
    .slice(0, effectiveObservationLimit)
    .map(publicObservation);
  const coverage = context.metadata.coverage
    .slice(0, evidenceLimit)
    .map(publicCoverage);

  return {
    payload: {
      status: context.status,
      methodology_status: context.methodology_status,
      subject: context.subject,
      severity,
      observations,
      coverage,
      serving: {
        layer: context.metadata.serving_layer,
        warehouse_methodology_status: context.metadata.warehouse_methodology_status,
        composition_method: context.metadata.composition_method,
        route_modeling_status: context.metadata.route_modeling_status,
        direct_evidence_status: context.metadata.direct_evidence_status,
      },
      note: context.note,
    },
    observationCount: observations.length,
    evidenceCount: coverage.length,
  };
}

async function riskGateBundle(
  request: TestnetIntelligenceRequest,
  observationLimit: number,
  evidenceLimit: number,
) {
  const subject = request.subject;
  if (!subject || subject.type === "global") throw new Error("SUBJECT_REQUIRED");

  const actionContext: {
    action_type: string;
    currency: "USDC";
    amount?: number;
  } = {
    action_type: request.action_type,
    currency: "USDC",
  };
  if (request.amount_usdc !== undefined) actionContext.amount = request.amount_usdc;

  const policy = demoPolicyFromPreset(request.policy_preset);
  const result = subject.type === "country"
    ? await evaluateCountryRiskGate({
        request_id: request.request_id,
        country_iso3: subject.country_iso3,
        action_context: actionContext,
        policy,
      })
    : await evaluateCorridorRiskGate({
        request_id: request.request_id,
        origin_country_iso3: subject.origin_country_iso3,
        destination_country_iso3: subject.destination_country_iso3,
        action_context: actionContext,
        policy,
      });

  if (result.response.execution_authorized !== false) {
    throw new Error("RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
  }

  const stored = await getRiskObjectByObjectId(result.context.risk_object_id);
  if (!stored) throw new Error("SIGNED_RISK_OBJECT_UNAVAILABLE");
  const verification = verifyPublicRiskObjectArtifact(stored);
  if (!verification.valid) throw new Error("SIGNED_RISK_OBJECT_NOT_VERIFIED");

  const [structural, gri] = await Promise.all([
    structuralData(
      {
        ...request,
        capability:
          subject.type === "country"
            ? "structural_country_profile"
            : "structural_corridor_profile",
      },
      observationLimit,
      evidenceLimit,
    ),
    readPublicGlobalRisk(),
  ]);

  return {
    payload: {
      subject,
      action_context: actionContext,
      policy_preset: request.policy_preset,
      policy,
      risk_gate: result.response,
      risk_object: publicRiskObject(stored),
      risk_object_verification: verification,
      structural_context: structural.payload,
      gri_context: publicGri(gri),
      execution_authorized: false,
    },
    observationCount: structural.observationCount,
    evidenceCount: Math.max(structural.evidenceCount, stored.evidence.length),
  };
}

export async function runCanonicalTestnetIntelligence(input: {
  request: TestnetIntelligenceRequest;
  max_structural_observations: number;
  max_evidence_references: number;
}): Promise<TestnetCapabilityDelivery> {
  const { request } = input;

  if (request.capability === "intelligence_query") {
    const answer = await answerQuestion(request.question ?? "");
    const evidence = answer.evidence
      .slice(0, input.max_evidence_references)
      .map((row) => ({
        event_id: row.eventId,
        title: row.title,
        relevance: row.relevance,
      }));
    const data = {
      summary: answer.summary,
      what_changed: answer.what_changed,
      why_it_matters: answer.why_it_matters,
      geomacro_view: answer.geomacro_view,
      insufficient_evidence: answer.insufficient_evidence,
      mean_relevance: answer.mean_relevance,
      low_confidence: answer.low_confidence,
      gri: answer.gri,
      evidence,
      generated_at: answer.generatedAt,
      provenance: {
        source: "geomacro_stored_intelligence",
        external_web_search_used: false,
        external_llm_used: false,
        upstream_source_urls_exposed: false,
      },
    };
    return {
      data,
      subject_type: "query",
      subject_key: sha256Json(request.question ?? "").slice(0, 24),
      evidence_reference_count: evidence.length,
      structural_observation_count: 0,
    };
  }

  if (request.capability === "gri_read") {
    const risk = await readPublicGlobalRisk();
    return {
      data: publicGri(risk),
      subject_type: "global",
      subject_key: "GLOBAL",
      evidence_reference_count: risk.eventCount,
      structural_observation_count: 0,
    };
  }

  if (request.capability.startsWith("structural_")) {
    const structural = await structuralData(
      request,
      input.max_structural_observations,
      input.max_evidence_references,
    );
    const subject = request.subject;
    if (!subject || subject.type === "global") throw new Error("SUBJECT_REQUIRED");
    return {
      data: structural.payload,
      subject_type: subject.type,
      subject_key: subjectKey(subject),
      evidence_reference_count: structural.evidenceCount,
      structural_observation_count: structural.observationCount,
    };
  }

  if (request.capability === "signed_risk_object") {
    const subject = request.subject;
    if (!subject || subject.type === "global") throw new Error("SUBJECT_REQUIRED");
    const { object, verification } = await loadVerifiedRiskObject(subject);
    return {
      data: {
        risk_object: publicRiskObject(object),
        public_verification: verification,
        execution_authorized: false,
      },
      subject_type: subject.type,
      subject_key: subjectKey(subject),
      evidence_reference_count: object.evidence.length,
      structural_observation_count: 0,
    };
  }

  const bundle = await riskGateBundle(
    request,
    input.max_structural_observations,
    input.max_evidence_references,
  );
  const subject = request.subject;
  if (!subject || subject.type === "global") throw new Error("SUBJECT_REQUIRED");
  return {
    data: bundle.payload,
    subject_type: subject.type,
    subject_key: subjectKey(subject),
    evidence_reference_count: bundle.evidenceCount,
    structural_observation_count: bundle.observationCount,
  };
}
