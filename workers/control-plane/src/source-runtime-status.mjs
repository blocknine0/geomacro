import {validOpenDataContext} from "../../../src/lib/category-open-data-contract.ts";
const json=(v,status=200)=>Response.json(v,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"*"}});
const scopes={geopolitics:"geopolitics","macro-fx":"macro","critical-minerals":"rare_earth"};
export async function getSourceRuntimeContext(env,category,now=Date.now()){
  if(!Object.hasOwn(scopes,category))return json({ok:false,error:"SOURCE_RUNTIME_CATEGORY_INVALID"},400);
  try{
    const row=await env.DB.prepare("SELECT metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope=? LIMIT 1")
      .bind("supabase_free_source_runtime",scopes[category]).first();
    const context=JSON.parse(row?.metadata_json??"{}").context;
    if(!validOpenDataContext(context,category,now))throw Error("INVALID_CONTEXT");
    return json(context);
  }catch{return json({ok:false,error:"SOURCE_RUNTIME_CONTEXT_UNAVAILABLE",chargeable:false},503);}
}
export async function getSourceRuntimeStatus(env,now=Date.now()){
  try{
    const row=await env.DB.prepare("SELECT metadata_json FROM pipeline_checkpoint WHERE pipeline=? AND scope=? LIMIT 1")
      .bind("supabase_free_source_runtime","summary").first();
    const report=JSON.parse(row?.metadata_json??"{}").report;
    const at=Date.parse(report?.checked_at??"");
    if(report?.schema!=="geomacro.supabase-free-source-runtime.v1"||!Number.isFinite(at)||at>now||now-at>3*60*60_000||
      report.supabase_requests!==0||report.b2_requests!==0||report.payments!==0||report.chargeable!==false||
      !Array.isArray(report.contexts)||report.contexts.length!==3||new Set(report.contexts.map(x=>x.category)).size!==3)
      throw Error("INVALID_RUNTIME");
    const contexts=report.contexts.map(x=>{
      if(!["geopolitics","macro","rare_earth"].includes(x.category)||
        ![x.source_families_attempted,x.source_families_readable,x.derived_context_count].every(Number.isSafeInteger)||
        x.source_families_attempted<1||x.source_families_attempted>25||x.source_families_readable<0||
        x.source_families_readable>x.source_families_attempted||x.derived_context_count<0||x.derived_context_count>8)throw Error("INVALID_RUNTIME");
      return {category:x.category,source_families_attempted:x.source_families_attempted,
        source_families_readable:x.source_families_readable,derived_context_count:x.derived_context_count};
    });
    const event=report.gdelt_event,gkg=report.gdelt_gkg;
    const eventOk=event?.archive_integrity_verified===true&&event.status==="STATIC_EVENT_BATCH_READ";
    const gkgOk=gkg?.archive_integrity_verified===true&&gkg.state==="CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY";
    return json({schema:"geomacro.supabase-free-source-runtime-public.v1",ok:true,checked_at:report.checked_at,
      status:eventOk&&gkgOk&&contexts.every(x=>x.source_families_readable>0)?"ALL_CATEGORY_LANES_READABLE":"SOURCE_LANES_DEGRADED",
      gdelt_event_static_readable:eventOk,gdelt_gkg_static_readable:gkgOk,contexts,
      gdelt_index_clock_is_original_publication:false,original_events_independently_verified:false,
      supabase_requests:0,b2_requests:0,payments:0,chargeable:false});
  }catch{return json({ok:false,error:"SOURCE_RUNTIME_STATUS_UNAVAILABLE",chargeable:false},503);}
}
