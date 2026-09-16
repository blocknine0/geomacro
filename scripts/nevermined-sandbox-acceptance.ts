import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  assessNeverminedSettlement,
  getNeverminedX402Config,
  neverminedPaymentRequired,
  settleNeverminedPermissions,
  verifyNeverminedPermissions,
} from "../src/lib/nevermined-x402.server";

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function required(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required for the sandbox acceptance run`);
  return value;
}

const output = process.argv[2] || "artifacts/nevermined-sandbox-acceptance.json";
const environment = process.env.NEVERMINED_X402_ENVIRONMENT?.trim().toLowerCase();
if (environment !== "sandbox") {
  throw new Error("Nevermined provider acceptance harness is sandbox-only");
}
if (process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK?.trim()) {
  throw new Error("Commercial launch acknowledgement must not be present in sandbox acceptance");
}

const token = required("NEVERMINED_SANDBOX_X402_ACCESS_TOKEN");
const config = getNeverminedX402Config();
if (!config || config.environment !== "sandbox" || config.commercialRevenue !== false) {
  throw new Error("Nevermined sandbox configuration did not resolve fail-closed");
}

const endpoint = "https://geomacro.live/api/x402/nevermined/intelligence";
const paymentRequired = neverminedPaymentRequired(config, endpoint);
const verify = await verifyNeverminedPermissions({
  config,
  paymentRequired,
  token,
});
if (!verify.isValid) {
  throw new Error(`Nevermined sandbox verify rejected the token: ${verify.invalidReason ?? "unknown"}`);
}

const settlement = await settleNeverminedPermissions({
  config,
  paymentRequired,
  token,
  agentRequestId: verify.agentRequestId,
});
const assessed = assessNeverminedSettlement(settlement);
if (!assessed.settled || !assessed.reference) {
  throw new Error(`Nevermined sandbox settlement evidence is insufficient: ${assessed.reason ?? "unknown"}`);
}

const evidence = {
  schema_version: "geomacro.nevermined-sandbox-acceptance.v1",
  generated_at: new Date().toISOString(),
  environment: "sandbox",
  commercial_revenue: false,
  production_activation_performed: false,
  endpoint,
  x402_version: paymentRequired.x402Version,
  scheme: config.scheme,
  network: config.network,
  api_version: config.apiVersion,
  plan_id_sha256: hash(config.planId),
  verify_valid: true,
  verify_agent_request_id_present: Boolean(verify.agentRequestId),
  settlement_success: settlement.success,
  settlement_evidence_valid: true,
  billing_model: settlement.billingModel ?? "legacy_credits_semantics",
  credits_redeemed: settlement.creditsRedeemed ?? null,
  settlement_reference_sha256: hash(assessed.reference),
  secrets_recorded: false,
  payer_identity_recorded: false,
  limitations: [
    "This is Nevermined sandbox evidence only and is not commercial revenue.",
    "The artifact intentionally omits access tokens, API keys, payer identity and raw settlement references.",
    "Nevermined production/live remains disabled until the coordinated owner-authorized launch.",
  ],
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(evidence, null, 2) + "\n", "utf8");
console.log(
  JSON.stringify(
    {
      ok: true,
      environment: evidence.environment,
      commercial_revenue: false,
      settlement_evidence_valid: true,
      output,
    },
    null,
    2,
  ),
);
