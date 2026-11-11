#!/usr/bin/env node
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";
export const CANDIDATE_HOST=/^https:\/\/geomacro-risk-stream-governor-candidate\.[a-z0-9-]+\.workers\.dev$/u;
export async function verifyCandidateGovernor({base,bearer,expectedSha,fetchImpl=fetch,now=new Date()}={}){
 if(!CANDIDATE_HOST.test(base??""))throw Error("CANDIDATE_GOVERNOR_HOST_UNTRUSTED");
 if(!/^[a-f0-9]{64}$/.test(bearer??""))throw Error("CANDIDATE_GOVERNOR_AUTH_INVALID");
 if(!/^[a-f0-9]{40}$/.test(expectedSha??""))throw Error("CANDIDATE_GOVERNOR_SHA_INVALID");
 const uri=base+"/v1/b2-quota/status";
 const opts={cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)};
 const noAuth=await fetchImpl(uri,opts);
 if(noAuth.status!==401)throw Error("CANDIDATE_GOVERNOR_UNAUTHENTICATED_ACCESS");
 const r=await fetchImpl(uri,{...opts,headers:{Authorization:"Bearer "+bearer}});
 if(r.status!==200)throw Error("CANDIDATE_GOVERNOR_READBACK_HTTP_"+r.status);
 const live=await r.json(),c=live?.candidate;
 if(live?.ok!==true||live.schema!=="geomacro.b2-account-quota-status.v1"||
  live.day_utc!==now.toISOString().slice(0,10)||
  c?.schema!=="geomacro.shadow-governor-candidate.v1"||
  c.scope!=="ISOLATED_SHADOW_D1_ONLY"||c.source_sha!==expectedSha||
  c.db_name!=="geomacro-risk-stream-shadow"||c.production_d1_ledger_verified!==false||
  c.provider_backblaze_telemetry_verified!==false||c.release_hold_removed!==false||
  c.customer_delivery!==false||c.no_funds!==true)
  throw Error("CANDIDATE_GOVERNOR_SCOPE_OR_SHA_INVALID");
 for(const k of ["total","GET","PUT","HEAD","NATIVE_AUTH"]){
  if(live.limits?.[k]!==B2_DAILY_LIMITS[k]||
   !Number.isSafeInteger(live.used?.[k])||live.used[k]<0||
   live.used[k]>B2_DAILY_LIMITS[k])throw Error("CANDIDATE_GOVERNOR_POLICY_DRIFT_"+k);
 }
 if(live.used.total!==live.used.GET+live.used.PUT+live.used.HEAD+live.used.NATIVE_AUTH)
  throw Error("CANDIDATE_GOVERNOR_COUNTERS_INVALID");
 return {schema:"geomacro.shadow-governor-candidate-parity.v1",
  status:"SHADOW_CANDIDATE_D1_POLICY_MATCH",
  source_sha:expectedSha,verified_route:"SHADOW_CANDIDATE_ISOLATED_WORKERS_DEV",
  shadow_db:"geomacro-risk-stream-shadow",limits:live.limits,
  used:live.used,day_utc:live.day_utc,
  unauthenticated_http_401_verified:true,
  cloudflare_deployed_candidate_readback:true,
  imported_production_quota_module:true,
  production_d1_ledger_verified:false,
  live_production_governor_parity_not_inferred:true,
  expected_b2_network_ops_for_shadow:0,
  commercial_release_authorized:false};
}
