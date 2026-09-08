import { randomUUID } from "node:crypto";
import { GRI_METHOD_VERSION } from "./gri-current-contract";
import {
  agenticDemoRequestSchema,
  demoPolicyFromPreset,
  type AgenticDemoRequest,
} from "./agentic-demo-contract";
import { evaluateCountryRiskGate } from "./risk-gate-service.server";
import { evaluateCorridorRiskGate } from "./corridor-risk-gate-service.server";
import { requireRiskSupabase } from "./risk-supabase.server";
import { loadStructuralContext } from "./structural-context.server";
import type { GeomacroRiskObject } from "./risk-object-contract";

export const DEMO_ALLOWED_COUNTRIES = ["USA", "CHN"] as const;
export const DEMO_ALLOWED_CORRIDORS = ["USA>CHN", "CHN>USA"] as const;

export type AgenticDemoRunOptions = {
  mode?: "PUBLIC_SANDBOX" | "X402_PAID";
  recordTelemetry?: boolean;
  payment?: {
    required: boolean;
    provider?: "circle_gateway_x402";
    asset?: "USDC";
    network?: "eip155:5042002";
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
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("gri_snapshots")
    .select(
      "id,as_of,display_score,raw_score,previous_display_score,previous_raw_score,change_points,coverage,weighted_confidence,event_count,source_count,independent_story_count,methodology_version,proof_version,proof_hash,verification_status,published_at",
    )
    .eq("status", "published")
    .eq("methodology_version", GRI_METHOD_VERSION)
    .order("as_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[agentic-demo] GRI context unavailable", error.message);
    return null;
  }

  return data ?? null;
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

  const requestId = randomUUID();
  const policy = demoPolicyFromPreset(parsed.policy_preset);
  const mode = options.mode ?? "PUBLIC_SANDBOX";
  const shouldRecordTelemetry = options.recordTelemetry ?? true;
  const actionContext = {
    action_type: parsed.action_type,
    amount: parsed.amount_usdc,
    currency: "USDC",
  };

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
          mode === "X402_PAID" ? "X402_DEMO_DELIVERED" : "DEMO_DELIVERED",
        externalAgentId: mode === "X402_PAID" ? "x402_agent" : "public_demo",
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
            "The browser sandbox is free. The separate agent endpoint demonstrates Circle x402 / USDC pay-per-call access on Arc Testnet.",
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
        externalAgentId: mode === "X402_PAID" ? "x402_agent" : "public_demo",
      });
    }
    throw error;
  }
}
