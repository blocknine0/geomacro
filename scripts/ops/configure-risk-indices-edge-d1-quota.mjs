// Build an ephemeral Wrangler config for the already-deployed Cloudflare D1.
// Do NOT create another database, embed account secrets, or commit a real UUID.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DB_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const SOURCE = "workers/risk-indices-edge/wrangler.jsonc";
export const OUTPUT = "workers/risk-indices-edge/wrangler.runtime.jsonc";

export function makeQuotaProtectedRiskIndicesConfig(base, databaseId) {
  if (!DB_ID.test(String(databaseId ?? ""))) {
    throw new Error("RISK_INDICES_B2_QUOTA_D1_ID_INVALID");
  }
  if (!base || typeof base !== "object" ||
      base.name !== "geomacro-risk-indices" ||
      base.main !== "src/index.mjs" ||
      base.workers_dev !== true ||
      base.cache?.enabled !== true ||
      base.cache?.cross_version_cache !== true ||
      !Array.isArray(base.services) ||
      !base.services.some(row => row.binding === "CONTROL_PLANE" && row.service === "geomacro-control-plane") ||
      Array.isArray(base.d1_databases)) {
    throw new Error("RISK_INDICES_B2_QUOTA_BASE_CONFIG_INVALID");
  }
  return {
    ...base,
    d1_databases: [{
      binding: "B2_QUOTA_DB",
      database_name: "geomacro-control-plane",
      database_id: databaseId.toLowerCase(),
    }],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  const output = makeQuotaProtectedRiskIndicesConfig(source, process.env.D1_DATABASE_ID);
  writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });
  console.log("Verified existing production D1 binding configured for Risk Indices B2 quota guard.");
}
