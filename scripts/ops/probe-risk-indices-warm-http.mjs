#!/usr/bin/env node
/**
 * Outside-in HTTP scorecard ONLY. Does not create numerical indices, sign a
 * GRI parent, write D1, or bypass review. The Control Plane and website's
 * /api/risk-indices routes are distinct and are measured separately.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {verifyRiskIndicesLiveContinuity}
 from "./verify-risk-indices-live-continuity.mjs";

export const PROBES=Object.freeze([
 {name:"website_public_api",url:"https://geomacro.live/api/risk-indices"},
 {name:"requested_control_plane_path",url:"https://geomacro-control-plane.daspallab202391.workers.dev/api/risk-indices"},
]);
const HASH=/^[a-f0-9]{64}$/u;
const CATS=new Set(["geopolitics","macro","critical_minerals"]);
export function verifyLiveIndicesBody(body,now=Date.now()){
 const d=body?.data;
 if(body?.ok!==true||d?.contractVersion!=="risk-indices-v1.1.0"||
    d.parentMethodologyVersion!=="gri-v1.2.0"||
    d.verificationStatus!=="verified"||!HASH.test(d.proofHash??"")||
    !Array.isArray(d.indices)||d.indices.length!==3)return false;
 const asOf=Date.parse(String(d.snapshotAsOf??""));
 if(!Number.isFinite(asOf)||asOf>now+5*60000||now-asOf>3600000)return false;
 const categories=new Set(CATS);
 for(const item of d.indices){
  if(!categories.delete(item?.key)||item.status!=="available"||
     item.readingStatus!=="current"||!Number.isFinite(item.score)||
     item.score<0||item.score>100||
     !Array.isArray(item.series?.["7D"]?.buckets)||
     item.series["7D"].buckets.length<2||
     !Array.isArray(item.series?.["30D"]?.buckets)||
     item.series["30D"].buckets.length<2)return false;
  const native=Date.parse(String(item.readingAsOf??""));
  if(!Number.isFinite(native)||native>now+5*60000||now-native>3600000)
   return false;
 }
 return categories.size===0;
}
export async function probeWarmRiskIndices({
 fetchImpl=fetch,now=Date.now,clock=()=>performance.now(),runs=6,
 verifyParent=verifyRiskIndicesLiveContinuity,
}={}){
 let signedParentContinuity=false;
 try{
  const parent=await verifyParent({fetchImpl,now:now()});
  signedParentContinuity=parent?.ok===true&&
   parent?.three_independent_indices_verified===true&&
   parent?.b2_readback_verified===true&&
   parent?.d1_readback_verified===true&&parent?.edge_readback_verified===true;
 }catch{}
 const result=[];
 for(const p of PROBES){
  const samples=[];let statuses=[];let valid=true;
  for(let i=0;i<runs+1;i++){
   const start=clock();let status=0,correct=false;
   try{
    const r=await fetchImpl(p.url,{method:"GET",redirect:"error",
     headers:{Accept:"application/json","Cache-Control":"no-cache"},
     signal:AbortSignal.timeout(3000)});
    status=r.status;
    if(r.status===200){
     const raw=await r.text();
     if(raw.length<=262144)correct=verifyLiveIndicesBody(JSON.parse(raw),now());
    }
   }catch{}
   const duration=Math.max(0,Math.round((clock()-start)*100)/100);
   if(i>0){samples.push(duration);statuses.push(status)}
   valid=valid&&status===200&&correct;
   // Missing or invalid signed parent is a single observed HOLD, not a
   // battery of wasted public GETs.
   if(i===0&&!valid)break;
  }
  samples.sort((a,b)=>a-b);
  const p95=samples.length?samples[Math.ceil(samples.length*0.95)-1]:null;
  result.push({endpoint:p.name,status:valid&&p95!==null&&p95<100&&signedParentContinuity?
   "PASS_VERIFIED_PARENT_HTTP_AND_P95":"HOLD_UNVERIFIED_PARENT_OR_HTTP_OR_SLO",
   http_current_three_domain_contract_verified:valid,
   independent_b2_d1_edge_parent_continuity_verified:signedParentContinuity,
   http_codes:statuses,p95_ms:p95,measured_warm_count:samples.length,
   target_ms:100});
 }
 return {schema:"geomacro.risk-indices-warm-http-scorecard.v1",
  measured_at:new Date(now()).toISOString(),results:result,
  no_d1_or_b2_mutation:true,scored_gri_synthesized:false,payments:0};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const report=await probeWarmRiskIndices();
 mkdirSync("artifacts/derived-discovery-consumer",{recursive:true});
 writeFileSync("artifacts/derived-discovery-consumer/risk-indices-warm-http.json",
  JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report));
}
