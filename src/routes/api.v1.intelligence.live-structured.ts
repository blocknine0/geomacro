import {createFileRoute} from "@tanstack/react-router";
import {allowPublicDemoRequest} from "../lib/public-demo-rate-limit.server";
import {liveStructuredData} from "../lib/live-structured-on-demand.server";
import {normalizeReusableNewsJson,normalizeReusableNewsBatch,REUSABLE_NEWS_JSON_SCHEMA} from "../lib/reusable-news-json";

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
    news_json_mode:{mode:"news-json",news:{category:"macro-fx",text:"The Federal Reserve announced a 25 basis points policy rate reduction.",source_name:"Federal Reserve",license:"unknown"}},
    news_json_schema:REUSABLE_NEWS_JSON_SCHEMA,
    news_json_raw_article_returned:false,
    news_json_commercial_license_self_certified:false,
    examples:[
      {category:"geopolitics"},
      {category:"macro-fx"},
      {category:"critical-minerals"},
      {category:"geopolitics",country_iso3:"PSE"},
      {category:"macro-fx",country_iso3:"USA"},
      {category:"critical-minerals",country_iso3:"GBR",lookback_days:7},
      {question:"What is the latest annual GDP growth for India?"},
      {question:"What is the latest EUR USD exchange rate?"},
    ],
    scope:"REVIEWED_OPEN_DATA_AND_UNSCORED_ORIGINAL_OBSERVATIONS",
    country_observation_scope:"DIRECT_ORIGINAL_PUBLISHER_UNSCORED_RESEARCH",
    supported_country_count:195,
    country_categories:["geopolitics","macro-fx","critical-minerals"],
    country_default_lookback_days:1,country_max_lookback_days:7,
    country_routing_is_not_verified_fresh_coverage:true,
    country_macro_official_annual_fallback:true,
    country_macro_annual_source:"World Bank WDI source 2 CPI/GDP",
    annual_reference_is_not_live_news_or_intraday_fx:true,
    missing_country_observation_stays_unavailable:true,
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
   const maxBody=16*1024;
   if(Number(request.headers.get("content-length")??0)>maxBody)
     return json({ok:false,chargeable:false,error:"BODY_TOO_LARGE"},413);
   let payload:unknown;
   let content="";
   try{
    content=await request.text();
    if(new TextEncoder().encode(content).length>maxBody)
      return json({ok:false,chargeable:false,error:"BODY_TOO_LARGE"},413);
    payload=JSON.parse(content);
   }catch{return json({ok:false,chargeable:false,error:"INVALID_JSON"},400);}
   if(payload&&typeof payload==="object"&&!Array.isArray(payload)&&
      (payload as Record<string,unknown>).mode==="news-json"){
     try{
       const req=payload as Record<string,unknown>;
       if(Object.keys(req).some(k=>!["mode","news","items"].includes(k))||
          (req.news===undefined)===(req.items===undefined))
         throw Error("NEWS_JSON_INPUT_INVALID");
       const output=req.news!==undefined?
         {ok:true,...normalizeReusableNewsJson(req.news)}:
         normalizeReusableNewsBatch(req.items);
       return json(output);
     }catch{
       return json({ok:false,chargeable:false,error:"NEWS_JSON_INPUT_INVALID"},400);
     }
   }
   if(new TextEncoder().encode(content).length>2048)
     return json({ok:false,chargeable:false,error:"BODY_TOO_LARGE"},413);
   const outcome=await liveStructuredData(payload);
   return json(outcome.body,outcome.statusCode);
  },
 }},
});
