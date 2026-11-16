import {
  fetchVerifiedIntelligenceEdge,
  buildVerifiedIntelligenceApiPayload,
} from "../../../src/lib/public-intelligence-edge";
import {
  defineEventHandler,
  setResponseStatus,
} from "h3";
import {readWebsiteDerivedNews} from "../../../src/lib/website-derived-news-reader.server";
import {publicResponseCache} from "./public-response-cache.server";
import {classifyDerivedNewsD1Failure} from "../../../scripts/lib/derived-news-d1-failure.mjs";

export default defineEventHandler(async (event) => {
  try{return await publicResponseCache(event,"public-intelligence-v1",async()=>{
    let payload:Record<string,unknown>|null=null;
    // Lovable preview does not have private B2 credentials. Its public route
    // must serve the same authoritative proof-verified Cloudflare projection
    // used by production before touching any server-only storage runtime.
    try {
      const verified = await fetchVerifiedIntelligenceEdge();
      payload = { ok: true, ...buildVerifiedIntelligenceApiPayload(verified) };
    } catch {
      // The existing B2-backed server reader is a canonical-production
      // fallback only. Never expose a forged or downgraded package.
      try{
        const {readProductionPublicIntelligence}=await import(
          "../../../src/lib/public-intelligence-production.server");
        payload=await readProductionPublicIntelligence();
      }catch{/* A live derived journal below is an independent public fallback. */}
    }
    let derived_signals=[] as Awaited<ReturnType<typeof readWebsiteDerivedNews>>["signals"];
    let derived_checked_at:string|null=null;
    let derived_read_status="unavailable";
    try{
      const derived=await readWebsiteDerivedNews();
      derived_signals=derived.signals;derived_checked_at=derived.checked_at;
      derived_read_status="ok";
    }catch(error){
      // Safe allowlisted class only; never expose SQL, URLs, or provider text.
      derived_read_status=classifyDerivedNewsD1Failure(error);
    }
    const derived_counts={geopolitics:0,macro:0,rare_earth:0};
    const derived_latest_by_category:{geopolitics:number|null;macro:number|null;rare_earth:number|null}=
      {geopolitics:null,macro:null,rare_earth:null};
    for(const signal of derived_signals){
      derived_counts[signal.category]++;
      const published=Date.parse(signal.published_at);
      if(Number.isFinite(published))derived_latest_by_category[signal.category]=Math.max(
        derived_latest_by_category[signal.category]??-Infinity,published);
    }
    const derived_newest_ms=Math.max(-Infinity,...Object.values(derived_latest_by_category)
      .filter((value):value is number=>value!==null));
    const derived_newest_at=Number.isFinite(derived_newest_ms)?new Date(derived_newest_ms).toISOString():null;
    const derived_now=Date.now();
    const derived_current_within_24h=Object.values(derived_latest_by_category).every(value=>
      value!==null&&value<=derived_now&&derived_now-value<=24*60*60_000);
    if(!payload&&!derived_signals.length)
      return {ok:false,error:"INTELLIGENCE_UNAVAILABLE",rows:[],mode:"live_observed_only",
        verified_rows:0,live_observed_rows:0,newest_at:null,current_within_24h:false,
        derived_signals:[],derived_rows:0,derived_category_counts:derived_counts,
        derived_categories_covered:[],derived_current_within_24h:false,derived_newest_at:null,
        derived_read_status,
        generated_at:new Date().toISOString()};
    const fallback=payload??{ok:true,rows:[],mode:"live_observed_only",verified_rows:0,
      live_observed_rows:0,newest_at:null,
      current_within_24h:false,generated_at:derived_checked_at};
    return {...fallback,ok:true,derived_signals,derived_checked_at,
      derived_rows:derived_signals.length,derived_category_counts:derived_counts,
      derived_latest_by_category:Object.fromEntries(Object.entries(derived_latest_by_category)
        .map(([category,value])=>[category,value===null?null:new Date(value).toISOString()])),
      derived_categories_covered:Object.entries(derived_counts).filter(([,count])=>count>0).map(([category])=>category),
      derived_current_within_24h,derived_newest_at,
      derived_read_status,
      derived_categories:["geopolitics","macro","rare_earth"]};
  });}catch(error){
    console.error("[api/public/intelligence] unavailable",
      error instanceof Error?error.message:"unknown error");
    setResponseStatus(event,503);
    return {ok:false,error:"INTELLIGENCE_UNAVAILABLE",rows:[],mode:"live_observed_only",
      verified_rows:0,live_observed_rows:0,newest_at:null,current_within_24h:false,
      generated_at:new Date().toISOString()};
  }
});
