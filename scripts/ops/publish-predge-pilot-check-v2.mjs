#!/usr/bin/env node
// Owner-only publication of one already signed and pinned pilot envelope.
import {readFileSync} from "node:fs";
import {verifySignedPilotCheck,MAX_WIRE_BYTES,PINNED_PUBLIC_SPKI}
 from "../../workers/control-plane/src/predge-pilot-news-context-v2.mjs";
const BASE="https://geomacro-control-plane.daspallab202391.workers.dev";
async function main(){
 const filename=process.argv[2];
 if(process.argv.length!==3||!filename)throw Error("SIGNED_FILE_REQUIRED");
 const token=process.env.CONTROL_PLANE_TOKEN;
 const research=process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE;
 if(!/^[a-f0-9]{64}$/.test(token??"")||!/^[a-f0-9]{64}$/.test(research??"")||
    token===research)throw Error("OWNER_AND_RESEARCH_AUTH_REQUIRED");
 const raw=readFileSync(filename,"utf8");
 if(Buffer.byteLength(raw,"utf8")>MAX_WIRE_BYTES)throw Error("SIGNED_SAMPLE_TOO_LARGE");
 const obj=JSON.parse(raw);
 await verifySignedPilotCheck(obj,{registry:JSON.stringify({
  "geomacro-risk-2026-03":{status:"active",public_key_spki_b64:PINNED_PUBLIC_SPKI}
 })});
 const put=await fetch(BASE+"/v1/internal/predge-pilot-news-context-publish",{
  method:"PUT",headers:{"authorization":"Bearer "+token,"content-type":"application/json"},
  body:raw,redirect:"error",signal:AbortSignal.timeout(20000)});
 if(put.status!==200)throw Error("OWNER_PUBLISH_FAILED_"+put.status);
 const receipt=await put.json();
 if(receipt.ok!==true||receipt.received_hash!==obj.integrity.payload_hash)
  throw Error("OWNER_PUBLISH_RECEIPT_INVALID");
 // One readback; consumes one research-budget request. No raw item logging.
 const get=await fetch(BASE+"/v1/pilot/check",{headers:{"authorization":"Bearer "+research},
   redirect:"error",signal:AbortSignal.timeout(20000)});
 if(get.status!==200)throw Error("PILOT_READBACK_FAILED_"+get.status);
 const actual=await get.json();
 await verifySignedPilotCheck(actual);
 if(actual.integrity.payload_hash!==obj.integrity.payload_hash)
  throw Error("PILOT_READBACK_HASH_MISMATCH");
 console.log(JSON.stringify({ok:true,readback_verified:true,
   payload_hash:actual.integrity.payload_hash,
   generated_at:actual.generated_at,expires_at:actual.expires_at,
   execution_authorized:false,source_content_logged:false}));
}
main().catch(e=>{console.error("PREDGE_PILOT_PUBLISH_FAILURE_"+
 String(e.message).replace(/[^A-Z0-9_]/gi,"_").slice(0,100));process.exitCode=1;});
