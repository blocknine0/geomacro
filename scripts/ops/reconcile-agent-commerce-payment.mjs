import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_ACK = "I_RECONCILE_VERIFIED_PRODUCTION_DELIVERY";
const PROD_PROJECT_REF = "ldpwajisioljyjtojvfx";

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

function assertUuid(value, label) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID`);
  }
  return value;
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

  const paymentEventId = assertUuid(required("GEOMACRO_PAYMENT_EVENT_ID"), "GEOMACRO_PAYMENT_EVENT_ID");
  const expectedSettlement = required("GEOMACRO_EXPECTED_SETTLEMENT_REFERENCE");
  if (expectedSettlement.length > 256) throw new Error("settlement reference is too long");
  const expectedResponseSha256 = assertSha(
    required("GEOMACRO_EXPECTED_RESPONSE_SHA256"),
    "GEOMACRO_EXPECTED_RESPONSE_SHA256",
  );
  const reconciliationReference = required("GEOMACRO_RECONCILIATION_REFERENCE");
  if (reconciliationReference.length < 8 || reconciliationReference.length > 180) {
    throw new Error("GEOMACRO_RECONCILIATION_REFERENCE must be 8..180 characters");
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: before, error: beforeError } = await db
    .from("commercial_payment_events")
    .select(
      "id,environment,provider,provider_environment,payment_status,revenue_classification,provider_settlement_id,asset_symbol,amount_atomic,reconciliation_status,commercial_revenue",
    )
    .eq("id", paymentEventId)
    .single();
  if (beforeError || !before) throw beforeError ?? new Error("payment event not found");

  if (!["mainnet", "fiat"].includes(before.environment)) {
    throw new Error("Only production payment events can be reconciled as revenue");
  }
  if (before.payment_status !== "settled") throw new Error("Payment event is not settled");
  if (String(before.provider_settlement_id ?? "") !== expectedSettlement) {
    throw new Error("Observed settlement reference does not match the payment ledger");
  }

  const { data: reconciled, error: reconcileError } = await db.rpc(
    "reconcile_agent_commerce_payment",
    {
      p_payment_event_id: paymentEventId,
      p_reconciliation_reference: reconciliationReference,
      p_expected_provider_settlement_id: expectedSettlement,
      p_expected_response_sha256: expectedResponseSha256,
    },
  );
  if (reconcileError) throw reconcileError;

  const result = Array.isArray(reconciled) ? reconciled[0] : reconciled;
  if (
    !result ||
    result.reconciliation_status !== "matched" ||
    result.revenue_classification !== "commercial_revenue" ||
    result.commercial_revenue !== true ||
    String(result.response_sha256 ?? "").toLowerCase() !== expectedResponseSha256
  ) {
    throw new Error("Production payment did not reach matched commercial-revenue state");
  }

  const { data: after, error: afterError } = await db
    .from("commercial_payment_events")
    .select(
      "id,environment,provider,provider_environment,payment_status,revenue_classification,reconciliation_status,reconciliation_reference,commercial_revenue",
    )
    .eq("id", paymentEventId)
    .single();
  if (afterError || !after) throw afterError ?? new Error("reconciled payment event disappeared");

  const evidence = {
    schema_version: "geomacro.production-payment-reconciliation.v1",
    generated_at: new Date().toISOString(),
    project_ref: PROD_PROJECT_REF,
    payment_event_id: paymentEventId,
    provider: after.provider,
    provider_environment: after.provider_environment,
    environment: after.environment,
    payment_status: after.payment_status,
    reconciliation_status: after.reconciliation_status,
    revenue_classification: after.revenue_classification,
    commercial_revenue: after.commercial_revenue,
    reconciliation_reference: after.reconciliation_reference,
    settlement_reference_sha256: sha256(expectedSettlement),
    response_sha256: expectedResponseSha256,
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
  console.log(`PASS: reconciled production payment ${paymentEventId} for provider ${after.provider}`);
  console.log(`Evidence: ${out}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
