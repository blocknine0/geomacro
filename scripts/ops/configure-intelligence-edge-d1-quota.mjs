// Ephemeral production Wrangler: the ONLY D1 quota authority is the existing
// main-owned geomacro-control-plane database. No DB creation or committed UUID.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
export const INPUT="workers/intelligence-edge/wrangler.jsonc";
export const OUTPUT="workers/intelligence-edge/wrangler.runtime.jsonc";

export function makeQuotaProtectedIntelligenceConfig(base,databaseId) {
  if(!UUID.test(String(databaseId??"")))
    throw new Error("INTELLIGENCE_QUOTA_D1_ID_INVALID");
  if(!base || typeof base!=="object" ||
    base.name!=="geomacro-intelligence" ||
    base.main!=="src/index.mjs" ||
    base.workers_dev!==true ||
    base.cache?.enabled!==true ||
    base.cache?.cross_version_cache!==true ||
    !Array.isArray(base.services) ||
    !base.services.some(x=>x.binding==="CONTROL_PLANE" &&
      x.service==="geomacro-control-plane") ||
    Array.isArray(base.d1_databases))
    throw new Error("INTELLIGENCE_QUOTA_BASE_CONFIG_INVALID");
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
  const base=JSON.parse(readFileSync(INPUT,"utf8"));
  const config=makeQuotaProtectedIntelligenceConfig(base,process.env.D1_DATABASE_ID);
  writeFileSync(OUTPUT,JSON.stringify(config,null,2)+"\n",{mode:0o600});
  console.log("Intelligence Worker uses existing D1 shared B2 account quota ledger.");
}
