import fs from "node:fs";
import process from "node:process";
import { execFileSync } from "node:child_process";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(process.env.GEOMACRO_INCIDENT_DRILL_ACK === "NONPRODUCTION_ONLY", "GEOMACRO_INCIDENT_DRILL_ACK must equal NONPRODUCTION_ONLY");

const currentSha = (process.env.GEOMACRO_DRILL_CURRENT_SHA || "").toLowerCase();
const rollbackSha = (process.env.GEOMACRO_DRILL_ROLLBACK_SHA || "").toLowerCase();
assert(/^[0-9a-f]{40}$/.test(currentSha), "Current SHA must be a full commit SHA");
assert(/^[0-9a-f]{40}$/.test(rollbackSha), "Rollback SHA must be a full commit SHA");
assert(currentSha !== rollbackSha, "Rollback SHA must differ from current SHA");

execFileSync("git", ["cat-file", "-e", `${currentSha}^{commit}`], { stdio: "ignore" });
execFileSync("git", ["cat-file", "-e", `${rollbackSha}^{commit}`], { stdio: "ignore" });

const manifest = JSON.parse(fs.readFileSync("config/commercial-launch-manifest.json", "utf8"));
assert(manifest.launch_mode === "prelaunch", "Drill requires launch_mode=prelaunch");
assert(manifest.production_funds_authorized === false, "Drill requires production_funds_authorized=false");
assert(manifest.official_launch_announced === false, "Drill requires official_launch_announced=false");
for (const [name, provider] of Object.entries(manifest.providers || {})) {
  assert(provider?.production_enabled === false, `${name} must remain production-disabled during the drill`);
}

const states = [
  ["INCIDENT_DECLARED", "Synthetic launch-readiness incident declared"],
  ["COMMERCE_FROZEN", "Production funds and provider production flags verified disabled"],
  ["KEY_ROTATION_TEST_REQUIRED", "Existing Risk Object key lifecycle drill runs in the same acceptance workflow"],
  ["ROLLBACK_TARGET_SELECTED", rollbackSha],
  ["ROLLBACK_TARGET_BUILD_REQUIRED", "Acceptance workflow builds the selected rollback target"],
  ["RECOVERY_SMOKE_REQUIRED", "Acceptance workflow reruns smoke checks after rollback-target validation"],
  ["RECOVERED_NONPRODUCTION", "No production activation or real-funds action occurred"],
].map(([state, detail]) => ({ state, detail }));

const evidence = {
  schema_version: "geomacro.nonproduction-rollback-incident-drill.v1",
  generated_at: new Date().toISOString(),
  current_sha: currentSha,
  rollback_sha: rollbackSha,
  production_funds_authorized: false,
  production_activation_performed: false,
  real_payment_performed: false,
  states,
  result: "PASS_CONTROL_PLANE"
};

fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/nonproduction-rollback-incident-drill.json", `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`PASS: nonproduction rollback/incident control drill selected rollback target ${rollbackSha}.`);
console.log("BOUNDARY: no production deployment or real-funds action was performed.");
