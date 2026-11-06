#!/usr/bin/env node
/** Protected recovery coordinator. Existing Worker CAS, encryption, B2 quota,
 * FIFO and readback-before-ACK remain authoritative. No raw content is logged.
 */
import {fileURLToPath} from "node:url";
export async function redriveHot50({origin,token,maxRounds=60,maxDurationMs=480000},fetchImpl=fetch,now=Date.now){
 if(!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/iu.test(origin??"")||
  !/^[a-f0-9]{64}$/u.test(token??"")||!Number.isSafeInteger(maxRounds)||maxRounds<1||maxRounds>60||
  !Number.isSafeInteger(maxDurationMs)||maxDurationMs<1||maxDurationMs>480000)
  throw Error("HOT50_RECOVERY_CONFIG_INVALID");
 const began=now(),rounds=[];
 let outcome="BOUNDED_WINDOW_EXHAUSTED";
 for(let round=0;round<maxRounds&&now()-began<maxDurationMs;round++){
  let r,body;
  try{
   r=await fetchImpl(origin+"/v1/internal/activation/redrive",{
    method:"POST",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    signal:AbortSignal.timeout(Math.min(130000,Math.max(1,maxDurationMs-(now()-began))))});
   const raw=await r.text();if(raw.length>16000)throw Error("OVERSIZED");body=JSON.parse(raw);
  }catch{outcome="TRANSPORT_UNCERTAIN_LEASES_PRESERVED";break}
  if(r.status!==200||body?.schema!=="geomacro.activation-bounded-redrive.v1"){
   outcome="WORKER_HTTP_OR_SCHEMA_UNAVAILABLE";break;
  }
  const out=body.outbox,fifo=body.fifo,r2=body.r2;
  const count=n=>Number.isSafeInteger(n)&&n>=0;
  if(!out||!fifo||!r2||![out.selected,out.archived,out.failed,r2.selected,r2.verified].every(count)){
   outcome="WORKER_COUNT_INVALID";break;
  }
  rounds.push({round:round+1,outbox:{status:out.status,selected:out.selected,archived:out.archived,failed:out.failed},
   fifo:{status:fifo.status,queued:fifo.queued??0},r2:{status:r2.status,verified:r2.verified}});
  if(body.ok!==true||out.failed>0||out.status!=="P0B_OUTBOX_REPLAY_OK"||
   !["DRAIN_CLEAN","DRAINED_BATCH"].includes(fifo.status)||
   /HELD|HOLD|UNAVAILABLE|PARTIAL|FAILED/.test(r2.status??"")){
   outcome="PROVIDER_OR_QUOTA_OR_REPLAY_BLOCKED";break;
  }
  if(out.selected===0&&r2.selected===0&&fifo.status==="DRAIN_CLEAN"){
   outcome="NO_DISPATCHABLE_WORK_AT_OBSERVATION";break;
  }
  if(out.selected===0&&r2.selected===0&&fifo.status==="DRAINED_BATCH"){
   outcome="FIFO_DISPATCHED_AWAITING_INDEPENDENT_ACK";break;
  }
  if((out.selected>0&&out.archived===0)||(r2.selected>0&&r2.verified===0)){
   outcome="NO_ARCHIVE_PROGRESS";break;
  }
 }
 return {schema:"geomacro.hot50-bounded-recovery.v1",outcome,rounds,
  archived_batches:rounds.reduce((n,r)=>n+r.outbox.archived,0),
  elapsed_ms:Math.max(0,now()-began),
  zero_backlog_not_inferred:true,provider_budget_overrides:false,no_funds:true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 redriveHot50({origin:String(process.env.GEOMACRO_CONTROL_PLANE_URL??"https://geomacro-control-plane.daspallab202391.workers.dev").replace(/\/+$/,""),
  token:process.env.CONTROL_PLANE_TOKEN,maxRounds:Number(process.env.ACTIVATION_REDRIVE_MAX_ROUNDS??"60")})
 .then(report=>{console.log(JSON.stringify(report));if(report.outcome!=="NO_DISPATCHABLE_WORK_AT_OBSERVATION")process.exitCode=2})
 .catch(()=>{console.error(JSON.stringify({status:"FAIL",code:"HOT50_RECOVERY_CONFIGURATION_UNAVAILABLE",no_funds:true}));process.exitCode=2});
}
