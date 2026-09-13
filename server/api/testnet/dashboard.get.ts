import { defineEventHandler, getQuery, setResponseHeaders } from "h3";

import { GEOMACRO_CREDIT_COSTS } from "../../../src/lib/commercial-access-contract";
import { requireRiskSupabase } from "../../../src/lib/risk-supabase.server";
import {
  STRUCTURED_PRODUCT_REGISTRY,
  STRUCTURED_TIER_REGISTRY,
} from "../../../src/lib/structured-data-entitlement-registry";
import {
  TESTNET_USDC_ACCESS_BOUNDARIES,
  TESTNET_USDC_ACCESS_CHAINS,
} from "../../../src/lib/testnet-usdc-access-contract";

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;
const RECENT_LIMIT = 30;

function numeric(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function boundedDays(value: unknown) {
  const parsed = Math.trunc(Number(value ?? DEFAULT_WINDOW_DAYS));
  if (!Number.isFinite(parsed)) return DEFAULT_WINDOW_DAYS;
  return Math.max(1, Math.min(MAX_WINDOW_DAYS, parsed));
}

function dayKey(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

type UsageBucket = {
  requests: number;
  successes: number;
  failures: number;
  credits: number;
  latencyWeighted: number;
  latencyWeight: number;
  signedRiskObjects: number;
  riskGateResponses: number;
};

function emptyUsageBucket(): UsageBucket {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    credits: 0,
    latencyWeighted: 0,
    latencyWeight: 0,
    signedRiskObjects: 0,
    riskGateResponses: 0,
  };
}

function addUsageRow(bucket: UsageBucket, row: Record<string, unknown>) {
  const requests = numeric(row.request_count);
  const averageLatency = numeric(row.avg_latency_ms);
  bucket.requests += requests;
  bucket.successes += numeric(row.success_count);
  bucket.failures += numeric(row.failure_count);
  bucket.credits += numeric(row.credits_charged);
  bucket.signedRiskObjects += numeric(row.signed_risk_object_count);
  bucket.riskGateResponses += numeric(row.risk_gate_count);
  if (requests > 0 && Number.isFinite(averageLatency)) {
    bucket.latencyWeighted += averageLatency * requests;
    bucket.latencyWeight += requests;
  }
}

function finishUsageBucket(bucket: UsageBucket) {
  return {
    request_count: bucket.requests,
    success_count: bucket.successes,
    failure_count: bucket.failures,
    success_rate_pct:
      bucket.requests > 0
        ? Number(((bucket.successes / bucket.requests) * 100).toFixed(2))
        : null,
    credits_charged: bucket.credits,
    avg_latency_ms:
      bucket.latencyWeight > 0
        ? Number((bucket.latencyWeighted / bucket.latencyWeight).toFixed(2))
        : null,
    signed_risk_object_count: bucket.signedRiskObjects,
    risk_gate_count: bucket.riskGateResponses,
  };
}

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
    "X-Content-Type-Options": "nosniff",
  });

  const days = boundedDays(getQuery(event).days);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = requireRiskSupabase();

  const [
    usageRollup,
    paymentRollup,
    recentUsage,
    recentPayments,
    registeredProfiles,
    activeProfiles,
    enabledCredentials,
    idempotentReplays,
    executionViolations,
  ] = await Promise.all([
    db
      .from("commercial_ops_usage_rollup")
      .select("day,access_surface,capability,request_count,success_count,failure_count,credits_charged,avg_latency_ms,signed_risk_object_count,risk_gate_count")
      .eq("environment", "testnet")
      .eq("tier", "testnet_tester")
      .gte("day", since)
      .order("day", { ascending: true }),
    db
      .from("commercial_ops_payment_rollup")
      .select("day,network_name,payment_status,asset_symbol,payment_count,asset_amount,reconciliation_mismatch_count")
      .eq("environment", "testnet")
      .eq("provider", "direct_testnet_usdc")
      .gte("day", since)
      .order("day", { ascending: true }),
    db
      .from("commercial_usage_events")
      .select("occurred_at,access_surface,capability,credits_charged,idempotent_replay,http_status,latency_ms,success,failure_code,risk_object_signed,risk_gate_included,execution_authorized")
      .eq("environment", "testnet")
      .eq("tier", "testnet_tester")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(RECENT_LIMIT),
    db
      .from("commercial_payment_events")
      .select("occurred_at,network_name,payment_status,asset_symbol,amount_decimal,confirmations,reconciliation_status,failure_code,commercial_revenue")
      .eq("environment", "testnet")
      .eq("provider", "direct_testnet_usdc")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .limit(RECENT_LIMIT),
    db
      .from("testnet_tester_profiles")
      .select("id", { count: "exact", head: true })
      .eq("registration_status", "complete")
      .not("wallet_verified_at", "is", null),
    db
      .from("testnet_tester_profiles")
      .select("id", { count: "exact", head: true })
      .eq("registration_status", "complete")
      .eq("access_status", "active")
      .is("suspended_at", null),
    db
      .from("testnet_developer_credentials")
      .select("id", { count: "exact", head: true })
      .eq("enabled", true)
      .is("revoked_at", null),
    db
      .from("commercial_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("environment", "testnet")
      .eq("tier", "testnet_tester")
      .eq("idempotent_replay", true)
      .gte("occurred_at", since),
    db
      .from("commercial_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("environment", "testnet")
      .eq("tier", "testnet_tester")
      .eq("execution_authorized", true)
      .gte("occurred_at", since),
  ]);

  for (const result of [
    usageRollup,
    paymentRollup,
    recentUsage,
    recentPayments,
    registeredProfiles,
    activeProfiles,
    enabledCredentials,
    idempotentReplays,
    executionViolations,
  ]) {
    if (result.error) throw result.error;
  }

  const overall = emptyUsageBucket();
  const daily = new Map<string, UsageBucket>();
  const capabilities = new Map<string, UsageBucket>();
  const surfaces = new Map<string, UsageBucket>();

  for (const sourceRow of usageRollup.data ?? []) {
    const row = sourceRow as Record<string, unknown>;
    addUsageRow(overall, row);

    const day = dayKey(row.day);
    if (day) {
      const bucket = daily.get(day) ?? emptyUsageBucket();
      addUsageRow(bucket, row);
      daily.set(day, bucket);
    }

    const capability = String(row.capability ?? "unknown");
    const capabilityBucket = capabilities.get(capability) ?? emptyUsageBucket();
    addUsageRow(capabilityBucket, row);
    capabilities.set(capability, capabilityBucket);

    const surface = String(row.access_surface ?? "unknown");
    const surfaceBucket = surfaces.get(surface) ?? emptyUsageBucket();
    addUsageRow(surfaceBucket, row);
    surfaces.set(surface, surfaceBucket);
  }

  const paymentByChain = new Map<
    string,
    { payment_count: number; settled_count: number; failed_count: number; amount_usdc: number; reconciliation_mismatches: number }
  >();
  let paymentCount = 0;
  let settledPaymentCount = 0;
  let failedPaymentCount = 0;
  let settledTestUsdc = 0;
  let reconciliationMismatches = 0;

  for (const sourceRow of paymentRollup.data ?? []) {
    const row = sourceRow as Record<string, unknown>;
    const network = String(row.network_name ?? "Unknown testnet");
    const status = String(row.payment_status ?? "unknown");
    const count = numeric(row.payment_count);
    const amount = numeric(row.asset_amount);
    const mismatches = numeric(row.reconciliation_mismatch_count);
    const bucket = paymentByChain.get(network) ?? {
      payment_count: 0,
      settled_count: 0,
      failed_count: 0,
      amount_usdc: 0,
      reconciliation_mismatches: 0,
    };

    bucket.payment_count += count;
    bucket.reconciliation_mismatches += mismatches;
    paymentCount += count;
    reconciliationMismatches += mismatches;

    if (status === "settled") {
      bucket.settled_count += count;
      bucket.amount_usdc += amount;
      settledPaymentCount += count;
      settledTestUsdc += amount;
    }
    if (status === "failed") {
      bucket.failed_count += count;
      failedPaymentCount += count;
    }
    paymentByChain.set(network, bucket);
  }

  const capabilityRows = [...capabilities.entries()]
    .map(([capability, bucket]) => ({
      capability,
      credit_cost:
        capability in GEOMACRO_CREDIT_COSTS
          ? GEOMACRO_CREDIT_COSTS[capability as keyof typeof GEOMACRO_CREDIT_COSTS]
          : null,
      ...finishUsageBucket(bucket),
    }))
    .sort((a, b) => b.request_count - a.request_count || a.capability.localeCompare(b.capability));

  const successfulCapabilities = capabilityRows.filter((row) => row.success_count > 0).length;
  const includedCapabilities = STRUCTURED_TIER_REGISTRY.testnet_tester.included_capabilities;

  return {
    ok: true,
    data: {
      generated_at: new Date().toISOString(),
      window: {
        days,
        started_at: since,
      },
      program: {
        environment: "testnet",
        identity_model: "wallet_first_eip4361",
        payment_model: "pay_per_call",
        payment_asset: "USDC",
        credit_price_testnet_usdc: numeric(TESTNET_USDC_ACCESS_BOUNDARIES.credit_price_usdc),
        max_credits_per_30_days: numeric(TESTNET_USDC_ACCESS_BOUNDARIES.credits_per_30_days),
        commercial_revenue: false,
        execution_authorized: false,
        supported_chains: Object.values(TESTNET_USDC_ACCESS_CHAINS).map((chain) => ({
          key: chain.key,
          name: chain.name,
          chain_id: chain.chain_id,
          explorer_url: chain.explorer_url,
        })),
        capabilities: includedCapabilities.map((capability) => ({
          capability,
          credit_cost: GEOMACRO_CREDIT_COSTS[capability],
          signed_output: STRUCTURED_PRODUCT_REGISTRY[capability].signed_output,
          risk_gate_output: STRUCTURED_PRODUCT_REGISTRY[capability].risk_gate_output,
        })),
      },
      overview: {
        verified_testers: registeredProfiles.count ?? 0,
        active_testers: activeProfiles.count ?? 0,
        enabled_developer_credentials: enabledCredentials.count ?? 0,
        ...finishUsageBucket(overall),
        capability_coverage: {
          passed: successfulCapabilities,
          total: includedCapabilities.length,
        },
        idempotent_replay_count: idempotentReplays.count ?? 0,
        execution_authorized_violation_count: executionViolations.count ?? 0,
        payment_event_count: paymentCount,
        settled_payment_count: settledPaymentCount,
        failed_payment_count: failedPaymentCount,
        settled_test_usdc: Number(settledTestUsdc.toFixed(6)),
        reconciliation_mismatch_count: reconciliationMismatches,
      },
      daily: [...daily.entries()].map(([day, bucket]) => ({ day, ...finishUsageBucket(bucket) })),
      by_capability: capabilityRows,
      by_surface: [...surfaces.entries()]
        .map(([surface, bucket]) => ({ surface, ...finishUsageBucket(bucket) }))
        .sort((a, b) => b.request_count - a.request_count || a.surface.localeCompare(b.surface)),
      by_chain: [...paymentByChain.entries()]
        .map(([network_name, value]) => ({ network_name, ...value, amount_usdc: Number(value.amount_usdc.toFixed(6)) }))
        .sort((a, b) => b.payment_count - a.payment_count || a.network_name.localeCompare(b.network_name)),
      recent_activity: (recentUsage.data ?? []).map((row) => ({
        occurred_at: row.occurred_at,
        access_surface: row.access_surface,
        capability: row.capability,
        credits_charged: row.credits_charged,
        idempotent_replay: row.idempotent_replay,
        http_status: row.http_status,
        latency_ms: row.latency_ms,
        success: row.success,
        failure_code: row.failure_code,
        risk_object_signed: row.risk_object_signed,
        risk_gate_included: row.risk_gate_included,
        execution_authorized: false,
      })),
      recent_payments: (recentPayments.data ?? []).map((row) => ({
        occurred_at: row.occurred_at,
        network_name: row.network_name,
        payment_status: row.payment_status,
        asset_symbol: row.asset_symbol,
        amount_decimal: row.amount_decimal,
        confirmations: row.confirmations,
        reconciliation_status: row.reconciliation_status,
        failure_code: row.failure_code,
        commercial_revenue: false,
      })),
      boundaries: {
        public_read_only: true,
        customer_identity_exposed: false,
        wallet_address_exposed: false,
        transaction_hash_exposed: false,
        request_id_exposed: false,
        subject_or_query_exposed: false,
        raw_credentials_exposed: false,
        raw_request_body_exposed: false,
        upstream_news_source_identity_exposed: false,
        testnet_counts_as_commercial_revenue: false,
      },
    },
  };
});
