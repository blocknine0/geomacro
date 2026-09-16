import type { CoinbaseX402Config } from "./coinbase-x402.server";
import { commerceReferenceHash } from "./agent-commerce-delivery.server";
import { requireRiskSupabase } from "./risk-supabase.server";

export async function upsertCoinbaseX402ProductAudit(input: {
  requestId: string;
  clientRequestId?: string | null;
  paymentFingerprint: string;
  queryPlanHash: string;
  productId: string;
  deliveredProductHash?: string | null;
  settlementTx?: string | null;
  status: "prepared" | "settled" | "delivered" | "manual_review" | "failed";
  reconciliationStatus?: string;
  config: CoinbaseX402Config;
}) {
  const db = requireRiskSupabase();
  const now = new Date().toISOString();
  const row = {
    request_id: input.requestId,
    // Caller-chosen IDs can contain private workflow names. Keep only a stable
    // one-way reference so support/reconciliation can correlate without storing
    // the caller's raw identifier.
    client_request_id: commerceReferenceHash(input.clientRequestId),
    payment_fingerprint_sha256: input.paymentFingerprint,
    query_plan_hash: input.queryPlanHash,
    product_id: input.productId,
    delivered_product_hash: input.deliveredProductHash ?? null,
    environment: input.config.commercialEnvironment,
    network: input.config.network,
    asset: input.config.asset,
    amount_atomic: input.config.amountAtomic,
    settlement_tx: input.settlementTx ?? null,
    status: input.status,
    reconciliation_status:
      input.reconciliationStatus ??
      (input.config.commercialEnvironment === "testnet" ? "not_applicable" : "pending"),
    prepared_at: input.status === "prepared" ? now : undefined,
    settled_at: input.status === "settled" || input.status === "delivered" ? now : undefined,
    delivered_at: input.status === "delivered" ? now : undefined,
    updated_at: now,
  };

  const { error } = await db
    .from("coinbase_x402_product_audit")
    .upsert(row, { onConflict: "payment_fingerprint_sha256" });
  if (error) throw error;
}
