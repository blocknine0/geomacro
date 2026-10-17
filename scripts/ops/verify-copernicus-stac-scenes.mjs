#!/usr/bin/env node
import {mkdirSync,writeFileSync} from "node:fs";
import {fetchCopernicusScenes} from "../../global-intelligence/adapters/copernicus-stac-scenes.mjs";

if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
  process.env.GITHUB_REF!=="refs/heads/main"||
  !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID??""))
  throw Error("STAC_PROTECTED_MAIN_REQUIRED");
for(const secret of ["APP_SUPABASE_URL","SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY","B2_APPLICATION_KEY",
  "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64","COINBASE_API_KEY"])
  if(process.env[secret])throw Error("STAC_FORBIDDEN_CREDENTIAL");
let receipt;
try{
  const x=await fetchCopernicusScenes();
  receipt={schema:"geomacro.copernicus-production-scene-health.v1",
    checked_at:new Date().toISOString(),source:"copernicus_stac",
    state:x.scene_count?"ORIGINAL_STAC_SCENE_METADATA_VERIFIED":"NO_QUALIFYING_SCENE_IN_WINDOW",
    scene_count:x.scene_count,latest_acquired_at:x.latest_acquired_at,
    geometry_intersection_checked:x.scene_count>0,
    actual_image_bytes_retrieved:false,
    country_impact_verified:false,commercial_rights_approved:false,
    signed_current_intelligence:false,payments:0,
    supabase_requests:0,b2_requests:0,d1_writes:0};
}catch(e){
  const reason=String(e?.message??"");
  receipt={schema:"geomacro.copernicus-production-scene-health.v1",
    checked_at:new Date().toISOString(),source:"copernicus_stac",
    state:"UPSTREAM_SCENE_VERIFICATION_FAILED",
    reason:/^(?:STAC_[A-Z0-9_]+)$/.test(reason)?reason:"UPSTREAM_OR_VALIDATION_ERROR",
    scene_count:0,actual_image_bytes_retrieved:false,
    country_impact_verified:false,commercial_rights_approved:false,
    signed_current_intelligence:false,payments:0,
    supabase_requests:0,b2_requests:0,d1_writes:0};
}
mkdirSync("artifacts/copernicus-scenes",{recursive:true,mode:0o700});
writeFileSync("artifacts/copernicus-scenes/receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(receipt));
if(receipt.state!=="ORIGINAL_STAC_SCENE_METADATA_VERIFIED")process.exitCode=3;
