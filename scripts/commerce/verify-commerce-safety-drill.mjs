import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SHA = /^[0-9a-f]{40}$/;
const modes = [
  "normal",
  "global_freeze",
  "quarantine_coinbase_x402",
  "quarantine_circle_gateway_x402",
  "quarantine_nevermined",
];

function fail(message) { throw new Error(message); }
function required(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) fail(`${name} is required`);
  return value;
}
async function load(file, label) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is not an object`);
    return value;
  } catch (error) {
    fail(`${label} is unreadable/invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  const expectedSha = required("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA").toLowerCase();
  if (!SHA.test(expectedSha)) fail("GEOMACRO_PRODUCTION_ACCEPTANCE_SHA must be a full SHA");
  const dir = required("GEOMACRO_COMMERCE_SAFETY_DRILL_EVIDENCE_DIR");

  const phases = [];
  let host = null;
  for (const mode of modes) {
    const e = await load(path.join(dir, `${mode}.json`), mode);
    if (e.schema_version !== "geomacro.commerce-safety-drill-phase.v1") fail(`${mode} schema mismatch`);
    if (e.mode !== mode || e.result !== "PASS") fail(`${mode} is not PASS evidence`);
    if (String(e.canonical_sha ?? "").toLowerCase() !== expectedSha) fail(`${mode} SHA mismatch`);
    if (e.public_production_host_used !== false) fail(`${mode} used public production host`);
    if (e.payment_performed !== false || e.settlement_performed !== false) fail(`${mode} probe performed a payment/settlement`);
    if (e.runtime_mutation_performed_by_this_probe !== false) fail(`${mode} probe mutated runtime`);
    const currentHost = String(e.canary_host ?? "").toLowerCase();
    if (!currentHost) fail(`${mode} canary host missing`);
    if (host === null) host = currentHost;
    else if (host !== currentHost) fail("Safety drill phases did not use one exact canary host");

    if (mode === "normal") {
      if (e.production_funds_authorized !== true) fail("Normal phase is not production-authorized");
      if (e.runtime_safety?.emergency_freeze_active !== false) fail("Normal phase is frozen");
      if ((e.runtime_safety?.quarantined_providers ?? []).length !== 0) fail("Normal phase has quarantine");
    } else if (mode === "global_freeze") {
      if (e.production_funds_authorized !== false) fail("Global freeze still authorizes production funds");
      if (e.runtime_safety?.emergency_freeze_active !== true) fail("Global freeze flag not observed");
      if ((e.advertised_providers ?? []).length !== 0) fail("Global freeze still advertises a paid provider");
    } else {
      const provider = mode.replace("quarantine_", "");
      if (!(e.runtime_safety?.quarantined_providers ?? []).includes(provider)) {
        fail(`${mode} does not report its provider quarantine`);
      }
      if ((e.advertised_providers ?? []).includes(provider)) fail(`${mode} still advertises quarantined provider`);
      if (e.provider_checks?.[provider]?.status !== 503) fail(`${mode} quarantined provider did not fail closed`);
    }
    phases.push({ mode, generated_at: e.generated_at, result: "PASS" });
  }

  const result = {
    schema_version: "geomacro.commerce-safety-drill-acceptance.v1",
    generated_at: new Date().toISOString(),
    canonical_sha: expectedSha,
    canary_host: host,
    phases,
    gates: {
      normal_runtime_healthy: true,
      global_freeze_blocks_all_paid_rails: true,
      coinbase_quarantine_isolated: true,
      circle_quarantine_isolated: true,
      nevermined_quarantine_isolated: true,
      healthy_rails_remain_available_during_single_provider_quarantine: true,
      probe_itself_performed_no_payment_or_mutation: true,
    },
    result: "PASS",
  };

  const output =
    process.env.GEOMACRO_COMMERCE_SAFETY_DRILL_ACCEPTANCE_OUTPUT?.trim() ||
    "artifacts/commerce-safety-drill/acceptance.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n", { mode: 0o600 });
  console.log("PASS: global freeze and per-provider quarantine drill accepted.");
  console.log(`Evidence: ${output}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
