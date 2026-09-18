import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const HASH = /^[0-9a-f]{64}$/;
const ALLOWED_PROVIDERS = new Set([
  "coinbase_cdp_x402",
  "circle_gateway_x402",
  "nevermined_x402",
]);
const EXTERNAL_CLASSES = new Set([
  "external_customer",
  "independent_production_buyer",
]);

function fail(message) { throw new Error(message); }
function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

async function main() {
  const file = required("GEOMACRO_PUBLIC_REVENUE_RECONCILIATION_EVIDENCE");
  let evidence;
  try {
    evidence = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`Revenue reconciliation evidence is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (evidence?.schema_version !== "geomacro.production-payment-reconciliation.v1") {
    fail("Revenue evidence schema mismatch");
  }
  if (!ALLOWED_PROVIDERS.has(String(evidence.provider ?? ""))) {
    fail("Revenue evidence provider is not in the approved production cohort");
  }
  if (!["mainnet", "fiat"].includes(evidence.environment)) {
    fail("Revenue evidence is not from a production payment environment");
  }
  if (
    evidence.payment_status !== "settled" ||
    evidence.reconciliation_status !== "matched" ||
    evidence.reconciliation_mode !== "commercial_revenue" ||
    evidence.internal_canary !== false ||
    evidence.revenue_classification !== "commercial_revenue" ||
    evidence.commercial_revenue !== true
  ) {
    fail("Revenue evidence has not reached matched commercial-revenue state");
  }
  if (!EXTERNAL_CLASSES.has(String(evidence.purchase_classification ?? ""))) {
    fail("Revenue evidence is not classified as an external/independent production purchase");
  }
  if (
    evidence.single_payment_event_for_settlement !== true ||
    Number(evidence.payment_event_count_for_settlement) !== 1
  ) {
    fail("Revenue evidence does not prove one unique payment event for the settlement");
  }
  if (!HASH.test(String(evidence.settlement_reference_sha256 ?? ""))) {
    fail("Revenue evidence settlement reference hash is invalid");
  }
  if (!HASH.test(String(evidence.response_sha256 ?? ""))) {
    fail("Revenue evidence response hash is invalid");
  }
  if (!HASH.test(String(evidence.delivered_product_hash ?? ""))) {
    fail("Revenue evidence delivered product hash is invalid");
  }
  if (
    evidence.raw_settlement_reference_recorded_in_artifact !== false ||
    evidence.payer_identity_recorded_in_artifact !== false ||
    evidence.secrets_recorded_in_artifact !== false ||
    evidence.execution_authorized !== false
  ) {
    fail("Revenue evidence violates privacy or non-execution boundaries");
  }

  const result = {
    schema_version: "geomacro.public-revenue-proof.v1",
    generated_at: new Date().toISOString(),
    provider: evidence.provider,
    environment: evidence.environment,
    payment_status: "settled",
    reconciliation_status: "matched",
    purchase_classification: evidence.purchase_classification,
    commercial_revenue: true,
    single_payment_event_for_settlement: true,
    payment_event_count_for_settlement: 1,
    settlement_reference_sha256: evidence.settlement_reference_sha256,
    response_sha256: evidence.response_sha256,
    delivered_product_hash: evidence.delivered_product_hash,
    customer_identity_disclosed: false,
    raw_payment_or_settlement_proof_disclosed: false,
    execution_authorized: false,
    claim_supported: "at_least_one_reconciled_external_or_independent_production_purchase",
    result: "PASS",
  };

  const output =
    process.env.GEOMACRO_PUBLIC_REVENUE_PROOF_OUTPUT?.trim() ||
    "artifacts/public-revenue-proof/revenue-proof.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log("PASS: reconciled external/independent production purchase supports a bounded revenue claim.");
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
