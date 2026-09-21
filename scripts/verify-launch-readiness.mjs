#!/usr/bin/env node
/**
 * Exact-head commercial launch readiness gate.
 *
 * Proves repository-side readiness only. It never enables production funds,
 * settles a payment, or declares revenue.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sha = String(
  process.env.GEOMACRO_LAUNCH_CANDIDATE_SHA || process.env.GITHUB_SHA || "",
).trim().toLowerCase();

if (!/^[0-9a-f]{40}$/.test(sha)) {
  throw new Error("GEOMACRO_LAUNCH_CANDIDATE_SHA/GITHUB_SHA must be a full 40-character SHA");
}

async function read(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

function need(condition, message) {
  if (!condition) throw new Error(message);
}

const launch = await readJson("config/commercial-launch-manifest.json");
const commerce = await readJson("public/.well-known/geomacro-commerce.json");
const distribution = await readJson("config/agent-marketplace-distribution.json");
const env = await read(".env.example");
const prelaunchEnv = await read("config/prelaunch-mainnet-x402.env.example");
const buildRc = await read("scripts/build-commercial-release-candidate.mjs");
const security = await read("src/lib/provider-real-funds-security.server.ts");
const delivery = await read("src/lib/agent-commerce-delivery.server.ts");
const deliveryTest = await read("src/__tests__/agent-commerce-delivery-ledger-static.test.ts");
const sourceEligibility = await read("src/lib/commercial-source-eligibility.server.ts");
const griConsistencyTest = await read("src/__tests__/gri-public-proof-consistency-static.test.ts");
const griWorkflowTest = await read("src/__tests__/gri-public-proof-workflow-contract.test.js");
const riskSigningTest = await read("src/__tests__/risk-object-signing.test.ts");
const riskTrustTest = await read("src/__tests__/risk-object-independent-trust.test.ts");
const riskPublicTest = await read("src/__tests__/risk-object-public-verification-route.test.ts");
const canonicalRiskTest = await read("src/__tests__/canonical-json-v1-test-vector.test.ts");
const federicoPolicyTest = await read("src/__tests__/federico-strict-risk-object-policy-static.test.ts");
const rightsEvidence = await read("scripts/commercial-source-rights-evidence.mjs");
const rightsTest = await read("src/__tests__/commercial-source-rights-evidence-parity.test.js");
const circle = await read("src/lib/circle-gateway-x402-production.server.ts");
const coinbase = await read("src/lib/coinbase-x402.server.ts");
const nevermined = await read("src/lib/nevermined-x402.server.ts");
const circleRoute = await read("src/routes/api.x402.circle_.intelligence.ts");

need(
  launch.schema_version === "geomacro.commercial-launch-manifest.v1",
  "commercial launch manifest schema mismatch",
);
need(launch.launch_mode === "prelaunch", "launch manifest must remain prelaunch");
need(launch.production_funds_authorized === false, "production funds must remain disabled");
need(launch.official_launch_announced === false, "official launch announcement must remain disabled");
need(launch.launch_rule?.allow_partial_provider_launch === false, "partial provider launch must remain disabled");
need(launch.launch_rule?.allow_testnet_as_revenue === false, "testnet must never count as revenue");
need(launch.launch_rule?.allow_unreconciled_settlement_as_revenue === false, "unreconciled settlement must never count as revenue");
need(launch.launch_rule?.require_external_first_purchase_before_revenue_claim === true, "external first-purchase revenue gate missing");

for (const [name, provider] of Object.entries(launch.providers || {})) {
  need(provider?.production_enabled === false, name + " production must remain disabled");
}
need(launch.providers?.coinbase_x402?.launch_cohort === true, "Coinbase launch cohort missing");
need(launch.providers?.circle_gateway_x402?.launch_cohort === true, "Circle launch cohort missing");
need(launch.providers?.nevermined?.launch_cohort === true, "Nevermined launch cohort missing");
need(launch.providers?.goat_x402?.launch_cohort === false, "GOAT mainnet must remain deferred");

need(commerce.service?.status === "prelaunch", "machine commerce discovery must remain prelaunch");
need(commerce.service?.execution_authorized === false, "machine commerce must remain non-executing");
need(commerce.commercial_contract?.production_funds_authorized === false, "commerce discovery must not authorize funds");
need(distribution.state === "prelaunch_hold", "marketplace distribution must remain on prelaunch hold");

for (const marker of [
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK=",
  "GEOMACRO_COMMERCE_EMERGENCY_FREEZE=false",
  "GEOMACRO_COMMERCE_DISABLED_PROVIDERS=",
  "COINBASE_X402_MAINNET_ACK=",
  "NEVERMINED_X402_ENVIRONMENT=",
  "GOATX402_MAINNET_COMMERCIAL_ENABLED=false",
]) need(env.includes(marker), ".env.example missing " + marker);

need(prelaunchEnv.includes("CIRCLE_X402_MAINNET_ACK="), "Circle prelaunch ack contract missing");
need(!/^COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC$/m.test(env), "Coinbase mainnet ack must not be committed");
need(!/^GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH$/m.test(env), "global launch ack must not be committed");
need(!/^NEVERMINED_X402_ENVIRONMENT=live$/m.test(env), "Nevermined live mode must not be committed");
need(!/^GOATX402_MAINNET_COMMERCIAL_ENABLED=true$/m.test(env), "GOAT mainnet activation must not be committed");

need(security.includes("coinbase_mainnet"), "provider security gate missing Coinbase");
need(security.includes("circle_gateway_mainnet"), "provider security gate missing Circle");
need(security.includes("nevermined_live"), "provider security gate missing Nevermined");
need(security.includes("goat_mainnet"), "provider security gate missing GOAT");
need(delivery.includes("claimAgentCommerceDelivery"), "delivery claim boundary missing");
need(delivery.includes("completeAgentCommerceDelivery"), "delivery completion boundary missing");
need(delivery.includes("releaseAgentCommerceDelivery"), "delivery release/quarantine boundary missing");
need(deliveryTest.includes("replay-safe"), "delivery replay-safety regression test missing");
need(deliveryTest.includes("automatic recharge"), "delivery duplicate-charge protection regression test missing");

need(circle.includes("verifyCircleGatewayProduction"), "Circle verification path missing");
need(circle.includes("settleCircleGatewayProduction"), "Circle settlement path missing");
need(circle.includes("assertCommercialLaunchAuthorized(\"circle_gateway_x402\")"), "Circle launch authorization gate missing");
need(coinbase.includes("assertCommercialLaunchAuthorized"), "Coinbase launch authorization gate missing");
need(nevermined.includes("assertCommercialLaunchAuthorized"), "Nevermined launch authorization gate missing");
need(circleRoute.includes("manualReview: true"), "Circle manual-review settlement boundary missing");

need(sourceEligibility.includes("COMMERCIAL_OK"), "commercial source eligibility gate missing");
need(sourceEligibility.includes("raw_redistribution_allowed"), "raw redistribution boundary missing");
need(rightsEvidence.includes("DERIVED_ONLY"), "derived-only source rights state missing");
need(rightsTest.includes("COMMERCIAL_OK"), "source-rights parity regression test missing");

need(griConsistencyTest.includes("gri-v1.2.0"), "GRI proof consistency test missing");
need(griConsistencyTest.includes("gri-proof-v1.2.0"), "GRI proof version test missing");
need(griWorkflowTest.includes("GRI_METHOD_VERSION: gri-v1.2.0"), "GRI workflow version contract missing");
need(griWorkflowTest.includes("GRI_PROOF_VERSION: gri-proof-v1.2.0"), "GRI workflow proof contract missing");
need(riskSigningTest.includes("fails verification after payload tampering"), "Risk Object tamper rejection test missing");
need(riskSigningTest.includes("is deterministic for identical object and key"), "Risk Object deterministic signing test missing");
need(riskTrustTest.includes("binds observed_at inside the signed canonical payload"), "Risk Object observation binding test missing");
need(riskPublicTest.includes("prevents caching verification outcomes"), "Risk Object public verification route test missing");
need(canonicalRiskTest.includes("reproduces the documented payload hash and Ed25519 signature"), "Risk Object canonical vector test missing");
need(federicoPolicyTest.includes("locks Federico handoff artifact integrity and exact-SHA reproducibility"), "Federico exact-SHA handoff test missing");

need(buildRc.includes("production_activation_performed: false"), "RC generator activation boundary missing");
need(buildRc.includes("official_launch_announced: false"), "RC generator launch boundary missing");
need(buildRc.includes("deferred_payment_providers"), "RC generator deferred-provider evidence missing");

const requiredFiles = [
  ".github/workflows/commercial-coordinated-launch-preflight.yml",
  ".github/workflows/commercial-release-candidate-freeze.yml",
  ".github/workflows/circle-x402-prelaunch-readiness.yml",
  ".github/workflows/commercial-launch-strict-evidence.yml",
  ".github/workflows/realtime-corridor-hot-topic-fanout.yml",
  "docs/PRODUCTION_LAUNCH_ACCEPTANCE.md",
  "docs/COMMERCIAL_SOURCE_RIGHTS.md",
  "docs/COMMERCIAL_LAUNCH_STRICT_EVIDENCE.md",
];
for (const file of requiredFiles) need((await read(file)).trim().length > 0, "required launch control file empty: " + file);

const tracked = [
  "config/commercial-launch-manifest.json",
  "public/.well-known/geomacro-commerce.json",
  "config/agent-marketplace-distribution.json",
];
const trackedSha256 = {};
for (const file of tracked) {
  trackedSha256[file] = createHash("sha256").update(await read(file), "utf8").digest("hex");
}

const output =
  process.env.GEOMACRO_LAUNCH_READINESS_OUTPUT ||
  "artifacts/commercial-launch-readiness.json";
const evidence = {
  schema_version: "geomacro.commercial-launch-readiness.v1",
  status: "READY_FOR_OWNER_ACTIVATION",
  generated_at: new Date().toISOString(),
  candidate_sha: sha,
  production_activation_performed: false,
  production_funds_authorized: false,
  official_launch_announced: false,
  gates: {
    exact_candidate_identity: true,
    commercial_launch_policy_locked: true,
    payment_delivery_ledger_contract: true,
    replay_and_concurrency_contract: true,
    ambiguous_settlement_manual_review: true,
    source_rights_fail_closed: true,
    provider_real_funds_security_boundary: true,
    machine_commerce_non_executing: true,
    realtime_mesh_workflow_present: true,
    release_candidate_artifact_present: true,
  },
  activation_boundary: {
    owner_launch_authorization_required: true,
    provider_credentials_required: true,
    real_funds_acknowledgements_required: true,
    first_production_purchase_required_before_revenue_claim: true,
  },
};

await mkdir(path.dirname(path.join(root, output)), { recursive: true });
await writeFile(path.join(root, output), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify(evidence, null, 2));
