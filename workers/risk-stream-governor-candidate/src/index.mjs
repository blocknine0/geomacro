/**
 * Isolated 0%-traffic staging gateway for the REVIEWED B2 quota module.
 * Shadow D1 only; no production D1, B2, queues, customer routes or funds.
 */
import {readB2AccountQuota} from "../../control-plane/src/b2-account-quota.mjs";
const bytes=new TextEncoder();
async function hash(t){return new Uint8Array(await crypto.subtle.digest("SHA-256",bytes.encode(t)))}
async function auth(req,env){
 const token=env.SHADOW_GOVERNOR_ADMIN_BEARER;
 const h=req.headers.get("Authorization")||"";
 if(!/^[a-f0-9]{64}$/.test(token??"")||!/^Bearer [a-f0-9]{64}$/.test(h))return false;
 const [a,b]=await Promise.all([hash(token),hash(h.slice(7))]);
 let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];
 return different===0;
}
const json=(value,status)=>Response.json(value,{status,headers:{"Cache-Control":"no-store"}});
export default {async fetch(req,env){
 if(env?.SHADOW_MODE!=="ISOLATED_GOVERNOR_POLICY"||env?.SHADOW_NO_FUNDS!=="1"||
  env?.RISK_STREAM_ACTIVE!=="0"||env?.STREAM_INGESTION_ENABLED!=="false"||
  env?.SHADOW_DB_NAME!=="geomacro-risk-stream-shadow"||
  !/^[a-f0-9]{40}$/.test(env?.SHADOW_REVIEWED_SHA??"")||!env?.DB?.prepare)
   return json({ok:false,error:"SHADOW_GOVERNOR_BINDINGS_HOLD"},503);
 const u=new URL(req.url);
 if(req.method!=="GET"||u.pathname!=="/v1/b2-quota/status"||u.search)
  return json({ok:false,error:"NOT_FOUND"},404);
 if(!await auth(req,env))return json({ok:false,error:"UNAUTHORIZED"},401);
 try{
  const status=await readB2AccountQuota(env.DB);
  return json({...status,candidate:{
   schema:"geomacro.shadow-governor-candidate.v1",
   scope:"ISOLATED_SHADOW_D1_ONLY",source_sha:env.SHADOW_REVIEWED_SHA,
   db_name:env.SHADOW_DB_NAME,production_d1_ledger_verified:false,
   provider_backblaze_telemetry_verified:false,release_hold_removed:false,
   customer_delivery:false,no_funds:true
  }},200);
 }catch{return json({ok:false,error:"SHADOW_D1_READ_FAILED"},503)}
}};
