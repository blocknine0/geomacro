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
  const validSha=SHA.test(String(body.b2_sha256??"")) &&
    SHA.test(String(body.payload_sha256??""));
  const directCurrent=body.full_b2_readback_verified===true &&
    body.exact_gzip_restore_verified===true &&
    body.current_b2_readback_verified!==false &&
    body.current_b2_snapshot_promoted!==false;
  const approvedGriRecovery=product==="global-risk" &&
    body.proof_schema==="geomacro.public-global-risk-current-proof.v1" &&
    body.verification_mode==="independent-gri-proof-over-b2-baseline" &&
    body.baseline_b2_readback_verified===true &&
    body.baseline_exact_gzip_restore_verified===true &&
    body.current_b2_readback_verified===false &&
    body.current_b2_snapshot_promoted===false;
  if(!validSha || !(directCurrent||approvedGriRecovery))
    return {ready:false,reason:"B2_READBACK_NOT_VERIFIED"};
  return {ready:true,reason:directCurrent?"VERIFIED_CURRENT_B2_HOT":"SIGNED_GRI_OVER_VERIFIED_B2_BASELINE"};
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
  // The canonical website performs additional hash, clock, issuer-schema and
  // payload crosschecks. Its real deep health must agree before the watchdog
  // may call the live paid product ready.
  let productionDeepReady=false;
  try {
    const response=await fetchImpl("https://geomacro.live/api/health?deep=1",{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{Accept:"application/json","Cache-Control":"no-cache"},
      signal:AbortSignal.timeout(12000),
    });
    if(response.status===200&&!response.redirected){
      const raw=await response.text();
      if(raw.length<=400_000){
        const h=JSON.parse(raw),p=h?.public_production;
        productionDeepReady=h?.ok===true && p?.b2_runtime_configured===true &&
          p?.intelligence_ready===true && p?.global_risk_ready===true &&
          p?.risk_indices_ready===true && p?.risk_verification_status==="verified" &&
          p?.hot_snapshot_serving &&
          Object.keys(p.hot_snapshot_serving).length===3 &&
          Object.values(p.hot_snapshot_serving).every(x=>x?.ok===true);
      }
    }
  } catch { /* An unreadable production endpoint never counts as green. */ }
  return Object.freeze({
    schema:"geomacro.paid-intelligence-three-hot-health.v1",
    ok:productionDeepReady&&probes.length===3&&probes.every(p=>p.ready),
    production_deep_health_verified:productionDeepReady,
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
