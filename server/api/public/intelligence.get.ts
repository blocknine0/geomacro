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
    try{
      const derived=await readWebsiteDerivedNews();
      derived_signals=derived.signals;derived_checked_at=derived.checked_at;
    }catch{/* Do not turn a verified legacy package into a false failure. */}
    if(!payload&&!derived_signals.length)
      return {ok:false,error:"INTELLIGENCE_UNAVAILABLE",rows:[],mode:"live_observed_only",
        verified_rows:0,live_observed_rows:0,newest_at:null,current_within_24h:false,
        generated_at:new Date().toISOString()};
    const fallback=payload??{ok:true,rows:[],mode:"live_observed_only",verified_rows:0,
      live_observed_rows:derived_signals.length,newest_at:derived_signals[0]?.published_at??null,
      current_within_24h:false,generated_at:derived_checked_at};
    return {...fallback,ok:true,derived_signals,derived_checked_at,
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
