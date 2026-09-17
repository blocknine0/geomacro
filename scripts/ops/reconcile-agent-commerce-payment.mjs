import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ACK = "I_RECONCILE_VERIFIED_PRODUCTION_DELIVERY";
const PROD_PROJECT_REF = "ldpwajisioljyjtojvfx";
const PROVIDERS = new Set([
  "coinbase_cdp_x402",
  "circle_gateway_x402",
  "nevermined_x402",
]);

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function assertSha(value, label) {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be a sha256 hex digest`);
  return value.toLowerCase();
}

async function main() {
  if (required("GEOMACRO_PRODUCTION_RECONCILIATION_ACK") !== REQUIRED_ACK) {
    throw new Error(`Refusing reconciliation without exact acknowledgement ${REQUIRED_ACK}`);
  }

  const url = required("APP_SUPABASE_URL");
  const key = required("APP_SUPABASE_SERVICE_ROLE_KEY");
  const target = new URL(url);
  const projectRef = target.hostname.split(".")[0];
  if (target.protocol !== "https:" || projectRef !== PROD_PROJECT_REF) {
    throw new Error("Production reconciliation must target the authoritative Geomacro Supabase project");
  }

  const provider = required("GEOMACRO_PAYMENT_PROVIDER");
  if (!PROVIDERS.has(provider)) throw new Error("GEOMACRO_PAYMENT_PROVIDER is not an approved production agent-commerce provider");

  const mode = required("GEOMACRO_RECONCILIATION_MODE");
  if (!["internal_canary", "commercial_revenue"].includes(mode)) {
    throw new Error("GEOMACRO_RECONCILIATION_MODE must be internal_canary or commercial_revenue");
  }
  const internalCanary = mode === "internal_canary";
  const purchaseClassification = required("GEOMACRO_PURCHASE_CLASSIFICATION");
  const allowedClassifications = new Set([
    "internal_canary",
    "external_customer",
    "independent_production_buyer",
  ]);
  if (!allowedClassifications.has(purchaseClassification)) {
    throw new Error("Unsupported GEOMACRO_PURCHASE_CLASSIFICATION");
  }
  if (internalCanary && purchaseClassification !== "internal_canary") {
    throw new Error("internal_canary reconciliation requires purchase classification internal_canary");
  }
  if (
    !internalCanary &&
    !["external_customer", "independent_production_buyer"].includes(
      purchaseClassification,
    )
  ) {
    throw new Error("commercial_revenue reconciliation requires an external or independent production buyer");
  }

  const expectedSettlement = required("GEOMACRO_EXPECTED_SETTLEMENT_REFERENCE");
  if (expectedSettlement.length > 256) throw new Error("settlement reference is too long");

  const expectedDeliveredProductHash = assertSha(
    required("GEOMACRO_EXPECTED_DELIVERED_PRODUCT_HASH"),
    "GEOMACRO_EXPECTED_DELIVERED_PRODUCT_HASH",
  );

  const reconciliationReference = required("GEOMACRO_RECONCILIATION_REFERENCE");
  if (reconciliationReference.length < 8 || reconciliationReference.length > 180) {
    throw new Error("GEOMACRO_RECONCILIATION_REFERENCE must be 8..180 characters");
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: payments, error: paymentError } = await db
    .from("commercial_payment_events")
    .select(
      "id,environment,provider,provider_environment,payment_status,revenue_classification,provider_settlement_id,asset_symbol,amount_atomic,reconciliation_status,commercial_revenue",
    )
    .eq("provider", provider)
    .eq("provider_settlement_id", expectedSettlement)
    .order("occurred_at", { ascending: false })
    .limit(2);
  if (paymentError) throw paymentError;
  if (!Array.isArray(payments) || payments.length !== 1) {
    throw new Error(`Expected exactly one payment event for the observed settlement; found ${payments?.length ?? 0}`);
  }
  const before = payments[0];

  if (!["mainnet", "fiat"].includes(before.environment)) {
    throw new Error("Only production payment events can be reconciled as revenue");
  }
  if (before.payment_status !== "settled") throw new Error("Payment event is not settled");
  if (String(before.provider_settlement_id ?? "") !== expectedSettlement) {
    throw new Error("Observed settlement reference does not match the payment ledger");
  }

  const { data: usageRows, error: usageError } = await db
    .from("commercial_usage_events")
    .select("response_sha256,success,execution_authorized,access_surface")
    .eq("payment_event_id", before.id)
    .eq("success", true)
    .eq("access_surface", "agent_payment")
    .eq("execution_authorized", false)
    .limit(10);
  if (usageError) throw usageError;

  const responseHashes = [
    ...new Set(
      (usageRows ?? [])
        .map((row) => String(row.response_sha256 ?? "").toLowerCase())
        .filter((value) => /^[0-9a-f]{64}$/.test(value)),
    ),
  ];
  if (responseHashes.length !== 1) {
    throw new Error(`Expected one unambiguous delivered response hash; found ${responseHashes.length}`);
  }
  const expectedResponseSha256 = responseHashes[0];

  const { data: reconciled, error: reconcileError } = await db.rpc(
    "reconcile_agent_commerce_payment",
    {
      p_payment_event_id: before.id,
      p_reconciliation_reference: reconciliationReference,
      p_expected_provider_settlement_id: expectedSettlement,
      p_expected_response_sha256: expectedResponseSha256,
      p_expected_delivered_product_hash: expectedDeliveredProductHash,
      p_internal_canary: internalCanary,
      p_purchase_classification: purchaseClassification,
    },
  );
  if (reconcileError) throw reconcileError;

  const result = Array.isArray(reconciled) ? reconciled[0] : reconciled;
  const expectedClassification = internalCanary
    ? "non_revenue_internal"
    : "commercial_revenue";
  const expectedCommercialRevenue = !internalCanary;
  if (
    !result ||
    result.reconciliation_status !== "matched" ||
    result.revenue_classification !== expectedClassification ||
    result.commercial_revenue !== expectedCommercialRevenue ||
    String(result.response_sha256 ?? "").toLowerCase() !== expectedResponseSha256
  ) {
    throw new Error("Production payment did not reach the expected matched accounting state");
  }

  const { data: after, error: afterError } = await db
    .from("commercial_payment_events")
    .select(
      "id,environment,provider,provider_environment,payment_status,revenue_classification,reconciliation_status,reconciliation_reference,commercial_revenue",
    )
    .eq("id", before.id)
    .single();
  if (afterError || !after) throw afterError ?? new Error("reconciled payment event disappeared");

  const evidence = {
    schema_version: "geomacro.production-payment-reconciliation.v1",
    generated_at: new Date().toISOString(),
    project_ref: PROD_PROJECT_REF,
    payment_event_id: before.id,
    provider: after.provider,
    provider_environment: after.provider_environment,
    environment: after.environment,
    payment_status: after.payment_status,
    reconciliation_status: after.reconciliation_status,
    revenue_classification: after.revenue_classification,
    commercial_revenue: after.commercial_revenue,
    reconciliation_mode: mode,
    internal_canary: internalCanary,
    purchase_classification: purchaseClassification,
    reconciliation_reference: after.reconciliation_reference,
    settlement_reference_sha256: sha256(expectedSettlement),
    response_sha256: expectedResponseSha256,
    delivered_product_hash: expectedDeliveredProductHash,
    delivery_id: result.delivery_id,
    raw_settlement_reference_recorded_in_artifact: false,
    payer_identity_recorded_in_artifact: false,
    secrets_recorded_in_artifact: false,
    execution_authorized: false,
  };

  const out =
    process.env.GEOMACRO_RECONCILIATION_EVIDENCE_PATH?.trim() ||
    "artifacts/production-reconciliation/reconciliation.json";
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  console.log(`PASS: reconciled production payment ${before.id} for provider ${after.provider} as ${mode}`);
  console.log(`Evidence: ${out}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
