import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { requireRiskSupabase } from "./risk-supabase.server";

export type CommercialEnvironment = "testnet" | "mainnet" | "fiat" | "sandbox" | "internal";
export type CommercialAccessSurface =
  | "public_web"
  | "free_api"
  | "paid_dashboard"
  | "commercial_api"
  | "agent_payment"
  | "institutional_integration"
  | "technical_proof";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

export function hashCommercialReference(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized ? sha256(normalized) : null;
}

export function requireCommercialOpsToken(suppliedValue: string | null | undefined) {
  const expected = String(process.env.COMMERCIAL_OPS_ADMIN_TOKEN ?? "").trim();
  const supplied = String(suppliedValue ?? "").trim();
  if (expected.length < 32 || supplied.length < 32) {
    throw new Response("Unauthorized", { status: 401 });
  }
  const expectedHash = Buffer.from(sha256(expected), "hex");
  const suppliedHash = Buffer.from(sha256(supplied), "hex");
  if (!timingSafeEqual(expectedHash, suppliedHash)) {
    throw new Response("Unauthorized", { status: 401 });
  }
}

export async function recordCommercialUsageEvent(input: {
  environment: CommercialEnvironment;
  access_surface: CommercialAccessSurface;
  principal_id?: string | null;
  principal_type?: string | null;
  entitlement_grant_id?: string | null;
  payment_event_id?: string | null;
  offer_id?: string | null;
  tier?: string | null;
  registry_version?: string | null;
  contract_version?: string | null;
  request_id: string;
  delivery_id?: string | null;
  capability: string;
  subject_type?: string | null;
  subject_key?: string | null;
  credits_charged?: number;
  credits_remaining?: number | null;
  idempotent_replay?: boolean;
  http_status?: number | null;
  latency_ms?: number | null;
  success: boolean;
  failure_code?: string | null;
  response_sha256?: string | null;
  response_bytes?: number | null;
  structural_observation_count?: number;
  evidence_reference_count?: number;
  independent_evidence_count?: number;
  history_item_count?: number;
  risk_object_id?: string | null;
  risk_object_version?: string | null;
  risk_object_signed?: boolean;
  risk_gate_included?: boolean;
  risk_gate_decision?: string | null;
  execution_authorized?: false;
  shareable?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("commercial_usage_events")
    .upsert(
      {
        ...input,
        credits_charged: input.credits_charged ?? 0,
        idempotent_replay: input.idempotent_replay ?? false,
        structural_observation_count: input.structural_observation_count ?? 0,
        evidence_reference_count: input.evidence_reference_count ?? 0,
        independent_evidence_count: input.independent_evidence_count ?? 0,
        history_item_count: input.history_item_count ?? 0,
        risk_object_signed: input.risk_object_signed ?? false,
        risk_gate_included: input.risk_gate_included ?? false,
        execution_authorized: false,
        shareable: input.shareable ?? false,
        metadata: input.metadata ?? {},
      },
      { onConflict: "principal_id,request_id,capability", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

export async function recordCommercialPaymentEvent(input: {
  environment: CommercialEnvironment;
  network_family: "evm" | "fiat" | "offchain" | "other";
  network_name?: string | null;
  chain_id?: string | null;
  provider: string;
  provider_environment?: string | null;
  payment_method: string;
  payment_status: string;
  revenue_classification: string;
  provider_order_id?: string | null;
  provider_payment_id?: string | null;
  provider_settlement_id?: string | null;
  invoice_id?: string | null;
  idempotency_key?: string | null;
  principal_id?: string | null;
  entitlement_grant_id?: string | null;
  offer_id?: string | null;
  tier?: string | null;
  asset_symbol?: string | null;
  asset_contract?: string | null;
  amount_atomic?: string | null;
  amount_decimal?: number | null;
  invoice_currency?: string | null;
  invoice_amount?: number | null;
  settlement_currency?: string | null;
  settlement_amount?: number | null;
  fee_currency?: string | null;
  provider_fee_amount?: number | null;
  geomacro_fee_amount?: number | null;
  payer_reference?: string | null;
  recipient_reference?: string | null;
  tx_hash?: string | null;
  block_number?: string | number | null;
  confirmations?: number | null;
  requested_at?: string | null;
  authorized_at?: string | null;
  settled_at?: string | null;
  failed_at?: string | null;
  refunded_at?: string | null;
  disputed_at?: string | null;
  failure_code?: string | null;
  reconciliation_status?: string;
  reconciliation_reference?: string | null;
  commercial_revenue?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const db = requireRiskSupabase();
  const row = {
    ...input,
    payer_reference: undefined,
    recipient_reference: undefined,
    payer_reference_hash: hashCommercialReference(input.payer_reference),
    recipient_reference_hash: hashCommercialReference(input.recipient_reference),
    reconciliation_status: input.reconciliation_status ?? "pending",
    commercial_revenue: input.environment === "testnet" ? false : input.commercial_revenue ?? false,
    metadata: input.metadata ?? {},
  };
  const { data, error } = await db
    .from("commercial_payment_events")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;
  return String(data.id);
}

export async function loadCommercialOpsDashboard(days = 30) {
  const db = requireRiskSupabase();
  const boundedDays = Math.max(1, Math.min(365, Math.trunc(days)));
  const since = new Date(Date.now() - boundedDays * 86_400_000).toISOString();

  const [usage, payments, recentUsage, recentPayments] = await Promise.all([
    db.from("commercial_ops_usage_rollup").select("*").gte("day", since).order("day", { ascending: false }),
    db.from("commercial_ops_payment_rollup").select("*").gte("day", since).order("day", { ascending: false }),
    db.from("commercial_usage_events").select("id,occurred_at,environment,access_surface,principal_id,principal_type,offer_id,tier,request_id,delivery_id,capability,subject_type,subject_key,credits_charged,credits_remaining,idempotent_replay,http_status,latency_ms,success,failure_code,response_sha256,response_bytes,structural_observation_count,evidence_reference_count,independent_evidence_count,history_item_count,risk_object_id,risk_object_version,risk_object_signed,risk_gate_included,risk_gate_decision,execution_authorized").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(250),
    db.from("commercial_payment_events").select("id,occurred_at,environment,network_family,network_name,chain_id,provider,provider_environment,payment_method,payment_status,revenue_classification,provider_order_id,provider_payment_id,provider_settlement_id,invoice_id,principal_id,entitlement_grant_id,offer_id,tier,asset_symbol,amount_decimal,invoice_currency,invoice_amount,settlement_currency,settlement_amount,fee_currency,provider_fee_amount,geomacro_fee_amount,tx_hash,block_number,confirmations,requested_at,authorized_at,settled_at,failed_at,refunded_at,disputed_at,failure_code,reconciliation_status,reconciliation_reference,commercial_revenue").gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(250),
  ]);

  for (const result of [usage, payments, recentUsage, recentPayments]) {
    if (result.error) throw result.error;
  }

  return {
    generated_at: new Date().toISOString(),
    window_days: boundedDays,
    usage_rollup: usage.data ?? [],
    payment_rollup: payments.data ?? [],
    recent_usage: recentUsage.data ?? [],
    recent_payments: recentPayments.data ?? [],
    boundaries: {
      upstream_news_source_identity_exposed: false,
      raw_request_body_exposed: false,
      raw_credentials_exposed: false,
      testnet_counts_as_commercial_revenue: false,
    },
  };
}

export async function publishCommercialProofSnapshot(input: {
  title: string;
  description?: string | null;
  period_started_at: string;
  period_ends_at: string;
  environment_scope: CommercialEnvironment[];
  expires_at?: string | null;
}) {
  const dashboard = await loadCommercialOpsDashboard(
    Math.max(1, Math.ceil((Date.parse(input.period_ends_at) - Date.parse(input.period_started_at)) / 86_400_000)),
  );
  const allowedEnvironments = new Set(input.environment_scope);
  const usage = dashboard.usage_rollup.filter((row: any) => allowedEnvironments.has(row.environment));
  const payments = dashboard.payment_rollup.filter((row: any) => allowedEnvironments.has(row.environment));

  const payload = {
    proof_version: "commercial-proof-v1",
    generated_at: new Date().toISOString(),
    period_started_at: input.period_started_at,
    period_ends_at: input.period_ends_at,
    environments: input.environment_scope,
    usage,
    payments,
    proof_boundaries: {
      customer_identity_disclosed: false,
      upstream_news_source_identity_disclosed: false,
      raw_request_payload_disclosed: false,
      raw_credentials_disclosed: false,
      testnet_is_commercial_revenue: false,
      mainnet_or_fiat_is_revenue_only_when_explicitly_classified: true,
    },
  };
  const payloadHash = sha256(stableJson(payload));
  const slug = `proof-${new Date().toISOString().slice(0, 10)}-${randomBytes(8).toString("hex")}`;
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("commercial_proof_snapshots")
    .insert({
      slug,
      title: input.title,
      description: input.description ?? null,
      period_started_at: input.period_started_at,
      period_ends_at: input.period_ends_at,
      environment_scope: input.environment_scope,
      published_at: new Date().toISOString(),
      expires_at: input.expires_at ?? null,
      status: "published",
      proof_version: "commercial-proof-v1",
      redaction_version: "public-redaction-v1",
      payload,
      payload_sha256: payloadHash,
    })
    .select("id,slug,title,published_at,expires_at,payload_sha256")
    .single();
  if (error) throw error;
  return data;
}

export async function loadPublishedCommercialProof(slug: string) {
  const db = requireRiskSupabase();
  const { data, error } = await db
    .from("commercial_proof_snapshots")
    .select("slug,title,description,period_started_at,period_ends_at,environment_scope,published_at,expires_at,proof_version,redaction_version,payload,payload_sha256")
    .eq("slug", slug)
    .eq("status", "published")
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return null;
  return {
    ...data,
    integrity: {
      payload_sha256_valid: sha256(stableJson(data.payload)) === data.payload_sha256,
    },
  };
}
