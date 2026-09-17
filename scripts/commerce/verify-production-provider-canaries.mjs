import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const PUBLIC_HOSTS = new Set(["geomacro.live", "www.geomacro.live"]);

const providers = [
  {
    key: "coinbase",
    canaryProvider: "coinbase_cdp_x402",
    reconciliationProvider: "coinbase_cdp_x402",
    canaryEnv: "GEOMACRO_COINBASE_CANARY_EVIDENCE",
    reconciliationEnv: "GEOMACRO_COINBASE_RECONCILIATION_EVIDENCE",
  },
  {
    key: "circle",
    canaryProvider: "circle_gateway_x402",
    reconciliationProvider: "circle_gateway_x402",
    canaryEnv: "GEOMACRO_CIRCLE_CANARY_EVIDENCE",
    reconciliationEnv: "GEOMACRO_CIRCLE_RECONCILIATION_EVIDENCE",
  },
  {
    key: "nevermined",
    canaryProvider: "nevermined_x402",
    reconciliationProvider: "nevermined_x402",
    canaryEnv: "GEOMACRO_NEVERMINED_CANARY_EVIDENCE",
    reconciliationEnv: "GEOMACRO_NEVERMINED_RECONCILIATION_EVIDENCE",
  },
];

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

async function jsonFile(file, label) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`${label} is unreadable or not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${label} must contain one JSON object`);
  }
  return parsed;
}

function assertHash(value, label) {
  const normalized = String(value ?? "").toLowerCase();
  if (!HASH.test(normalized)) fail(`${label} must be a sha256 digest`);
  return normalized;
}

function assertSha(value, label) {
  const normalized = String(value ?? "").toLowerCase();
  if (!SHA.test(normalized)) fail(`${label} must be a full canonical SHA`);
  return normalized;
}

function verifyCanary(e, provider) {
  if (e.schema_version !== "geomacro.production-provider-canary.v1") {
    fail(`${provider.key} canary schema mismatch`);
  }
  if (e.provider !== provider.canaryProvider) fail(`${provider.key} canary provider mismatch`);
  const sha = assertSha(e.canonical_sha, `${provider.key} canary canonical_sha`);
  const host = String(e.canary_host ?? "").trim().toLowerCase();
  if (!host || PUBLIC_HOSTS.has(host)) fail(`${provider.key} canary must use a non-public host`);
  if (e.public_production_host_used !== false) fail(`${provider.key} canary must prove public production host was not used`);
  if (e.paid_status !== 200 || e.replay_status !== 200) fail(`${provider.key} canary paid/replay status must both be 200`);
  if (e.settlement_proven !== true) fail(`${provider.key} canary settlement is not proven`);
  if (e.replay_no_second_charge !== true) fail(`${provider.key} canary did not prove zero second charge`);
  if (e.execution_authorized !== false) fail(`${provider.key} canary violated non-execution boundary`);
  if (e.private_key_persisted !== false) fail(`${provider.key} canary persisted private-key material`);
  if (e.raw_payment_proof_persisted !== false) fail(`${provider.key} canary persisted raw payment proof`);
  if (e.raw_settlement_reference_persisted_in_public_evidence !== false) {
    fail(`${provider.key} canary public evidence contains a raw settlement reference`);
  }
  const productHash = assertHash(e.delivered_product_hash, `${provider.key} delivered_product_hash`);
  const queryPlanHash = assertHash(e.query_plan_hash, `${provider.key} query_plan_hash`);
  const settlementHash = assertHash(
    e.settlement_reference_sha256,
    `${provider.key} settlement_reference_sha256`,
  );
  return { sha, host, productHash, queryPlanHash, settlementHash };
}

