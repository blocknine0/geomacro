#!/usr/bin/env node
/**
 * No-funds, bounded public proof watch for the three EXISTING paid hot
 * products. It never invents timestamps, promotes baseline B2 data, signs,
 * modifies D1/B2, starts payment, or dispatches an unreviewed publisher.
 * Piggybacks the existing half-hour Risk Indices backstop (no new cron).
 */
import {appendFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

export const PAID_HOT_PRODUCTS=Object.freeze(["intelligence","global-risk","risk-indices"]);
const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
const MAX_AGE_MS=60*60*1000;
const SHA=/^[a-f0-9]{64}$/u;
export function verifyPaidHotSnapshotProof(product,body,now=Date.now()){
  if(!PAID_HOT_PRODUCTS.includes(product) || !Number.isFinite(now) ||
     !body || typeof body!=="object" || body.ok!==true ||
     body.product!==product)return {ready:false,reason:"MISSING_OR_UNVERIFIED_SNAPSHOT"};
  const time=Date.parse(String(body.source_as_of??""));
  const expiry=Date.parse(String(body.expires_at??""));
  if(!Number.isFinite(time)||time>now+60_000 || now-time>MAX_AGE_MS ||
     !Number.isFinite(expiry)||expiry<=now)
    return {ready:false,reason:"SOURCE_CLOCK_STALE_OR_EXPIRED"};
  // The health contract is a CURRENT paid hot-snapshot proof, not a baseline
  // continuity read. Global-Risk recovery may serve separate historical truth
  // but cannot be counted as verified current B2 publication here.
  if(body.full_b2_readback_verified!==true ||
     body.exact_gzip_restore_verified!==true ||
     body.current_b2_readback_verified===false ||
     body.current_b2_snapshot_promoted===false ||
     !SHA.test(String(body.b2_sha256??"")) ||
     !SHA.test(String(body.payload_sha256??"")))
    return {ready:false,reason:"CURRENT_B2_READBACK_NOT_VERIFIED"};
  return {ready:true,reason:"VERIFIED_CURRENT_B2_HOT"};
}
export async function probePaidIntelligenceHotSnapshots({
  fetchImpl=fetch,now=Date.now(),
}={}){
  const probes=await Promise.all(PAID_HOT_PRODUCTS.map(async product=>{
    try{
      const r=await fetchImpl(ORIGIN+"/v1/public/hot-snapshot/"+product,{
        method:"GET",redirect:"error",cache:"no-store",
        headers:{Accept:"application/json","Cache-Control":"no-cache"},
        signal:AbortSignal.timeout(9000),
      });
      if(r.status!==200 || r.redirected)return {product,ready:false,reason:"PUBLIC_SNAPSHOT_HTTP_UNAVAILABLE"};
      const raw=await r.text();
      if(raw.length>400_000)return {product,ready:false,reason:"PUBLIC_SNAPSHOT_ENVELOPE_TOO_LARGE"};
      return {product,...verifyPaidHotSnapshotProof(product,JSON.parse(raw),now)};
    }catch{return {product,ready:false,reason:"PUBLIC_SNAPSHOT_UNREADABLE"};}
  }));
  return Object.freeze({
    schema:"geomacro.paid-intelligence-three-hot-health.v1",
    ok:probes.length===3&&probes.every(p=>p.ready),
    max_source_age_minutes:60,
    checked_at:new Date(now).toISOString(),
    products:probes,
    payment_attempted:false,
    d1_writes:0,b2_requests:0,
    publisher_dispatched:false,
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const r=await probePaidIntelligenceHotSnapshots().catch(()=>null);
  console.log(JSON.stringify(r??{ok:false,reason:"PROBE_FAILED_CLOSED"}));
  if(process.env.GITHUB_STEP_SUMMARY && r){
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "### Paid Intelligence: current D1/B2 hot product evidence\n\n"+
      r.products.map(p=>"- "+p.product+": "+(p.ready?"VERIFIED":"NOT VERIFIED")+" ("+p.reason+")").join("\n")+
      "\n\nA scheduled probe is NOT a source refresh. 60-minute original source clocks and exact B2 readback remain mandatory.\n");
  }
  if(!r?.ok)process.exitCode=1;
}
