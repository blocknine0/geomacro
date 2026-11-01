// Public static-only coherent-snapshot guard. It never touches D1, B2,
// partner endpoints, source identities, signing, payment or original dates.
const GUARDED=new Set(["/latest.json","/coverage-72h.json","/daily-highlights.json"]);
const MAX_BYTES=2_000_000,MAX_AGE=6*60*60_000;
const denied=()=>Response.json({
 ok:false,error:"PUBLIC_ARCHIVE_COHORT_UNVERIFIED",
 free_website_only:true,paid_eligible:false
},{status:503,headers:{"Cache-Control":"no-store",
 "Access-Control-Allow-Origin":"*","X-Content-Type-Options":"nosniff"}});
const finiteClock=(stamp,now)=>{
 const value=Date.parse(stamp);
 return Number.isFinite(value)&&value<=now+60_000&&now-value<=MAX_AGE?value:null;
};
export function checkPublicStaticCohort(latest,coverage,now=Date.now()){
 if(!Number.isFinite(now)||latest?.ok!==true||
    latest.schema!=="geomacro.website-derived-news-feed.v1"||
    latest.delivery_scope!=="free_website_only"||
    latest.chargeable!==false||latest.scored!==false||
    latest.supabase_dependency!==false||latest.retention_hours!==72||
    !Array.isArray(latest.signals)||latest.signals.length>250||
    coverage?.schema!=="geomacro.free-derived-archive-eligibility.v1"||
    coverage.retention_hours!==72||coverage.free_website_only!==true||
    coverage.signed_or_scored!==false||
    coverage.unverified_promoted!==false||
    coverage.paid_customer_eligible!==false||
    coverage.live_payment_authorized!==false||
    coverage.d1_reads!==0||
    !/^[a-f0-9]{64}$/u.test(String(coverage.eligible_ids_sha256??"")))
   return false;
 const l=finiteClock(latest.checked_at,now);
 const c=finiteClock(coverage.checked_at,now);
 return l!==null&&c!==null&&Math.abs(l-c)<=30_000;
}
/** Native source times, official-only original statements and issuer credit:
 * the dashboard never promotes OSINT reports to official evidence. */
export function checkDailyPublicOfficialCohort(daily,latest,now=Date.now()){
 if(daily?.ok!==true||daily.schema!=="geomacro.public-daily-official-finds.v1"||
    daily.selection_window_days!==30||daily.source_window!=="archived_original_release"||
    daily.official_only!==true||daily.independently_corrob_verified!==false||
    daily.chargeable!==false||daily.scored!==false||
    daily.source_urls_returned!==false||daily.mandatory_source_credits_preserved!==true||
    !Array.isArray(daily.signals)||daily.signals.length>36||
    !Number.isFinite(Date.parse(daily.generated_at??""))||
    Math.abs(Date.parse(daily.generated_at)-Date.parse(latest?.checked_at??""))>30_000||
    finiteClock(daily.generated_at,now)===null)return false;
 const domains=new Set(["geopolitics","macro","rare_earth"]);
 for(const signal of daily.signals){
   if(signal?.status!=="official_release_observed_unscored"||
      !domains.has(signal.category)||signal.observed_release_count!==1||
      signal.same_event_corrob_verified!==false||signal.severity!==null||
      typeof signal.title!=="string"||!signal.title.startsWith("Geomacro finds ")||
      !Array.isArray(signal.sources_credited)||signal.sources_credited.length>2||
      signal.sources_credited.some(c=>typeof c!=="string"||c.length>230||
        /https?:\\/\\/|www\\.|[<>]/iu.test(c))||
      !["exact","day"].includes(signal.date_precision))return false;
   const original=signal.date_precision==="day"
      ?String(signal.published_at)+"T00:00:00.000Z":String(signal.published_at);
   const at=Date.parse(original);
   if(!Number.isFinite(at)||at>now||now-at>30*86_400_000||
      (signal.date_precision==="day"&&at+36*3_600_000>now))return false;
 }
 return true;
}
async function readAssetJson(env,request,path){
 const url=new URL(request.url);
 url.pathname=path;url.search="";
 const response=await env.ASSETS.fetch(new Request(url.toString(),{
  method:"GET",headers:{"Cache-Control":"no-cache","Accept":"application/json"}
 }));
 if(response.status!==200||response.redirected||
    Number(response.headers.get("content-length")??0)>MAX_BYTES)
   throw Error("STATIC_ASSET_INVALID");
 const body=await response.text();
 if(body.length>MAX_BYTES)throw Error("STATIC_ASSET_OVER_CAP");
 return {json:JSON.parse(body),body};
}
export async function serveGuardedPublicStaticAsset(request,env,now=Date.now()){
 try{
  const selected=new URL(request.url).pathname;
  if(!GUARDED.has(selected))return denied();
  const [latest,coverage]=await Promise.all([
   readAssetJson(env,request,"/latest.json"),
   readAssetJson(env,request,"/coverage-72h.json"),
  ]);
  if(!checkPublicStaticCohort(latest.json,coverage.json,now))return denied();
  let body=selected==="/latest.json"?latest.body:coverage.body;
  if(selected==="/daily-highlights.json"){
    const daily=await readAssetJson(env,request,selected);
    if(!checkDailyPublicOfficialCohort(daily.json,latest.json,now))return denied();
    body=daily.body;
  }
  return new Response(request.method==="HEAD"?null:body,{
   status:200,headers:{"Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store","Access-Control-Allow-Origin":"*",
    "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}
  });
 }catch{return denied();}
}
export default {
 async fetch(request,env){
  if(request.method!=="GET"&&request.method!=="HEAD")
   return Response.json({ok:false,error:"METHOD_NOT_ALLOWED"},{
    status:405,headers:{"Cache-Control":"no-store"}});
  const path=new URL(request.url).pathname;
  if(GUARDED.has(path))
   return serveGuardedPublicStaticAsset(request,env);
  // Includes the historical/PREDGE static snapshot path: unchanged handler.
  return env.ASSETS.fetch(request);
 }
};
