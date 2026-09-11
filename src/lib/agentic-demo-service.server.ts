import { randomUUID } from "node:crypto";
import {
  agenticDemoRequestSchema,
  demoPolicyFromPreset,
  type AgenticDemoRequest,
} from "./agentic-demo-contract";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import { loadStructuralContext } from "./structural-context.server";
import { readPublicGlobalRisk } from "./global-risk-read.server";
import type { GeomacroRiskObject } from "./risk-object-contract";

export const DEMO_ALLOWED_COUNTRIES = ["USA", "CHN"] as const;
export const DEMO_ALLOWED_CORRIDORS = ["USA>CHN", "CHN>USA"] as const;

export type AgenticDemoRunOptions = {
  mode?: "PUBLIC_SANDBOX" | "X402_PAID" | "GOAT_X402_PAID";
  recordTelemetry?: boolean;
  /**
   * Optional server-controlled correlation ID. Commercial partner integrations
   * can reuse their durable request UUID so the paid order, Risk Gate audit and
   * delivered intelligence all share one traceable identity. Public callers do
   * not control this field through the API.
   */
  requestId?: string;
  payment?: {
    required: boolean;
    provider?: "circle_gateway_x402" | "goat_flow_x402";
    asset?: string;
    network?: string;
    amount_atomic?: string;
    amount_usdc?: string;
    payer?: string | null;
    settlement_reference?: string | null;
    note?: string;
  };
};

function assertSupportedDemoSubject(input: AgenticDemoRequest) {
  if (input.subject.type === "country") {
    if (
      !DEMO_ALLOWED_COUNTRIES.includes(
        input.subject.country_iso3 as (typeof DEMO_ALLOWED_COUNTRIES)[number],
      )
    ) {
      throw new Error(
        `Public demo currently supports country subjects: ${DEMO_ALLOWED_COUNTRIES.join(", ")}`,
      );
    }
    return;
  }

  const corridor = `${input.subject.origin_country_iso3}>${input.subject.destination_country_iso3}`;
  if (
    !DEMO_ALLOWED_CORRIDORS.includes(
      corridor as (typeof DEMO_ALLOWED_CORRIDORS)[number],
    )
  ) {
    throw new Error(
      `Public demo currently supports corridors: ${DEMO_ALLOWED_CORRIDORS.join(", ")}`,
    );
  }
}

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
  const { data, error } = await db
    .from("geomacro_risk_objects")
    .select("payload")
    .eq("object_id", objectId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.payload) throw new Error("Verified Risk Object payload unavailable");
  return publicRiskObject(data.payload as GeomacroRiskObject);
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
      change_points:
        risk.previous === null ? null : risk.score - risk.previous,
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
    console.error(
      "[agentic-demo] canonical GRI context unavailable",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function recordDemoTelemetry(input: {
  requestId: string;
  status: "delivered" | "delivery_failed";
  httpStatus: number;
  responseCode: string;
  externalAgentId: string;
}) {
  try {
    const db = requireRiskSupabase();
    await db.from("agent_api_requests").insert({
      id: input.requestId,
      capability: "risk_preflight_demo",
      external_agent_id: input.externalAgentId,
      status: input.status,
      http_status: input.httpStatus,
      response_code: input.responseCode,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[agentic-demo] telemetry insert failed", error);
  }
}

export async function runAgenticPreflightDemo(
  raw: unknown,
  options: AgenticDemoRunOptions = {},
) {
  const parsed = agenticDemoRequestSchema.parse(raw);
  assertSupportedDemoSubject(parsed);

  const requestId = options.requestId?.trim() || randomUUID();
  if (requestId.length < 1 || requestId.length > 256) {
    throw new Error("Server-controlled agentic request ID is invalid");
  }

  const policy = demoPolicyFromPreset(parsed.policy_preset);
  const mode = options.mode ?? "PUBLIC_SANDBOX";
  const shouldRecordTelemetry = options.recordTelemetry ?? true;
  const actionContext: {
    action_type: string;
    currency: "USDC";
    amount?: number;
  } = {
    action_type: parsed.action_type,
    currency: "USDC",
  };
  if (parsed.amount_usdc !== undefined) {
    actionContext.amount = parsed.amount_usdc;
  }

  try {
    const result =
      parsed.subject.type === "corridor"
        ? await evaluateCorridorRiskGate({
            request_id: requestId,
            origin_country_iso3: parsed.subject.origin_country_iso3,
            destination_country_iso3: parsed.subject.destination_country_iso3,
            action_context: actionContext,
            policy,
          })
        : await evaluateCountryRiskGate({
            request_id: requestId,
            country_iso3: parsed.subject.country_iso3,
            action_context: actionContext,
            policy,
          });

    if (result.response.execution_authorized !== false) {
      throw new Error("Risk Gate execution boundary violated");
    }

    const [riskObject, structuralContext, griContext] = await Promise.all([
      loadRiskObject(result.context.risk_object_id),
      loadStructuralContext(parsed.subject),
      loadGriContext(),
    ]);

    if (shouldRecordTelemetry) {
      await recordDemoTelemetry({
        requestId,
        status: "delivered",
        httpStatus: 200,
        responseCode:
          mode === "PUBLIC_SANDBOX"
            ? "DEMO_DELIVERED"
            : mode === "GOAT_X402_PAID"
              ? "GOAT_X402_DEMO_DELIVERED"
              : "X402_DEMO_DELIVERED",
        externalAgentId:
          mode === "PUBLIC_SANDBOX"
            ? "public_demo"
            : mode === "GOAT_X402_PAID"
              ? "goat_x402_agent"
              : "x402_agent",
      });
    }

    return {
      ok: true as const,
      demo_version: "agentic-commerce-demo-v2",
      request_id: requestId,
      client_request_id: parsed.client_request_id ?? null,
      mode,
      payment:
        options.payment ??
        ({
          required: false,
          note:
            "The browser sandbox is free. Partner-specific paid-agent integrations use separate governed payment rails.",
        } as const),
      action_context: actionContext,
      policy_preset: parsed.policy_preset,
      policy,
      risk_gate: result.response,
      risk_object: riskObject,
      structural_context: structuralContext,
      gri_context: griContext,
      boundaries: {
        execution_authorized: false as const,
        structural_evidence_is_not_gri_v1_2_input: true as const,
        corridor_model: "directional endpoint-composed pilot",
        route_modeling_status:
          parsed.subject.type === "corridor"
            ? structuralContext.metadata.route_modeling_status
            : null,
        financial_advice: false as const,
      },
    };
  } catch (error) {
    if (shouldRecordTelemetry) {
      await recordDemoTelemetry({
        requestId,
        status: "delivery_failed",
        httpStatus: 503,
        responseCode: "DEMO_FAILED_CLOSED",
        externalAgentId:
          mode === "GOAT_X402_PAID"
            ? "goat_x402_agent"
            : mode === "X402_PAID"
              ? "x402_agent"
              : "public_demo",
      });
    }
    throw error;
  }
}
