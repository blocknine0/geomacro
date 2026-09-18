import { requireRiskSupabase } from "./risk-supabase.server";

export type TestnetDeveloperApiFunnelStage =
  | "request_received"
  | "request_validation"
  | "authentication"
  | "scope_authorization"
  | "availability_preflight"
  | "request_binding"
  | "payment"
  | "intelligence_delivery"
  | "completed";

export type TestnetDeveloperApiFunnelOutcome =
  | "started"
  | "passed"
  | "failed"
  | "required"
  | "skipped";

export async function recordTestnetDeveloperApiFunnelEvent(input: {
  attempt_id: string;
  principal_id?: string | null;
  key_id?: string | null;
  request_id?: string | null;
  capability?: string | null;
  subject_type?: string | null;
  subject_key?: string | null;
  stage: TestnetDeveloperApiFunnelStage;
  outcome: TestnetDeveloperApiFunnelOutcome;
  http_status?: number | null;
  error_code?: string | null;
  latency_ms?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const db = requireRiskSupabase();
    const { data, error } = await db
      .from("testnet_developer_api_funnel_events")
      .insert({
        ...input,
        key_id: input.key_id ?? null,
        request_id: input.request_id ?? null,
        capability: input.capability ?? null,
        subject_type: input.subject_type ?? null,
        subject_key: input.subject_key ?? null,
        http_status: input.http_status ?? null,
        error_code: input.error_code ?? null,
        latency_ms: input.latency_ms ?? null,
        metadata: input.metadata ?? {},
      })
      .select("id")
      .single();

    if (error) {
      console.error("[testnet-api-funnel] telemetry write failed", {
        stage: input.stage,
        outcome: input.outcome,
        error,
      });
      return null;
    }

    return data?.id ? String(data.id) : null;
  } catch (error) {
    console.error("[testnet-api-funnel] telemetry unavailable", {
      stage: input.stage,
      outcome: input.outcome,
      error,
    });
    return null;
  }
}
