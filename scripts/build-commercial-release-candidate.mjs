#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outputPath = process.argv[2] || "artifacts/commercial-release-candidate.json";

const trackedFiles = [
  "config/commercial-launch-manifest.json",
  "config/agent-marketplace-distribution.json",
  "config/auto-distribution.json",
  "public/.well-known/geomacro-agent.json",
  "public/.well-known/geomacro-commerce.json",
  "public/openapi-x402.json",
  "public/agent-commerce.md",
  "public/llms.txt",
  "scripts/marketing/auto-distribute-alert.mjs",
  "scripts/marketing/distribution-receipt-ledger.mjs",
  "scripts/marketing/poll-public-early-warning.mjs",
  "scripts/marketing/public-feed-adapter.mjs",
  "src/lib/commercial-launch-gate.server.ts",
  "src/lib/coinbase-x402.server.ts",
  "src/lib/circle-gateway-x402-production.server.ts",
  "src/routes/api.x402.circle_.intelligence.ts",
  "src/lib/nevermined-x402.server.ts",
  "src/lib/agent-commerce-delivery.server.ts",
  "src/lib/commercial-growth.server.ts",
  "supabase/migrations/934_agent_commerce_delivery_ledger.sql",
  "supabase/migrations/935_commercial_marketing_draft_queue.sql",
  "supabase/migrations/937_early_warning_alert_ledger.sql",
  "supabase/migrations/940_early_warning_distribution_claims.sql",
  "supabase/migrations/941_early_warning_distribution_attempt_cap.sql",
  "supabase/migrations/942_early_warning_distribution_fail_closed_reclaim.sql",
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function requireCommitSha() {
  // Explicit candidate identity must win over GitHub's event SHA. On pull_request
  // events GITHUB_SHA can be a synthetic merge commit, while the workflow passes
  // the exact PR head through COMMERCIAL_RC_GIT_SHA. On main pushes the workflow
  // passes github.sha through the same explicit variable.
  const value = String(process.env.COMMERCIAL_RC_GIT_SHA || process.env.GITHUB_SHA || "").trim();
  if (!/^[0-9a-f]{40}$/i.test(value)) {
    throw new Error("A full 40-character COMMERCIAL_RC_GIT_SHA or GITHUB_SHA is required");
  }
  return value.toLowerCase();
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const gitSha = requireCommitSha();
const launch = await readJson("config/commercial-launch-manifest.json");
const distribution = await readJson("config/agent-marketplace-distribution.json");
const publicDistribution = await readJson("config/auto-distribution.json");
const commerce = await readJson("public/.well-known/geomacro-commerce.json");

if (launch.launch_mode !== "prelaunch") {
  throw new Error("Release-candidate evidence generator must run in prelaunch mode");
}
if (launch.production_funds_authorized !== false || launch.official_launch_announced !== false) {
  throw new Error("Production funds/announcement must remain disabled in prelaunch RC evidence");
}
for (const [provider, state] of Object.entries(launch.providers || {})) {
  if (state?.production_enabled !== false) {
    throw new Error(`${provider} production_enabled must remain false in prelaunch RC evidence`);
  }
}
if (launch.providers?.coinbase_x402?.launch_cohort !== true) {
  throw new Error("Coinbase must remain in the initial payment launch cohort");
}
if (launch.providers?.circle_gateway_x402?.launch_cohort !== true) {
  throw new Error("Circle Gateway must remain in the initial payment launch cohort");
}
if (launch.providers?.circle_gateway_x402?.arc_mainnet_enabled !== false) {
  throw new Error("Arc mainnet must remain disabled in the prepared Circle launch path");
}
if (launch.providers?.nevermined?.launch_cohort !== true) {
  throw new Error("Nevermined must remain in the initial payment launch cohort");
}
if (launch.providers?.goat_x402?.launch_cohort !== false) {
  throw new Error("GOAT mainnet must remain deferred from the initial payment launch cohort");
}
if (distribution.state !== "prelaunch_hold") {
  throw new Error("Marketplace distribution must remain on prelaunch hold");
}
if (distribution.official_launch_required_before_public_submission !== true) {
  throw new Error("Marketplace public submission must remain launch-gated");
}
if (commerce.service?.status !== "prelaunch" || commerce.commercial_contract?.production_funds_authorized !== false) {
  throw new Error("Machine commerce discovery must remain prelaunch/non-production");
}
if (publicDistribution.mode !== "prelaunch-shadow") {
  throw new Error("Public Early Warning distribution must remain in prelaunch-shadow mode");
}
if (publicDistribution.default_dry_run !== true || publicDistribution.live_publish_enabled !== false) {
  throw new Error("Public Early Warning distribution must remain dry-run/live-disabled in prelaunch RC evidence");
}
if (publicDistribution.receipt_policy?.live_worker_wired !== true) {
  throw new Error("Public Early Warning worker must remain wired to the durable receipt ledger");
}
if (
  publicDistribution.receipt_policy?.ambiguous_outcome_retry !== "manual_only" ||
  publicDistribution.receipt_policy?.stale_unfinalized_claim_retry !== "manual_only"
) {
  throw new Error("Public Early Warning ambiguous/stale delivery outcomes must remain manual-only");
}

const hashes = {};
for (const relativePath of trackedFiles) {
  const bytes = await readFile(path.join(root, relativePath));
  hashes[relativePath] = sha256(bytes);
}

const generatedAt = new Date().toISOString();
const evidence = {
  schema_version: "geomacro.commercial-release-candidate-evidence.v1",
  status: "prelaunch_evidence_only",
  generated_at: generatedAt,
  git_sha: gitSha,
  production_activation_performed: false,
  production_funds_authorized: false,
  official_launch_announced: false,
  payment_launch_cohort: ["coinbase_x402", "circle_gateway_x402", "nevermined"],
  deferred_payment_providers: {
    goat_x402_mainnet: "manual_merchant_application_and_approval_required",
  },
  marketplace_distribution_state: distribution.state,
  machine_commerce_state: commerce.service.status,
  public_early_warning_distribution: {
    mode: publicDistribution.mode,
    default_dry_run: publicDistribution.default_dry_run,
    live_publish_enabled: publicDistribution.live_publish_enabled,
    receipt_worker_wired: publicDistribution.receipt_policy.live_worker_wired,
    ambiguous_outcome_retry: publicDistribution.receipt_policy.ambiguous_outcome_retry,
    stale_unfinalized_claim_retry: publicDistribution.receipt_policy.stale_unfinalized_claim_retry,
  },
  required_gates: launch.required_gates,
  tracked_file_sha256: hashes,
  limitations: [
    "This artifact proves the exact prelaunch configuration captured at git_sha; it does not itself prove that all independent CI/security/provider checks passed.",
    "It does not authorize production funds, provider activation, public marketplace submission or Early Warning social publication.",
    "Early Warning push remains live-disabled and requires a separate owner-authorized activation after its channel, database and feed-health gates pass.",
    "Third-party marketplace approval/indexing remains external evidence and must be verified separately at launch.",
  ],
};

const canonical = JSON.stringify(evidence, null, 2) + "\n";
await mkdir(path.dirname(path.join(root, outputPath)), { recursive: true });
await writeFile(path.join(root, outputPath), canonical, "utf8");

const manifestDigest = sha256(Buffer.from(canonical, "utf8"));
console.log(JSON.stringify({
  ok: true,
  output: outputPath,
  git_sha: gitSha,
  evidence_sha256: manifestDigest,
  tracked_files: trackedFiles.length,
}, null, 2));
