import {createFileRoute} from "@tanstack/react-router";
import {fetchWithoutRedirect} from "../lib/fetch-without-redirect";

const DEFAULT_WORKER="https://geomacro-control-plane.daspallab202391.workers.dev";
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function notReady(){
 return Response.json({status:"not_ready",authority:"cloudflare-d1",
   paid_launch_approved:false,execution_authorized:false,
   checks:{database:false,audit_store:false,isolated_partner_credential:false,
     active_pinned_verification_key:false,fresh_verified_commercial_country_gro:false}},
  {status:503,headers:HEADERS});
}
export async function readD1RiskGateReadiness(fetcher=fetchWithoutRedirect):Promise<Response>{
 const base=String(process.env.GEOMACRO_CONTROL_PLANE_URL??DEFAULT_WORKER).replace(/\/+$/,"");
 if(!/^https:\/\/[A-Za-z0-9._-]+(?::443)?$/.test(base))return notReady();
 try{
   const response=await fetcher(base+"/v1/public/risk-gate-d1-readiness",{
     method:"GET",redirect:"manual",headers:{accept:"application/json"},
     signal:AbortSignal.timeout(4500),
   });
   if(response.status!==200&&response.status!==503)return notReady();
   const text=await response.text();
   if(Buffer.byteLength(text,"utf8")>16384)return notReady();
   const data=JSON.parse(text);
   if(data.authority!=="cloudflare-d1"||
      data.execution_authorized!==false||
      data.paid_launch_approved!==false||
      (response.status===200&&(
        data.status!=="ready"||
        !data.checks?.database||!data.checks?.audit_store||
        !data.checks?.isolated_partner_credential||
        !data.checks?.active_pinned_verification_key||
        !data.checks?.fresh_verified_commercial_country_gro)))
      return notReady();
   return Response.json(data,{status:response.status,headers:HEADERS});
 }catch{return notReady();}
}
export const Route=createFileRoute("/api/risk-gate-readiness")({
 server:{handlers:{GET:async()=>readD1RiskGateReadiness()}},
});
