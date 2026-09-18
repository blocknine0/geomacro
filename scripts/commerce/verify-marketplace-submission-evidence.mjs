import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const ACK = "I_CONFIRM_MARKETPLACE_SUBMISSIONS_COMPLETED";

function fail(message) {
  throw new Error(message);
}

function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}

function iso(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) fail(`${label} must be an ISO timestamp`);
  return new Date(timestamp).toISOString();
}

function hash(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

async function main() {
  const canonicalSha = required("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA").toLowerCase();
  if (!SHA.test(canonicalSha)) fail("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA must be a full SHA");
  if (required("GEOMACRO_MARKETPLACE_SUBMISSION_ACK") !== ACK) {
    fail(`GEOMACRO_MARKETPLACE_SUBMISSION_ACK must equal ${ACK}`);
  }

  const circleReceipt = required("GEOMACRO_CIRCLE_MARKETPLACE_SUBMISSION_RECEIPT_SHA256").toLowerCase();
  const neverminedReceipt = required("GEOMACRO_NEVERMINED_REGISTRY_SUBMISSION_RECEIPT_SHA256").toLowerCase();
  if (!HASH.test(circleReceipt)) fail("Circle submission receipt must be a sha256 digest");
  if (!HASH.test(neverminedReceipt)) fail("Nevermined submission receipt must be a sha256 digest");

  const publicReadyAt = iso(
    required("GEOMACRO_PUBLIC_PRELISTING_COMPLETED_AT"),
    "GEOMACRO_PUBLIC_PRELISTING_COMPLETED_AT",
  );
  const circleSubmittedAt = iso(
    required("GEOMACRO_CIRCLE_MARKETPLACE_SUBMITTED_AT"),
    "GEOMACRO_CIRCLE_MARKETPLACE_SUBMITTED_AT",
  );
  const neverminedSubmittedAt = iso(
    required("GEOMACRO_NEVERMINED_REGISTRY_SUBMITTED_AT"),
    "GEOMACRO_NEVERMINED_REGISTRY_SUBMITTED_AT",
  );

  const publicReadyMs = Date.parse(publicReadyAt);
  if (Date.parse(circleSubmittedAt) < publicReadyMs) {
    fail("Circle marketplace submission predates exact-SHA public prelisting health");
  }
  if (Date.parse(neverminedSubmittedAt) < publicReadyMs) {
    fail("Nevermined registry publication predates exact-SHA public prelisting health");
  }

  const result = {
    schema_version: "geomacro.marketplace-submission-acceptance.v1",
    generated_at: new Date().toISOString(),
    canonical_sha: canonicalSha,
    public_prelisting_completed_at: publicReadyAt,
    providers: {
      coinbase_bazaar: {
        submission_mode: "automatic_x402_discovery_indexing",
        manual_submission_required: false,
        indexing_claimed_complete: false,
        completion_requires_independent_observation: true,
      },
      circle_agent_marketplace: {
        submission_mode: "provider_submission",
        submitted: true,
        submitted_at: circleSubmittedAt,
        submission_receipt_sha256: circleReceipt,
        raw_receipt_persisted: false,
        completion_requires_independent_observation: true,
      },
      nevermined_registry: {
        submission_mode: "provider_registry_publish",
        submitted: true,
        submitted_at: neverminedSubmittedAt,
        submission_receipt_sha256: neverminedReceipt,
        raw_receipt_persisted: false,
        completion_requires_independent_observation: true,
      },
    },
    gates: {
      exact_sha_bound: true,
      public_health_preceded_external_submissions: true,
      circle_submission_evidenced: true,
      nevermined_submission_evidenced: true,
      coinbase_indexing_requires_observation: true,
      listing_not_inferred_from_submission: true,
      listing_not_inferred_from_payment: true,
    },
    secrets_included: false,
    customer_identity_included: false,
    raw_submission_receipt_included: false,
    public_marketing_performed: false,
    result: "PASS",
    evidence_digest_sha256: hash(
      [canonicalSha, publicReadyAt, circleSubmittedAt, circleReceipt, neverminedSubmittedAt, neverminedReceipt].join("|"),
    ),
  };

  const output =
    process.env.GEOMACRO_MARKETPLACE_SUBMISSION_OUTPUT?.trim() ||
    "artifacts/marketplace-submission/submission-acceptance.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log("PASS: marketplace submission/indexing handoff is evidence-bound.");
  console.log("Coinbase remains pending independent automatic-index observation; Circle and Nevermined submissions are receipt-hash bound.");
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
