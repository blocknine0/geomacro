#!/usr/bin/env node
/** Decide whether a code-only Worker deploy may replace an unproven old
 * static bundle. No B2 downloads, no secrets, no fabricated source clocks. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {originalSourceIsCurrent} from "../../workers/shared/current-source-clock.mjs";

function getHeader(text,key){
 const line=text.split(/\r?\n/).filter(x=>x.toLowerCase().startsWith(key.toLowerCase()+":")).at(-1);
 return line?line.slice(line.indexOf(":")+1).trim():null;
}
export function assessExistingIndicesBeforeCodeDeploy({
 status,headers="",body=null,now=Date.now(),
}={}){
 // We never replace an established genuinely-current verified serving
 // artifact without its full original continuity artifact.
 if(Number(status)!==200)return {decision:"SAFE_CODE_ONLY_NULL_CONTINUITY",reason:"NO_CURRENT_EDGE_200"};
 const source=body?.data?.snapshotAsOf;
 const direct=String(getHeader(headers,"x-geomacro-b2-verification")??"")
   ==="full-readback-hash-exact-restore";
 const continuity=/^(github-actions-b2-readback-verified|d1-b2-readback-verified-hot-snapshot)$/.test(
   String(getHeader(headers,"x-geomacro-continuity")??""));
 const verified=body?.schema==="geomacro.public-risk-indices-live.v1" &&
   body?.source_project==="ldpwajisioljyjtojvfx" &&
   body?.data?.verificationStatus==="verified" &&
   Array.isArray(body?.data?.indices)&&body.data.indices.length===3 &&
   body.data.indices.every(x=>x?.status==="available") &&
   (direct||continuity) &&
   originalSourceIsCurrent(source,now);
 if(verified)return {decision:"PRESERVE_VERIFIED_CURRENT_EDGE",reason:"LIVE_SOURCE_AND_PROOF"};
 return {decision:"SAFE_CODE_ONLY_NULL_CONTINUITY",
  reason:"OLD_OR_UNVERIFIED_200_MUST_NOT_BLOCK_FAIL_CLOSED_PATCH"};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [status,headersPath,bodyPath]=process.argv.slice(2);
  if(!/^(?:[1-5]\d\d|000)$/.test(String(status)))throw Error("BAD_HTTP_STATUS");
  const headers=readFileSync(headersPath,"utf8");
  const text=readFileSync(bodyPath,"utf8");
  if(headers.length>32768||text.length>1024*1024)throw Error("UNBOUNDED_PROBE");
  let body=null;
  if(Number(status)===200) {
   try{body=JSON.parse(text);}catch{body=null;}
  }
  const result=assessExistingIndicesBeforeCodeDeploy({status,headers,body});
  console.log(result.decision);
 }catch{
  console.error("::error::RISK_INDICES_CODE_DEPLOY_PROBE_UNVERIFIED");
  process.exitCode=2;
 }
}
