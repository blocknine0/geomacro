/** Protected production acceptance, counts and symbolic states only. */
import {writeFileSync,mkdirSync} from "node:fs";
import {createHmac} from "node:crypto";
import {RISK_GATE_HOT50} from "../../workers/control-plane/src/risk-gate-hot50-scope.mjs";
import {RISK_GATE_PRODUCT_TIERS} from "../../workers/control-plane/src/risk-gate-three-tier-product.mjs";
import {inspectHot50TierResponse,HOT50_CATEGORY_KEYS} from "../lib/hot50-production-proof.mjs";
import {summarizeHot50StandardSalesReadiness} from "../lib/hot50-standard-sales-readiness.mjs";
import {planHot50StandardSourceRecovery} from "../lib/hot50-standard-source-recovery.mjs";
import {probeHot50TieredProduct} from "../lib/hot50-tiered-evaluation-transport.mjs";
const token=process.env.RISK_GATE_TIERED_TOKEN;
if(!/^[a-f0-9]{64}$/.test(token??""))throw Error("HOT50_TIER_PROOF_SECRET_MISSING");
const full=process.env.HOT50_TIER_FULL_CENSUS==="1";
const ids=full?RISK_GATE_HOT50:[RISK_GATE_HOT50[Math.floor(Date.now()/1200000)%50]];
let rollup=null;
if(full){
 const root=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
 if(typeof root!=="string"||root.length<32)throw Error("HOT50_ROLLUP_OWNER_SECRET_MISSING");
 const control=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
 try{
  const response=await fetch("https://api.geomacro.live/v1/internal/risk-gate/7d-rollup",{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(45000),
   headers:{Authorization:"Bearer "+control,"Content-Type":"application/json"},
   body:JSON.stringify({mode:"BACKFILL"})});
  const body=await response.json();
  rollup={ok:response.status===200&&body.ok===true,
   risk_signal_rows:Number(body.risk_signal_rows)||0,
   hmac_verified:body.hmac_verified===true};
 }catch{rollup={ok:false};}
}
// Bounded no-funds API census: the 150 sequential 25s worst case exceeded
// the daily 12-minute job limit. The API maintains its existing audit receipts.
const tasks=ids.flatMap(id=>Object.entries(RISK_GATE_PRODUCT_TIERS).map(([tier,price])=>({id,tier,price})));
const receipts=new Array(tasks.length);
const concurrency=Math.min(8,tasks.length);
await Promise.all(Array.from({length:concurrency},async(_,worker)=>{
 for(let index=worker;index<tasks.length;index+=concurrency){
  const {id,tier,price}=tasks[index];
  let receipt={country_iso3:id,tier,ready:false,contract_valid:false,
   status:"TRANSPORT_UNAVAILABLE",verified_current_three_category:false,
   category_statuses:Object.fromEntries(HOT50_CATEGORY_KEYS.map(key=>[key,"INVALID_OR_MISSING"]))};
  try{
   const probe=await probeHot50TieredProduct({country:id,tier,token});
   if(probe.transport_state==="JSON_RESPONSE"){
    receipt=inspectHot50TierResponse({
     country:id,tier,price,httpStatus:probe.http_status,
     body:probe.contract_body,now:Date.now()
    });
    receipt.transport_state=probe.transport_state;
   }else{
    receipt={...receipt,http_status:probe.http_status,
     status:probe.transport_state,transport_state:probe.transport_state};
   }
  }catch{/* No secrets, private upstream body or source IDs in metadata. */}
  receipts[index]=receipt;
 }
}));
const cells=ids.flatMap(id=>HOT50_CATEGORY_KEYS.map(category=>{
 const valid=receipts.filter(x=>x.country_iso3===id&&x.contract_valid);
 const verified=valid.some(x=>x.verified_current_three_category&&
   x.category_statuses?.[category]==="VERIFIED_SIGNED_GRO");
 const state=valid.find(x=>x.category_statuses?.[category])?.category_statuses?.[category]??"INVALID_OR_MISSING";
 return {country_iso3:id,category,status:verified?"VERIFIED_CURRENT_SIGNED_GRO":state,verified_current_signed_gro:verified};
}));
const verifiedCells=cells.filter(x=>x.verified_current_signed_gro).length;
const standardReadiness=summarizeHot50StandardSalesReadiness({ids,receipts,full});
const transportSummary={};
for(const r of receipts){
 const state=r.transport_state??"UNCLASSIFIED";
 transportSummary[state]=(transportSummary[state]??0)+1;
}
const httpStatusSummary={};
for(const r of receipts){
 const status=r.http_status===null||r.http_status===undefined?"NO_HTTP_RESPONSE":String(r.http_status);
 httpStatusSummary[status]=(httpStatusSummary[status]??0)+1;
}
const standardSourceRecovery=planHot50StandardSourceRecovery(standardReadiness);
const report={schema:"geomacro.hot50-three-price-production-acceptance.v2",generated_at:new Date().toISOString(),
 scope:"HOT50",full_census:full,countries_checked:ids.length,categories_per_country:3,
 expected_tiers:3,checked:receipts.length,ready:receipts.filter(x=>x.ready).length,
 country_category_cells_checked:cells.length,country_category_cells_verified:verifiedCells,
 complete:receipts.every(x=>x.ready)&&verifiedCells===ids.length*3&&(!full||(rollup?.ok===true&&rollup?.hmac_verified===true)),
 no_funds:true,rollup,standard_150day_readiness:standardReadiness,
 standard_source_recovery:standardSourceRecovery,
 transport_state_counts:transportSummary,http_status_counts:httpStatusSummary,
 evidence_gap_recovery_requires_accessible_api:transportSummary.JSON_RESPONSE!==receipts.length,
 cells,receipts};
mkdirSync("artifacts/hot50-risk-gate",{recursive:true});
writeFileSync("artifacts/hot50-risk-gate/latest.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({schema:report.schema,countries_checked:report.countries_checked,checked:report.checked,ready:report.ready,verified_cells:report.country_category_cells_verified,
 standard_ready_countries:standardReadiness.standard_product_ready_countries,
 source_repair_cells:standardSourceRecovery.missing_verified_signed_cells,
 source_repair_priorities:standardSourceRecovery.priority_counts,
 transport_states:transportSummary,http_status_counts:httpStatusSummary,
 standard_target_per_day:standardReadiness.target_successful_paid_standard_deliveries_per_utc_day,
 paid_target_verified:standardReadiness.paid_150_daily_target_verified,complete:report.complete}));
if(!report.complete)process.exitCode=1;
