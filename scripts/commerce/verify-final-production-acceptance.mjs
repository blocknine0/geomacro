import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]*$/;
const REPOSITORY = "blocknine0/geomacro";

function fail(message) { throw new Error(message); }
function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}
async function load(file, label) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is not a JSON object`);
    return value;
  } catch (error) {
    fail(`${label} is unreadable/invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function sameSha(e, expected, label) {
  if (String(e?.canonical_sha ?? "").toLowerCase() !== expected) fail(`${label} canonical SHA mismatch`);
}
async function strictClosureRun(runId, expectedSha) {
  const token = required("GITHUB_TOKEN");
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/actions/runs/${runId}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GeomacroProductionAcceptance/1.0",
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status !== 200) fail(`Strict closure GitHub run lookup returned HTTP ${response.status}`);
  const run = await response.json();
  if (run?.path !== ".github/workflows/p0-strict-prepublic-closure.yml") {
    fail("Referenced P0 run is not P0 Strict Prepublic Closure");
  }
  if (run?.event !== "workflow_dispatch" || run?.head_branch !== "main") {
    fail("Strict closure must be a manual main-branch execution");
  }
  if (String(run?.head_sha ?? "").toLowerCase() !== expectedSha) {
    fail("Strict closure run SHA differs from final production acceptance SHA");
  }
  if (run?.status !== "completed" || run?.conclusion !== "success") {
    fail(`Strict closure run is not successful: ${run?.status}/${run?.conclusion}`);
  }
  return {
    run_id: Number(runId),
    workflow_path: run.path,
    head_sha: String(run.head_sha).toLowerCase(),
    status: run.status,
    conclusion: run.conclusion,
    created_at: run.created_at ?? null,
    updated_at: run.updated_at ?? null,
  };
}