function verifyReconciliation(e, provider, canary) {
  if (e.schema_version !== "geomacro.production-payment-reconciliation.v1") {
    fail(`${provider.key} reconciliation schema mismatch`);
  }
  if (e.provider !== provider.reconciliationProvider) {
    fail(`${provider.key} reconciliation provider mismatch`);
  }
  if (!["mainnet", "fiat"].includes(e.environment)) {
    fail(`${provider.key} reconciliation is not production/mainnet/fiat evidence`);
  }
  if (
    e.payment_status !== "settled" ||
    e.reconciliation_status !== "matched" ||
    e.revenue_classification !== "non_revenue_internal" ||
    e.commercial_revenue !== false ||
    e.reconciliation_mode !== "internal_canary" ||
    e.internal_canary !== true
  ) {
    fail(`${provider.key} canary reconciliation did not reach matched non-revenue internal state`);
  }
  if (e.execution_authorized !== false) fail(`${provider.key} reconciliation violated non-execution boundary`);
  if (e.raw_settlement_reference_recorded_in_artifact !== false) {
    fail(`${provider.key} reconciliation artifact contains raw settlement reference`);
  }
  if (e.payer_identity_recorded_in_artifact !== false || e.secrets_recorded_in_artifact !== false) {
    fail(`${provider.key} reconciliation artifact exposes payer/secrets`);
  }
  const productHash = assertHash(e.delivered_product_hash, `${provider.key} reconciliation product hash`);
  const settlementHash = assertHash(
    e.settlement_reference_sha256,
    `${provider.key} reconciliation settlement hash`,
  );
  if (productHash !== canary.productHash) fail(`${provider.key} reconciliation product hash differs from buyer canary`);
  if (settlementHash !== canary.settlementHash) fail(`${provider.key} reconciliation settlement differs from buyer canary`);
  assertHash(e.response_sha256, `${provider.key} reconciliation response_sha256`);
}

async function main() {
  const expectedSha = assertSha(
    required("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA"),
    "GEOMACRO_PRODUCTION_ACCEPTANCE_SHA",
  );
  const rows = [];
  let sharedHost = null;

  for (const provider of providers) {
    const canaryPath = required(provider.canaryEnv);
    const reconciliationPath = required(provider.reconciliationEnv);
    const canaryEvidence = await jsonFile(canaryPath, `${provider.key} canary evidence`);
    const canary = verifyCanary(canaryEvidence, provider);
    if (canary.sha !== expectedSha) fail(`${provider.key} canary SHA differs from production acceptance SHA`);
    if (sharedHost === null) sharedHost = canary.host;
    else if (sharedHost !== canary.host) fail("Provider canaries did not run on the same isolated exact-SHA host");

    const reconciliationEvidence = await jsonFile(
      reconciliationPath,
      `${provider.key} reconciliation evidence`,
    );
    verifyReconciliation(reconciliationEvidence, provider, canary);

    rows.push({
      provider: provider.canaryProvider,
      canonical_sha: canary.sha,
      canary_host: canary.host,
      delivered_product_hash: canary.productHash,
      query_plan_hash: canary.queryPlanHash,
      settlement_reference_sha256: canary.settlementHash,
      paid_status: 200,
      replay_status: 200,
      replay_no_second_charge: true,
      reconciliation_status: "matched",
      revenue_classification: "non_revenue_internal",
      commercial_revenue: false,
      execution_authorized: false,
    });
  }

  if (rows.length !== 3) fail("Exactly three initial-cohort provider canaries are required");

  const result = {
    schema_version: "geomacro.production-canary-acceptance.v1",
    generated_at: new Date().toISOString(),
    canonical_sha: expectedSha,
    isolated_canary_host: sharedHost,
    initial_provider_cohort_complete: true,
    providers: rows,
    gates: {
      all_three_paid_canaries: true,
      settlement_proven: true,
      exact_intelligence_delivery_proven: true,
      same_proof_replay_zero_second_charge: true,
      accounting_reconciled: true,
      canaries_excluded_from_revenue: true,
      no_public_production_host_used_for_canary: true,
      execution_authorized: false,
    },
    real_money_canary_performed: true,
    public_launch_authorized_by_this_artifact: false,
  };

  const output =
    process.env.GEOMACRO_PRODUCTION_CANARY_ACCEPTANCE_OUTPUT?.trim() ||
    "artifacts/production-canary/initial-cohort-acceptance.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log("PASS: Coinbase + Circle + Nevermined production canary/reconciliation cohort verified.");
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
