#!/usr/bin/env node
import {readFileSync,existsSync} from "node:fs";
import {emitRiskStreamCandidates} from "./emit-risk-stream-candidates.mjs";

const fail=code=>{throw Error("RISK_STREAM_COLLECTOR_SIDECAR_"+code)};
const input=process.env.GEOMACRO_RISK_STREAM_CANDIDATES_FILE;
if(!input||!existsSync(input)){
 console.log(JSON.stringify({status:"NO_ITEM_LICENSE_VERIFIED_CANDIDATES",candidate_count:0}));
}else{
 const writes=Number(process.env.GEOMACRO_RISK_STREAM_D1_DAILY_WRITES);
 if(process.env.GEOMACRO_RISK_STREAM_D1_CAP_REQUIRED!=="true"||
    process.env.GEOMACRO_RISK_STREAM_D1_CAP_ADMITTED!=="true"||
    !Number.isSafeInteger(writes)||writes<0||writes>=1_100_000)
  fail("DAILY_D1_WRITE_CAP_NOT_ADMITTED");
 const originals=readFileSync(input,"utf8").split(/\r?\n/u).filter(Boolean).map(line=>{
  try{return JSON.parse(line)}catch{fail("JSONL_INVALID")}
 });
 const manifest=JSON.parse(readFileSync("config/risk-stream-source-rights-reviewed.v1.json","utf8"));
 // This projection is preparatory only. Both attesters and the Control Plane
 // independently re-check the actual D1 registry row before admission.
 const sourceRegistry=manifest.entries.map(entry=>({...entry,enabled:1,
  commercial_rights_approved:1,rights_expire_at:entry.rights_expire_at}));
 emitRiskStreamCandidates({originals,sourceRegistry,rightsManifest:manifest,
  dryRun:false,controlPlaneUrl:process.env.CONTROL_PLANE_URL,
  controlPlaneToken:process.env.CONTROL_PLANE_TOKEN,
  factsPublicB64:process.env.RISK_STREAM_MACHINE_FACTS_SPKI_B64,
  rightsPublicB64:process.env.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64})
  .then(result=>console.log(JSON.stringify(result)))
  .catch(error=>{console.error(String(error?.message??"RISK_STREAM_EMIT_FAILED").slice(0,120));process.exitCode=2});
}
