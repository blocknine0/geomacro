// Isolated no-funds staging Worker. No public ingestion/write endpoints.
import {syncReadiness,syncVerifiedSignals} from "./sync-verified.mjs";
const json=(body,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});
export default {
 async fetch(request,env){
   const url=new URL(request.url);
   if(request.method!=="GET"||url.pathname!=="/_health"){
     return json({ok:false,code:"STAGING_ENDPOINT_NOT_ACTIVATED",
       source_sync_active:false,risk_gate_active:false,payment_active:false},503);
   }
   if(!env?.RC_STAGING_D1?.prepare)
     return json({ok:false,code:"STAGING_D1_BINDING_MISSING",source_sync_active:false,payment_active:false},503);
   try{
     const row=await env.RC_STAGING_D1.prepare(
       "SELECT name FROM sqlite_master WHERE type='table' AND name='gm_rc_requests' LIMIT 1"
     ).first();
     if(row?.name!=="gm_rc_requests")
       return json({ok:false,code:"STAGING_D1_SCHEMA_MISSING",source_sync_active:false,payment_active:false},503);
     const readiness=syncReadiness(env);
     return json({ok:true,service:"geomacro-rc-staging",staging_d1_schema_readback:"VERIFIED",
       source_sync_active:readiness.sync_enabled&&readiness.credentials_configured,
       risk_gate_active:false,payment_active:false,supabase_connected:false,
       sync_configured:readiness.sync_enabled&&readiness.credentials_configured,
       batch_size:readiness.batch_size,batch_count:readiness.batch_count});
   }catch{
     return json({ok:false,code:"STAGING_D1_READ_FAILED",source_sync_active:false,payment_active:false},503);
   }
 },
 async scheduled(controller,env,ctx){
   const task=(async()=>{
     const date=new Date(controller.scheduledTime);
     const result=await syncVerifiedSignals(env,date);
     // No credentials, object payloads or publisher URLs in logs.
     console.log(JSON.stringify({component:"rc-scheduled-sync",code:result.code,
       attempted:result.attempted||0,signals_written:result.signals_written||0,
       failures:result.failures||0}));
     return result;
   })();
   ctx.waitUntil(task);
 }
};
