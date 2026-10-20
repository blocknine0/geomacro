#!/usr/bin/env node
/**
 * Owner-secret-safe live proof: old Predge research HMAC v1 is rejected after
 * new v2 credential deployment. Never log the root or either bearer.
 */
import {createHmac,timingSafeEqual} from "node:crypto";
const origin=String(process.env.CONTROL_PLANE_URL??"").replace(/\/+$/,"");
const root=String(process.env.ROOT_LEDGER_TOKEN??"");
const current=String(process.env.PREDGE_RESEARCH_NEWS_TOKEN??"");
const v1="geomacro-predge-72h-research-only-v1";
const v2="geomacro-predge-72h-research-only-v2-20261020";
const sha=label=>createHmac("sha256",root).update(label).digest("hex");
async function main(fetcher=fetch){
 if(!/^https:\/\/[A-Za-z0-9._-]+\.workers\.dev$/.test(origin)||
   root.length<32||!/^[a-f0-9]{64}$/.test(current))
   throw Error("PREDGE_REVOKE_PROBE_CONFIG_INVALID");
 const old=sha(v1),newDerived=sha(v2);
 if(old===newDerived||old===current)throw Error("PREDGE_V1_STILL_CONFIGURED");
 const url=origin+"/v1/partner/predge/derived-structural-72h";
 const request=async token=>{
   const response=await fetcher(url,{method:"GET",redirect:"manual",
     headers:{authorization:"Bearer "+token},
     signal:AbortSignal.timeout(12000)});
   if(response.status>=300&&response.status<400)throw Error("PREDGE_REDIRECT_BLOCKED");
   const body=await response.json().catch(()=>null);
   if(!body||typeof body!=="object")throw Error("PREDGE_UNPARSEABLE");
   return {status:response.status,body};
 };
 const expired=await request(old);
 if(expired.status!==401||expired.body.ok!==false)throw Error("PREDGE_V1_REVOCATION_FAILED");
 const active=await request(current);
 if(active.status!==200||active.body.ok!==true||
    active.body.execution_authorized!==false||
    active.body.partner_resale_or_commercial_redistribution_authorized!==false)
   throw Error("PREDGE_V2_NOT_ACTIVE");
 console.log("PASS: old research-v1 Bearer HTTP 401, current purpose-scoped research Bearer HTTP 200; no funds or key disclosure");
}
main().catch(err=>{console.error("PREDGE_ROTATION_ACCEPTANCE_FAILED:",String(err.message).slice(0,100));process.exitCode=2;});
