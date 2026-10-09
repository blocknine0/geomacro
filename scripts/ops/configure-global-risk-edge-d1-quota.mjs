// Build an ephemeral, pinned production Wrangler config: bind the existing
// main-owned Cloudflare D1 database, never create a new DB or commit its ID.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE_ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
export const INPUT="workers/global-risk-edge/wrangler.jsonc";
export const OUTPUT="workers/global-risk-edge/wrangler.runtime.jsonc";

export function makeQuotaProtectedGlobalRiskConfig(base,databaseId) {
  if(!DATABASE_ID.test(String(databaseId??"")))
    throw new Error("GLOBAL_RISK_QUOTA_D1_ID_INVALID");
  if(!base || typeof base!=="object" ||
    base.name!=="geomacro-global-risk" ||
    base.main!=="src/index.mjs" ||
    base.workers_dev!==true ||
    base.cache?.enabled!==true ||
    base.cache?.cross_version_cache!==true ||
    !Array.isArray(base.services) ||
    !base.services.some(x=>x.binding==="CONTROL_PLANE" &&
      x.service==="geomacro-control-plane") ||
    Array.isArray(base.d1_databases))
    throw new Error("GLOBAL_RISK_QUOTA_BASE_CONFIG_INVALID");
  return {
    ...base,
    d1_databases:[{
      binding:"B2_QUOTA_DB",
      database_name:"geomacro-control-plane",
      database_id:String(databaseId).toLowerCase(),
    }],
  };
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const source=JSON.parse(readFileSync(INPUT,"utf8"));
  const config=makeQuotaProtectedGlobalRiskConfig(source,
    process.env.D1_DATABASE_ID);
  writeFileSync(OUTPUT,JSON.stringify(config,null,2)+"\n",{mode:0o600});
  console.log("Global Risk Worker D1 B2 quota binding pinned to existing main-owned DB.");
}
