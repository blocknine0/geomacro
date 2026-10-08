import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((out, value, index, all) => {
    if (!value.startsWith("--")) return out;
    out.push([value.slice(2), all[index + 1]]);
    return out;
  }, []),
);

const product = String(args.product ?? "");
const artifactDir = path.resolve(String(args["artifact-dir"] ?? ""));
const proofPath = path.resolve(String(args.proof ?? ""));
const outputPath = path.resolve(String(args.output ?? ""));
const sourceRunId = String(args["source-run-id"] ?? "");
const projectRef = "ldpwajisioljyjtojvfx";

if (!["global-risk", "risk-indices", "intelligence"].includes(product)) {
  throw new Error("EDGE_CONTINUITY_PRODUCT_INVALID");
}
if (!/^\d+$/.test(sourceRunId)) throw new Error("EDGE_CONTINUITY_RUN_ID_INVALID");
if (!fs.existsSync(artifactDir) || !fs.existsSync(proofPath) || !outputPath) {
  throw new Error("EDGE_CONTINUITY_INPUT_REQUIRED");
}

const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
if (
  proof?.ok !== true ||
  proof?.b2_readback_verified !== true ||
  proof?.destructive_change !== false ||
  !/^[0-9a-f]{64}$/.test(String(proof?.live_sha256 ?? ""))
) {
  throw new Error("EDGE_CONTINUITY_B2_PROOF_INVALID");
}

function findFile(name) {
  const stack = [artifactDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  return null;
}

function validDate(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed);
}

let payload;
let projection = "exact-public-package";

if (product === "global-risk") {
  if (proof.schema !== "geomacro.public-global-risk-direct-postgres-publish.v1") {
    throw new Error("EDGE_CONTINUITY_GLOBAL_PROOF_SCHEMA_INVALID");
  }
  const file =
    findFile("global-risk-published-live.json") ??
    findFile("global-risk-three-index.json");
  if (!file) throw new Error("EDGE_CONTINUITY_GLOBAL_ARTIFACT_MISSING");
  payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const data = payload?.data;
  if (
    payload?.schema !== "geomacro.public-global-risk-live.v1" ||
    payload?.source_project !== projectRef ||
    data?.verificationStatus !== "verified" ||
    data?.methodologyVersion !== "gri-v1.2.0" ||
    data?.auditPersisted !== true ||
    data?.snapshotId !== proof.snapshot_id ||
    Date.parse(String(data?.snapshotAsOf ?? "")) !== Date.parse(String(proof.snapshot_as_of ?? "")) ||
    !validDate(payload?.generated_at)
  ) throw new Error("EDGE_CONTINUITY_GLOBAL_ARTIFACT_INVALID");
} else if (product === "risk-indices") {
  if (proof.schema !== "geomacro.public-risk-indices-direct-postgres-publish.v1") {
    throw new Error("EDGE_CONTINUITY_INDICES_PROOF_SCHEMA_INVALID");
  }
  const file = findFile("risk-indices-published-live.json");
  if (!file) throw new Error("EDGE_CONTINUITY_INDICES_ARTIFACT_MISSING");
  payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const data = payload?.data;
  if (
    payload?.schema !== "geomacro.public-risk-indices-live.v1" ||
    payload?.source_project !== projectRef ||
    data?.verificationStatus !== "verified" ||
    data?.contractVersion !== "risk-indices-v1.1.0" ||
    data?.parentMethodologyVersion !== "gri-v1.2.0" ||
    data?.snapshotId !== proof.snapshot_id ||
    Date.parse(String(data?.snapshotAsOf ?? "")) !== Date.parse(String(proof.snapshot_as_of ?? "")) ||
    !validDate(payload?.generated_at)
  ) throw new Error("EDGE_CONTINUITY_INDICES_ARTIFACT_INVALID");
} else {
  if (proof.schema !== "geomacro.public-intelligence-direct-postgres-publish.v2") {
    throw new Error("EDGE_CONTINUITY_INTELLIGENCE_PROOF_SCHEMA_INVALID");
  }
  const file = findFile("intelligence-current.json");
  if (!file) throw new Error("EDGE_CONTINUITY_INTELLIGENCE_ARTIFACT_MISSING");
  const publicProjection = JSON.parse(fs.readFileSync(file, "utf8"));
  const rows = Array.isArray(publicProjection?.rows) ? publicProjection.rows : [];
  const categories = new Set(rows.map((row) => String(row?.category ?? "").toLowerCase()));
  if (
    publicProjection?.ok !== true ||
    publicProjection?.mode !== "verified_b2_plus_live_observed" ||
    rows.length < 3 ||
    !["geopolitics", "macro", "rare_earth"].every((key) => categories.has(key)) ||
    Date.parse(String(publicProjection?.newest_at ?? "")) < Date.parse(String(proof?.current_source_batch_at ?? "")) ||
    !validDate(publicProjection?.generated_at)
  ) throw new Error("EDGE_CONTINUITY_INTELLIGENCE_ARTIFACT_INVALID");
  payload = {
    schema: "geomacro.public-intelligence-live.v1",
    generated_at: publicProjection.generated_at,
    source_project: projectRef,
    rows,
  };
  projection = "verified-public-projection";
}

const payloadJson = JSON.stringify(payload);
const payloadSha256 = crypto.createHash("sha256").update(payloadJson).digest("hex");
const continuity = {
  schema: "geomacro.edge-continuity.v1",
  product,
  source_run_id: sourceRunId,
  source_publish_schema: proof.schema,
  source_live_sha256: proof.live_sha256,
  b2_readback_verified: true,
  projection,
  payload_sha256: payloadSha256,
  payload_json: payloadJson,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `export default ${JSON.stringify(continuity)};\n`,
  "utf8",
);
console.log(JSON.stringify({
  ok: true,
  schema: continuity.schema,
  product,
  source_run_id: sourceRunId,
  projection,
  payload_sha256: payloadSha256,
  output: outputPath,
}));