async function main() {
  const expectedSha = required("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA").toLowerCase();
  if (!SHA.test(expectedSha)) fail("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA must be a full SHA");

  const strictRunId = required("GEOMACRO_STRICT_CLOSURE_RUN_ID");
  if (!RUN_ID.test(strictRunId)) fail("GEOMACRO_STRICT_CLOSURE_RUN_ID must be numeric");
  const p0 = await strictClosureRun(strictRunId, expectedSha);

  const privateRevenueLedger = await load(
    required("GEOMACRO_PRIVATE_REVENUE_LEDGER_READINESS_EVIDENCE"),
    "Private revenue ledger production readiness",
  );
  if (
    privateRevenueLedger.schema_version !==
      "geomacro.private-revenue-ledger-production-readiness.v1" ||
    privateRevenueLedger.result !== "PASS" ||
    privateRevenueLedger.ready !== true ||
    privateRevenueLedger.project_ref !== "ldpwajisioljyjtojvfx" ||
    privateRevenueLedger.invalid_hash_chain_rows !== 0 ||
    privateRevenueLedger.access_boundaries?.public_select_allowed !== false ||
    privateRevenueLedger.access_boundaries?.anon_select_allowed !== false ||
    privateRevenueLedger.access_boundaries?.authenticated_select_allowed !== false ||
    privateRevenueLedger.access_boundaries?.service_role_select_allowed !== true ||
    privateRevenueLedger.access_boundaries?.service_role_insert_allowed !== false ||
    privateRevenueLedger.access_boundaries?.service_role_update_allowed !== false ||
    privateRevenueLedger.access_boundaries?.service_role_delete_allowed !== false
  ) {
    fail("Private real-revenue delivery ledger is not proven ready in production");
  }
  sameSha(privateRevenueLedger, expectedSha, "Private revenue ledger readiness");

  const canary = await load(
    required("GEOMACRO_CANARY_ACCEPTANCE_EVIDENCE"),
    "Provider canary acceptance",
  );
  if (
    canary.schema_version !== "geomacro.production-canary-acceptance.v1" ||
    canary.initial_provider_cohort_complete !== true ||
    canary.real_money_canary_performed !== true
  ) {
    fail("Provider canary cohort evidence is not complete");
  }
  sameSha(canary, expectedSha, "Provider canary");

  const safety = await load(
    required("GEOMACRO_COMMERCE_SAFETY_DRILL_ACCEPTANCE_EVIDENCE"),
    "Commerce safety drill",
  );
  if (
    safety.schema_version !== "geomacro.commerce-safety-drill-acceptance.v1" ||
    safety.result !== "PASS"
  ) {
    fail("Commerce freeze/quarantine drill is not PASS");
  }
  sameSha(safety, expectedSha, "Commerce safety drill");
  if (String(safety.canary_host ?? "") !== String(canary.isolated_canary_host ?? "")) {
    fail("Safety drill and real-money canaries did not use the same isolated host");
  }

  const prelisting = await load(
    required("GEOMACRO_PUBLIC_PRELISTING_HEALTH_EVIDENCE"),
    "Public production prelisting health",
  );
  if (
    prelisting.schema_version !== "geomacro.public-production-prelisting-health.v1" ||
    prelisting.result !== "PASS" ||
    prelisting.build_marker_match !== true ||
    prelisting.payment_performed_by_this_check !== false ||
    prelisting.settlement_performed_by_this_check !== false
  ) {
    fail("Public production prelisting exact-SHA health is not PASS evidence");
  }
  sameSha(prelisting, expectedSha, "Public production prelisting health");

  const submission = await load(
    required("GEOMACRO_MARKETPLACE_SUBMISSION_EVIDENCE"),
    "Marketplace submission evidence",
  );
  if (
    submission.schema_version !== "geomacro.marketplace-submission-acceptance.v1" ||
    submission.result !== "PASS" ||
    submission.gates?.circle_submission_evidenced !== true ||
    submission.gates?.nevermined_submission_evidenced !== true ||
    submission.gates?.coinbase_indexing_requires_observation !== true ||
    submission.gates?.listing_not_inferred_from_submission !== true ||
    submission.gates?.listing_not_inferred_from_payment !== true
  ) {
    fail("Marketplace submission/indexing handoff is not PASS evidence");
  }
  sameSha(submission, expectedSha, "Marketplace submission evidence");

  const marketplace = await load(
    required("GEOMACRO_MARKETPLACE_OBSERVATION_EVIDENCE"),
    "Marketplace observation",
  );
  if (
    marketplace.schema_version !== "geomacro.marketplace-observation-acceptance.v1" ||
    marketplace.result !== "PASS" ||
    marketplace.observations?.length !== 3 ||
    marketplace.gates?.exact_canonical_endpoint_observed_for_all !== true
  ) {
    fail("Initial marketplace listings are not all independently observed");
  }
  sameSha(marketplace, expectedSha, "Marketplace observation");

  const health = await load(
    required("GEOMACRO_POST_LISTING_HEALTH_EVIDENCE"),
    "Post-listing health",
  );
  if (
    health.schema_version !== "geomacro.post-listing-health.v1" ||
    health.result !== "PASS" ||
    health.build_marker_match !== true ||
    health.payment_performed_by_this_check !== false ||
    health.settlement_performed_by_this_check !== false
  ) {
    fail("Post-listing exact-SHA unpaid health is not PASS evidence");
  }
  sameSha(health, expectedSha, "Post-listing health");

  const requiredHealthGates = [
    "same_exact_sha_public",
    "no_charge_deliverability_passed",
    "coinbase_unpaid_402_passed",
    "circle_unpaid_402_passed",
    "nevermined_unpaid_402_passed",
    "runtime_price_network_asset_recipient_or_plan_validated",
    "all_initial_paid_providers_present_in_runtime_discovery",
  ];
  for (const gate of requiredHealthGates) {
    if (health.gates?.[gate] !== true) fail(`Post-listing health gate ${gate} is not PASS`);
  }

  const result = {
    schema_version: "geomacro.production-launch-final-acceptance.v1",
    generated_at: new Date().toISOString(),
    canonical_sha: expectedSha,
    strict_p0: p0,
    private_revenue_ledger_readiness_schema: privateRevenueLedger.schema_version,
    private_revenue_ledger_row_count: privateRevenueLedger.row_count,
    private_revenue_ledger_head_entry_sha256: privateRevenueLedger.head_entry_sha256,
    canary_acceptance_schema: canary.schema_version,
    commerce_safety_drill_schema: safety.schema_version,
    public_prelisting_health_schema: prelisting.schema_version,
    marketplace_submission_schema: submission.schema_version,
    marketplace_observation_schema: marketplace.schema_version,
    post_listing_health_schema: health.schema_version,
    gates: {
      strict_p0_closure: true,
      private_real_revenue_delivery_ledger_runtime_ready: true,
      private_revenue_ledger_append_only_and_hash_chain_verified: true,
      isolated_three_provider_real_money_canaries: true,
      payment_settlement_delivery_proven: true,
      exact_same_proof_replay_zero_second_charge: true,
      canary_accounting_reconciled_non_revenue: true,
      global_emergency_freeze_drilled: true,
      per_provider_quarantine_drilled: true,
      exact_same_sha_public_production: true,
      prelisting_unpaid_live_402_health: true,
      unpaid_live_402_health: true,
      marketplace_submission_or_indexing_handoff_evidenced: true,
      marketplace_indexing_or_listing_observed: true,
      post_listing_health_verified: true,
      execution_authorized: false,
    },
    public_launch_ready: true,
    canary_counted_as_revenue: false,
    revenue_claim_ready: false,
    revenue_claim_requirement:
      "A separate reconciled external_customer or independent_production_buyer purchase must pass geomacro.public-revenue-proof.v1.",
    automatic_public_marketing_authorized: false,
    owner_public_announcement_performed_by_this_check: false,
    result: "PASS",
  };

  const output =
    process.env.GEOMACRO_FINAL_PRODUCTION_ACCEPTANCE_OUTPUT?.trim() ||
    "artifacts/production-final-acceptance/final-acceptance.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log("PASS: Geomacro production launch acceptance chain is complete for the exact canonical SHA.");
  console.log("Revenue claim remains separately evidence-gated to a reconciled external/independent production purchase.");
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
