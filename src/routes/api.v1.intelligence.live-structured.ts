import {createFileRoute} from "@tanstack/react-router";
import {allowPublicDemoRequest} from "../lib/public-demo-rate-limit.server";
import {liveStructuredData} from "../lib/live-structured-on-demand.server";

function json(data:unknown,status=200){
 return Response.json(data,{status,headers:{
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer",
 }});
}
/** No-funds, no-GRO, no intelligence database writes. */
export const Route=createFileRoute("/api/v1/intelligence/live-structured")({
 server:{handlers:{
  GET:async()=>json({
    schema:"geomacro.live-structured-discovery.v1",
    method:"POST",path:"/api/v1/intelligence/live-structured",
    examples:[
      {category:"geopolitics"},
      {category:"macro-fx"},
      {category:"critical-minerals"},
      {question:"What is the latest annual GDP growth for India?"},
      {question:"What is the latest EUR USD exchange rate?"},
    ],
    scope:"REVIEWED_OFFICIAL_OPEN_DATA",
    fetched_at_request_time:true,upstream_publication_time_may_be_older:true,
    x402_enabled:false,commercial_payment_authorized:false,
    durable_storage_required:false,signed_gro_required:false,
  }),
  POST:async ({request}:{request:Request})=>{
   if(!allowPublicDemoRequest(request,{namespace:"geomacro-stateless-live-v1",
      windowMs:60_000,maxPerClient:8,maxGlobal:100}))
     return json({ok:false,chargeable:false,error:"RATE_LIMITED"},429);
   if(!(request.headers.get("content-type")??"").toLowerCase().includes("application/json"))
     return json({ok:false,chargeable:false,error:"JSON_REQUIRED"},415);
   if(Number(request.headers.get("content-length")??0)>2048)
     return json({ok:false,chargeable:false,error:"BODY_TOO_LARGE"},413);
   let payload:unknown;
   try{
    const content=await request.text();
    if(new TextEncoder().encode(content).length>2048)
      return json({ok:false,chargeable:false,error:"BODY_TOO_LARGE"},413);
    payload=JSON.parse(content);
   }catch{return json({ok:false,chargeable:false,error:"INVALID_JSON"},400);}
   const outcome=await liveStructuredData(payload);
   return json(outcome.body,outcome.statusCode);
  },
 }},
});
