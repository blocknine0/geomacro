#!/usr/bin/env node
/**
 * Read-only code rollout proof. A 503 is accepted ONLY as a code response,
 * never as product currentness or as signed B2/D1 readiness.
 */
import {readFileSync,appendFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const CONTRACT="source-clock-guard-v1";
const PRODUCTS=Object.freeze({
  intelligence:{schema:"geomacro.public-intelligence-live.v1",unavailable:"INTELLIGENCE_EDGE_UNAVAILABLE"},
  "global-risk":{schema:"geomacro.public-global-risk-live.v1",unavailable:"GLOBAL_RISK_EDGE_UNAVAILABLE"},
  "risk-indices":{schema:"geomacro.public-risk-indices-live.v1",unavailable:"RISK_INDICES_EDGE_UNAVAILABLE"},
});
function header(raw,key){
 const found=String(raw).split(/\r?\n/)
   .filter(x=>x.toLowerCase().startsWith(key.toLowerCase()+":"));
 return found.length?found.at(-1).slice(found.at(-1).indexOf(":")+1).trim():null;
}
export function verifyEdgeCodeOnly({product,status,headers,body}={}){
 const rule=PRODUCTS[product];
 if(!rule)throw Error("EDGE_CODE_PRODUCT_INVALID");
 if(![200,503].includes(Number(status)))throw Error("EDGE_CODE_HTTP_UNEXPECTED");
 if(header(headers,"x-geomacro-worker-code-contract")!==CONTRACT)
   throw Error("EDGE_CODE_DEPLOYED_RELEASE_NOT_VERIFIED");
 if(!body||typeof body!=="object")throw Error("EDGE_CODE_RESPONSE_INVALID");
 if(status===503){
   if(body.ok!==false || body.code!==rule.unavailable ||
     header(headers,"x-geomacro-data-available")!=="false" ||
     header(headers,"cache-control")!=="no-store")
     throw Error("EDGE_CODE_NO_DATA_FAIL_CLOSED_INVALID");
 }else{
   if(body.schema!==rule.schema ||
      body.source_project!=="ldpwajisioljyjtojvfx" ||
      header(headers,"x-geomacro-native-clock-contract")!=="live-60m-v1")
     throw Error("EDGE_CODE_200_UNVERIFIED");
 }
 return {
   schema:"geomacro.signed-edge-code-deployment.v1",
   product,worker_code_deployed:true,
   current_signed_data_accepted:false,
   current_data_result:status===503?"NO_CURRENT_SIGNED_DATA":"SEPARATE_SOURCE_PROOF_REQUIRED",
   observed_http_status:status,
   b2_readback_attested:false,d1_signed_hot_ready_attested:false,
   x402_payment_authorized:false,real_funds_touched:false,
 };
}
export function summary(result){
 return [
   "### "+result.product+": production code rollout verification",
   "",
   "| Dimension | Result |",
   "|---|---|",
   "| Worker source-clock code | Verified deployed |",
   "| Customer signed data | "+result.current_data_result+" |",
   "| Edge response | HTTP "+result.observed_http_status+" |",
   "| B2/D1 original signed readback | Not established by code deployment |",
   "| Funds | No funds |",
   "",
   "Signed product acceptance is a separate step. An unavailable source remains HTTP 503.",
   "",
 ].join("\n");
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
   const [product,statusText,headerPath,bodyPath]=process.argv.slice(2);
   const headers=readFileSync(headerPath,"utf8");
   const raw=readFileSync(bodyPath,"utf8");
   if(headers.length>32768||raw.length>1024*1024)throw Error("EDGE_CODE_PROBE_OVERSIZE");
   const result=verifyEdgeCodeOnly({product,status:Number(statusText),headers,body:JSON.parse(raw)});
   console.log(JSON.stringify(result));
   if(process.env.GITHUB_STEP_SUMMARY)
     appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary(result));
 }catch(e){
   const code=String(e?.message??"");
   console.error("::error::"+(/^EDGE_CODE_[A-Z0-9_]+$/.test(code)?code:"EDGE_CODE_VERIFY_FAILED"));
   process.exitCode=2;
 }
}
