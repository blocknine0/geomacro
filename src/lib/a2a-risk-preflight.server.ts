import { randomUUID } from "node:crypto";

import { demoPolicyFromPreset, type AgenticDemoRequest } from "./agentic-demo-contract";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import { loadStructuralContext } from "./structural-context.server";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import type { GeomacroRiskObject } from "./risk-object-contract";

function publicRiskObject(object: GeomacroRiskObject) {
  return {
    schema_version: object.schema_version,
    object_id: object.object_id,
    subject: object.subject,
    methodology_version: object.methodology_version,
    risk: object.risk,
    confidence: object.confidence,
    attribution: object.attribution,
    verification: object.verification,
    commercial_eligibility: object.commercial_eligibility,
    integrity: object.integrity,
    generated_at: object.generated_at,
    expires_at: object.expires_at,
  };
}

async function loadRiskObject(objectId: string) {
  const db = requireRiskSupabase();
  const result = await db
    .from("geomacro_risk_objects")
    .select("payload")
    .eq("object_id", objectId)
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.payload) throw new Error("A2A_SIGNED_RISK_OBJECT_UNAVAILABLE");
  return publicRiskObject(result.data.payload as GeomacroRiskObject);
}

async function loadGriContext() {
  try {
    const risk = await readPublicGlobalRisk();
    return {
      id: risk.snapshotId,
      as_of: risk.snapshotAsOf,
      display_score: risk.score,
      raw_score: risk.rawScore,
      previous_display_score: risk.previous,
      previous_raw_score: risk.previousRaw,
      change_points: risk.previous === null ? null : risk.score - risk.previous,
      coverage: risk.coverage,
      weighted_confidence: risk.weightedConfidence,
      event_count: risk.eventCount,
      source_count: risk.sourceCount,
      independent_story_count: risk.independentStoryCount,
      methodology_version: risk.methodologyVersion,
      proof_version: risk.proofVersion,
      proof_hash: risk.proofHash,
      verification_status: risk.verificationStatus,
      calculation_hash: risk.calculationHash,
      evidence_hash: risk.evidenceHash,
      input_hash: risk.inputHash,
      methodology_hash: risk.methodologyHash,
      disposition_hash: risk.dispositionHash,
      candidate_event_count: risk.candidateEventCount,
      reconciliation_residual: risk.reconciliationResidual,
      change_residual: risk.changeResidual,
    };
  } catch (error) {
    console.error("[a2a] canonical GRI context unavailable", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function runA2ARiskPreflight(
  input: AgenticDemoRequest,
  options: { requestId?: string } = {},
) {
  const requestId = options.requestId?.trim() || randomUUID();
  if (!requestId || requestId.length > 256) throw new Error("A2A_REQUEST_ID_INVALID");

  const policy = demoPolicyFromPreset(input.policy_preset);
  const actionContext: {
    action_type: string;
    currency: "USDC";
    amount?: number;
  } = {
    action_type: input.action_type,
    currency: "USDC",
  };
  if (input.amount_usdc !== undefined) actionContext.amount = input.amount_usdc;

  const evaluated =
    input.subject.type === "corridor"
      ? await evaluateCorridorRiskGate({
          request_id: requestId,
          origin_country_iso3: input.subject.origin_country_iso3,
          destination_country_iso3: input.subject.destination_country_iso3,
          action_context: actionContext,
          policy,
        })
      : await evaluateCountryRiskGate({
          request_id: requestId,
          country_iso3: input.subject.country_iso3,
          action_context: actionContext,
          policy,
        });

  if (evaluated.response.execution_authorized !== false) {
    throw new Error("A2A_EXECUTION_BOUNDARY_VIOLATED");
  }

  const [riskObject, structuralContext, griContext] = await Promise.all([
    loadRiskObject(evaluated.context.risk_object_id),
    loadStructuralContext(input.subject),
    loadGriContext(),
  ]);

  return {
    ok: true as const,
    protocol: "A2A" as const,
    protocol_version: "1.0" as const,
    skill: "risk_preflight" as const,
    request_id: requestId,
    client_request_id: input.client_request_id ?? null,
    action_context: actionContext,
    policy_preset: input.policy_preset,
    policy,
    risk_gate: evaluated.response,
    risk_object: riskObject,
    structural_context: structuralContext,
    gri_context: griContext,
    boundaries: {
      execution_authorized: false as const,
      financial_advice: false as const,
      wallet_custody: false as const,
      transaction_signing: false as const,
      raw_data_delivery: false as const,
      structural_evidence_is_not_silently_added_to_gri_v1_2: true as const,
      corridor_model:
        input.subject.type === "corridor" ? "directional endpoint-composed pilot" : null,
    },
  };
}

export function assertNoExecutionAuthorization(value: unknown, seen = new Set<object>()) {
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (seen.has(object)) return;
  seen.add(object);
  for (const [key, nested] of Object.entries(object)) {
    if (key === "execution_authorized" && nested === true) {
      throw new Error("A2A_EXECUTION_BOUNDARY_VIOLATED");
    }
    assertNoExecutionAuthorization(nested, seen);
  }
}
