#!/usr/bin/env node
/** Idempotent patch against the reviewed Master Audit #3634 baseline. */
import {readFileSync,writeFileSync} from 'node:fs';
const planner='scripts/ops/plan-d1-bundled-work.mjs';
const worker='workers/control-plane/src/index.mjs';
function edit(path,apply){
 const before=readFileSync(path,'utf8'),after=apply(before);
 if(after!==before){writeFileSync(path,after);console.log('PATCHED '+path);}
 else console.log('ALREADY_PATCHED '+path);
}
edit(planner,s=>{
 const imp='import {assessPaidEnvelope,paidBundleContract} from "./d1-paid-envelope.mjs";\n';
 const at='import {D1_FREE_DAILY,readCloudflareD1AccountQuota} from "./audit-d1-account-daily-quota-readonly.mjs";\n';
 if(!s.includes(imp)){
  if(!s.includes(at))throw Error('PLANNER_IMPORT_DRIFT');
  s=s.replace(at,at+imp);
 }
 if(!s.includes('paidBundleContract(assessPaidEnvelope(')){
  const start=s.indexOf('  if(paid){',s.indexOf('export function planD1BundledWork'));
  const end=s.indexOf('\n  const paced=',start);
  if(start<0||end<=start)throw Error('PAID_BRANCH_DRIFT');
  s=s.slice(0,start)+`  if(paid) {
    // Workers Paid has no Free-tier 100k/day stop. GeoMacro retains its own
    // conservative soft envelope, and each writer must reserve atomically.
    return paidBundleContract(assessPaidEnvelope(snapshot,{now,paidProof,spendGuardProof}));
  }`+s.slice(end);
 }
 return s;
});
edit(worker,s=>{
 const healthAnchor='return json({ ok: true, store: "d1", schema_version: Number(row.version), durable_payload_store: "b2", commerce_ledger: "durable_object",';
 if(!s.includes('d1_hotspot_v2_enabled:env.GEOMACRO_D1_READ_HOTSPOT_V2')){
  if(!s.includes(healthAnchor))throw Error('HEALTH_CONTRACT_DRIFT');
  s=s.replace(healthAnchor,healthAnchor+`
       d1_hotspot_v2_enabled:env.GEOMACRO_D1_READ_HOTSPOT_V2==="1",
       payment_runtime_locked:env.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE!=="ACCEPTED_CANONICAL_D1_PAID_RUNTIME",`);
 }
 const marker='      if(request.method==="PUT"&&url.pathname==="/v1/internal/public-news-page-refresh"&&!url.search){';
 if(s.includes('url.pathname==="/v1/internal/hot50-cqrs-refresh"'))return s;
 if(!s.includes(marker))throw Error('WORKER_PROTECTED_ROUTE_DRIFT');
 return s.replace(marker,`      // Protected, no-funds hot50 CQRS producer ACK (never a public write).
      if(request.method==="PUT"&&url.pathname==="/v1/internal/hot50-cqrs-refresh"&&!url.search){
        if(env?.GEOMACRO_D1_READ_HOTSPOT_V2!=="1")
          return json({ok:false,error:"CQRS_CANARY_FLAG_DISABLED"},409);
        const receipt=await refreshHot50MaterializedNews(env,Date.now());
        return json({schema:"geomacro.hot50-cqrs-canary-ack.v1",
          ok:receipt.ok===true,state:receipt.status,rows:receipt.rows??null,
          rows_written:receipt.rows_written_for_write??null,
          payment_performed:false},receipt.ok===true?200:503);
      }
`+marker);
});
