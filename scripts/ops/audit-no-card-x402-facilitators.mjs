#!/usr/bin/env node
/** Only GET /supported; cannot verify, settle or access customer payments. */
import {PROVIDERS,auditOptions} from "../lib/no-card-x402-facilitator-policy.mjs";
async function query(name){
  try{
    const r=await fetch(PROVIDERS[name].url+"/supported",{
      method:"GET",redirect:"error",headers:{Accept:"application/json"},signal:AbortSignal.timeout(6500),
    });
    if(!r.ok)throw Error("HTTP_"+r.status);
    if(Number(r.headers.get("content-length")||0)>131072)throw Error("BODY_TOO_LARGE");
    const text=await r.text();
    if(text.length>131072)throw Error("BODY_TOO_LARGE");
    return {payload:JSON.parse(text),error:null};
  }catch(e){return{payload:null,error:e instanceof Error?e.message.slice(0,80):"UNAVAILABLE"}}
}
const names=Object.keys(PROVIDERS);
const checked=Object.fromEntries(await Promise.all(names.map(async n=>[n,await query(n)])));
const responses=Object.fromEntries(names.map(n=>[n,checked[n].payload]));
const result={
  schema_version:"geomacro.no-card-facilitator-audit.v1",mode:"NO_FUNDS_GET_ONLY",
  observed_at:new Date().toISOString(),paymentEnabled:false,netProfitVerified:false,
  chains:{base:auditOptions("base",responses),polygon:auditOptions("polygon",responses),arc:auditOptions("arc",responses)},
  errors:Object.fromEntries(names.map(n=>[n,checked[n].error])),
};
process.stdout.write(JSON.stringify(result,null,2)+"\n");
if(!result.chains.base.some(x=>x.supportedNow)||
   !result.chains.polygon.some(x=>x.supportedNow))process.exitCode=1;
