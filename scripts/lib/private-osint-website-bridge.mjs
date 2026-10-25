/**
 * Narrow website editorial bridge for pinned FIRST-PARTY OSINT observations.
 * Original titles and permalinks exist only in the collector's process memory.
 * The public 72h journal receives only the existing source-credited, unscored,
 * derived signals. Private OSINT rows are never copied to public storage.
 */
import {GLOBAL_OFFICIAL_RELEASE_FEEDS,globalOriginalArticleUrl} from "./global-official-release-feeds.mjs";

const OFFICIAL=new Map(GLOBAL_OFFICIAL_RELEASE_FEEDS.filter(s=>
 ["rss","atom","rdf","xml"].includes(s.format) && typeof s.credit==="string" &&
 s.credit.length>0).map(s=>[s.url,s]));
const AGE=25*3600000;
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const JOURNAL="/v1/website-derived-news";

export function officialWebsiteCandidateFromOsint(row,now=Date.now()){
 if(!row||!Number.isFinite(now)||typeof row.source_url!=="string"||
    typeof row.title!=="string"||row.title.length<25||row.title.length>250||
    /[<>]/u.test(row.title)||!CATEGORIES.has(row.category)||
    typeof row.published_at!=="string"||
    !/^\\d{4}-\\d\\d-\\d\\dT\\d\\d:\\d\\d:\\d\\d(?:\\.\\d{1,3})?Z$/u.test(row.published_at))
   return null;
 const spec=OFFICIAL.get(row.source_url);
 if(!spec||spec.category!==row.category)return null;
 const time=Date.parse(row.published_at);
 if(!Number.isFinite(time)||time>now||now-time>AGE||
    new Date(time).toISOString()!==row.published_at)return null;
 const articleUrl=globalOriginalArticleUrl(row.article_url,spec);
 if(!articleUrl)return null;
 // The official feed identifies the issuer; it does NOT establish an event
 // actor, independent original-page byte proof, or commercial data rights.
 const issuerCredit=spec.id.startsWith("govuk_")?
   "UK Government. "+spec.credit:spec.id==="eu_council_press_original"?
   "Council of the European Union. "+spec.credit:spec.credit;
 return {title:row.title,articleUrl,publishedAt:row.published_at,
   sourceId:spec.id,category:row.category,credit:issuerCredit};
}

export async function publishPrivateOsintWebsiteSignals({
 signals,controlPlaneRoot,controlToken,readAll,fetchImpl=fetch,now=Date.now()
}={}){
 if(!Array.isArray(signals)||signals.length>200||
    typeof readAll!=="function"||typeof fetchImpl!=="function"||
    typeof controlPlaneRoot!=="string"||
    !/^https:\/\/geomacro-control-plane\\.[a-z0-9-]+\\.workers\\.dev$/u.test(controlPlaneRoot)||
    !/^[a-f0-9]{64}$/u.test(controlToken??"")||!Number.isFinite(now))
   throw Error("PRIVATE_OSINT_WEBSITE_BRIDGE_CONFIG_INVALID");
 // Source-publisher observations are not certified event facts or scored,
 // and may never be promoted to paid intelligence by this bridge.
 if(signals.some(s=>!CATEGORIES.has(s?.category)||
    !["official_release_observed_unscored","official_feed_candidate_unscored"].includes(s.status)||
    s.same_event_corrob_verified!==false||s.severity!==null||
    !Array.isArray(s.sources_credited)||s.sources_credited.length!==1||
    typeof s.sources_credited[0]!=="string"||!s.sources_credited[0].trim()||
    JSON.stringify(s).includes("https://")))
   throw Error("PRIVATE_OSINT_WEBSITE_BRIDGE_SIGNAL_UNSAFE");
 if(signals.length===0)return {candidates:0,new_derived_stories:0,
   journal_readback_verified:true,private_raw_published:false};
 const existing=await readAll(fetchImpl,now);
 if(!Array.isArray(existing))throw Error("PRIVATE_OSINT_WEBSITE_BASELINE_INVALID");
 const ids=new Set(existing.map(s=>s.id));
 const unique=new Set();
 const pending=signals.filter(s=>{
   if(ids.has(s.id)||unique.has(s.id))return false;
   unique.add(s.id);return true;
 });
 for(let i=0;i<pending.length;i+=50){
   const batch=pending.slice(i,i+50);
   const res=await fetchImpl(controlPlaneRoot+JOURNAL,{
     method:"PUT",redirect:"error",cache:"no-store",
     headers:{"Content-Type":"application/json","Accept":"application/json",
       "Authorization":"Bearer "+controlToken},
     body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:batch}),
     signal:AbortSignal.timeout(16000),
   });
   if(res.status!==200)throw Error("PRIVATE_OSINT_WEBSITE_WRITE_HTTP_"+res.status);
   const receipt=await res.json();
   if(receipt?.schema!=="geomacro.website-derived-news-write-receipt.v1"||
      receipt.ok!==true||receipt.accepted!==batch.length||
      receipt.persistent_derived_only!==true||receipt.chargeable!==false)
     throw Error("PRIVATE_OSINT_WEBSITE_WRITE_REJECTED");
 }
 if(pending.length){
   const after=await readAll(fetchImpl,Date.now());
   if(!Array.isArray(after))throw Error("PRIVATE_OSINT_WEBSITE_READBACK_MISSING");
   const confirmed=new Set(after.map(s=>s.id));
   if(pending.some(s=>!confirmed.has(s.id)))
     throw Error("PRIVATE_OSINT_WEBSITE_EXACT_READBACK_FAILED");
 }
 return {candidates:signals.length,new_derived_stories:pending.length,
   journal_readback_verified:true,private_raw_published:false};
}
