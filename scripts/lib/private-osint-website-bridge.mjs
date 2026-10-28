import {createHash} from "node:crypto";
import {readIntakeBaseline} from "./budgeted-news-intake.mjs";
/**
 * Narrow website editorial bridge for pinned FIRST-PARTY OSINT observations.
 * Original titles and permalinks exist only in the collector's process memory.
 * The public 72h journal receives only the existing source-credited, unscored,
 * derived signals. Private OSINT rows are never copied to public storage.
 */
import {GLOBAL_OFFICIAL_RELEASE_FEEDS,globalOriginalArticleUrl} from "./global-official-release-feeds.mjs";
import {isSafeDerivedNewsReadbackSignal} from "./derived-news-readback-policy.mjs";

// Fixed first-party U.S. federal RSS paths already accepted by the private
// production source inventory. Government-authored facts (not third-party
// media or full articles) may be converted to our own source-private cards.
const FEDERAL_FEEDS=[
 {id:"white_house_presidential_actions",url:"https://www.whitehouse.gov/presidential-actions/feed/",
  category:"geopolitics",format:"rss",host:"www.whitehouse.gov",
  path:/^\/presidential-actions\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9-]{8,380}\/$/u,
  credit:null},
 {id:"white_house_statements",url:"https://www.whitehouse.gov/briefings-statements/feed/",
  category:"geopolitics",format:"rss",host:"www.whitehouse.gov",
  path:/^\/briefings-statements\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9-]{8,380}\/$/u,
  credit:null},
];
const OFFICIAL=new Map([...GLOBAL_OFFICIAL_RELEASE_FEEDS,...FEDERAL_FEEDS.flatMap(s=>
 ["geopolitics","macro","rare_earth"].map(category=>({...s,category})))]
 .filter(s=>["rss","atom","rdf","xml"].includes(s.format))
 .map(s=>[s.category+"|"+s.url,s]));
const AGE=72*3600000;
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const JOURNAL="/v1/website-derived-news";


// First-party pinned feeds with strict original-permalink policy cannot be
// reclassified as a weaker OSINT record when their original link is invalid.
export function isKnownOfficialWebsiteFeed(url,category){
 return typeof url==="string"&&CATEGORIES.has(category)&&
   OFFICIAL.has(category+"|"+url);
}

export function officialWebsiteCandidateFromOsint(row,now=Date.now()){
 if(!row||!Number.isFinite(now)||typeof row.source_url!=="string"||
    typeof row.title!=="string"||row.title.length<25||row.title.length>250||
    /[<>]/u.test(row.title)||!CATEGORIES.has(row.category)||
    typeof row.published_at!=="string"||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(row.published_at))
   return null;
 const spec=OFFICIAL.get(row.category+"|"+row.source_url);
 if(!spec||spec.category!==row.category)return null;
 const time=Date.parse(row.published_at);
 if(!Number.isFinite(time)||time>now||now-time>AGE||
    new Date(time).toISOString()!==row.published_at)return null;
 const articleUrl=globalOriginalArticleUrl(row.article_url,spec);
 if(!articleUrl)return null;
 // The official feed identifies the issuer; it does NOT establish an event
 // actor, independent original-page byte proof, or commercial data rights.
 const issuerCredit=spec.credit===null?null:spec.id.startsWith("govuk_")?
   "UK Government. "+spec.credit:spec.id==="eu_council_press_original"?
   "Council of the European Union. "+spec.credit:spec.credit;
 return {title:row.title,articleUrl,publishedAt:row.published_at,
   sourceId:spec.id,category:row.category,credit:issuerCredit};
}

/**
 * Safe, free website discovery projection of a private OSINT source observation.
 * A pinned FEED hostname is the only source credit here. This is not an
 * original-issuer identity, verified event, attribution licence or risk score.
 * Never copy the original title, URL or original publisher bytes to public D1.
 */
export function unverifiedWebsiteSignalFromOsint(row,now=Date.now(),summarize=null){
 if(!row||!Number.isFinite(now)||!CATEGORIES.has(row.category)||
    !/^news-[0-9a-f]{64}$/u.test(row.news_id??"")||
    typeof row.title!=="string"||row.title.length<25||row.title.length>250||
    /[<>]|https?:\/\//iu.test(row.title)||
    typeof row.source_url!=="string"||
    !(summarize===null||typeof summarize==="function")||
    typeof row.published_at!=="string"||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(row.published_at))return null;
 let url;
 try{url=new URL(row.source_url)}catch{return null}
 if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
    url.hostname.length>120||!/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(url.hostname))return null;
 const stamp=Date.parse(row.published_at);
 if(!Number.isFinite(stamp)||stamp>now||now-stamp>AGE||
    new Date(stamp).toISOString()!==row.published_at)return null;
 const hints={
   geopolitics:[
    [/sanction|embargo|asset freeze/iu,"sanctions and trade restrictions"],
    [/conflict|war\b|military|missile|attack|ceasefire|security|violence/iu,"geopolitical security"],
   ],
   macro:[
    [/interest rate|central bank|monetary policy|policy rate|fomc/iu,"monetary policy"],
    [/inflation|consumer prices|price index|cpi/iu,"inflation and prices"],
    [/currency|exchange rate|foreign exchange|fx\b/iu,"FX and external balances"],
   ],
   rare_earth:[
    [/rare[- ]earth|lithium|cobalt|nickel|graphite|copper|gallium|germanium/iu,"critical-mineral inputs"],
    [/critical mineral|mining|mineral supply|refinery/iu,"rare-earth supply"],
   ],
 };
 const fallbacks={
   geopolitics:"geopolitical publisher candidate",
   macro:"macro publisher candidate",
   rare_earth:"minerals publisher candidate",
 };
 const observedTopic=hints[row.category].find(([p])=>p.test(row.title))?.[1]??fallbacks[row.category];
 const implications={
   geopolitics:"A geopolitical topic in a monitored source feed can indicate changes worth checking in diplomatic, trade or security exposure. The feed item alone does not verify the event or its consequences.",
   macro:"A macroeconomic or currency-related source-feed observation can guide checks of official figures and FX exposures. No actual rate, figure, market move or direction has been verified from this observation.",
   rare_earth:"A mineral-related source-feed observation can guide checks of supply, export and production exposure. No mine output, shipment volume, price move or actual supply impact has been independently verified.",
 };
 const credited="Monitored feed: "+url.hostname+(url.hostname==="news.google.com"?" (aggregator; original publisher not verified)":"");
 const summary=summarize? summarize(row.title):null;
 const known=summary&&typeof summary.headline==="string"&&summary.headline.length>=12&&
   summary.headline.length<=200&&typeof summary.change==="string"&&summary.change.length>=30&&
   summary.change.length<=450&&!/[<>]|https?:\/\//iu.test(summary.headline+summary.change)?summary:null;
 const topic=known&&observedTopic===fallbacks[row.category]?
   ({geopolitics:"geopolitical security",macro:"official economic statistics",
     rare_earth:"critical-mineral inputs"})[row.category]:observedTopic;
 const title="Geomacro finds "+(known?summary.headline:topic+" source-feed observation");
 const changed=known?"A monitored source feed reports: "+known.change+" This report has not been independently verified.":
   "A monitored source feed contains a dated item about "+topic+
   ". The event actor, precise action and impact have not been independently verified.";
 const id=row.category+"-"+createHash("sha256").update(row.news_id).digest("hex").slice(0,8);
 return {
   id,category:row.category,title,what_changed:changed,
   why_it_matters:implications[row.category],topic,
   geography:null,development_type:"unverified OSINT feed observation",
   published_at:row.published_at,date_precision:"exact",
   observed_release_count:1,sources_credited:[credited],
   status:"osint_feed_observed_unverified",same_event_corrob_verified:false,severity:null,
 };
}

// Keep this deterministic priority identical to Worker D1's SQL CASE.
export function privateWebsiteRetentionPriority(row){
 if(row?.status==="official_release_observed_unscored")return 2;
 if(row?.status==="osint_feed_observed_unverified"&&
   typeof row.what_changed==="string"&&
   row.what_changed.startsWith("A monitored source feed reports:")&&
   !["geopolitical publisher candidate","macro publisher candidate",
     "minerals publisher candidate"].includes(row.topic))return 1;
 return 0;
}
export function privateWebsiteRetentionNewestFirst(a,b){
 return privateWebsiteRetentionPriority(b)-privateWebsiteRetentionPriority(a)||
   b.published_at.localeCompare(a.published_at)||
   b.id.localeCompare(a.id);
}

export async function publishPrivateOsintWebsiteSignals({
 signals,controlPlaneRoot,controlToken,readAll,dedupeAgainstExisting=null,fetchImpl=fetch,now=Date.now()
}={}){
 if(!Array.isArray(signals)||signals.length>768||
    typeof readAll!=="function"||typeof fetchImpl!=="function"||
    !(dedupeAgainstExisting===null||typeof dedupeAgainstExisting==="function")||
    typeof controlPlaneRoot!=="string"||
    !/^https:\/\/geomacro-control-plane\.[a-z0-9-]+\.workers\.dev$/u.test(controlPlaneRoot)||
    !/^[a-f0-9]{64}$/u.test(controlToken??"")||!Number.isFinite(now))
   throw Error("PRIVATE_OSINT_WEBSITE_BRIDGE_CONFIG_INVALID");
 // Source-publisher observations are not certified event facts or scored,
 // and may never be promoted to paid intelligence by this bridge.
 if(signals.some(s=>!CATEGORIES.has(s?.category)||
    !["official_release_observed_unscored","official_feed_candidate_unscored","osint_feed_observed_unverified"].includes(s.status)||
    s.same_event_corrob_verified!==false||s.severity!==null||
    !Array.isArray(s.sources_credited)||s.sources_credited.length>1||
    (s.sources_credited.length===0&&s.status!=="official_release_observed_unscored")||
    (s.sources_credited.length===1&&
      (typeof s.sources_credited[0]!=="string"||!s.sources_credited[0].trim()))||
    !isSafeDerivedNewsReadbackSignal(s)))
   throw Error("PRIVATE_OSINT_WEBSITE_BRIDGE_SIGNAL_UNSAFE");
 if(signals.length===0)return {candidates:0,new_derived_stories:0,
   journal_readback_verified:true,private_raw_published:false};
 const sweep=async()=>{
  const res=await fetchImpl(controlPlaneRoot+JOURNAL,{
   method:'PUT',redirect:'error',cache:'no-store',
   headers:{'Content-Type':'application/json',Accept:'application/json',Authorization:'Bearer '+controlToken},
   body:JSON.stringify({schema:'geomacro.website-derived-news-batch.v1',signals:[]}),
   signal:AbortSignal.timeout(16000),
  });
  if(res.status!==200)throw Error('PRIVATE_OSINT_WEBSITE_RETENTION_UNAVAILABLE');
  const receipt=await res.json();
  if(receipt?.ok!==true||receipt.schema!=='geomacro.website-derived-news-write-receipt.v1'||
     receipt.accepted!==0||receipt.persistent_derived_only!==true||receipt.chargeable!==false)
   throw Error('PRIVATE_OSINT_WEBSITE_RETENTION_ACK_INVALID');
 };
 // Repair only a proven 601+ journal, never an arbitrary outage or quota hold.
 const existing=await readIntakeBaseline({fetchImpl,readAll,repair:sweep,now});
 if(!Array.isArray(existing))throw Error("PRIVATE_OSINT_WEBSITE_BASELINE_INVALID");
 const ids=new Set(existing.map(s=>s.id));
 // Dedup the incoming run AGAINST the entire currently retained D1 journal.
 // A new OSINT feed ID cannot resurrect an event already in another feed.
 const accepted=dedupeAgainstExisting?
   dedupeAgainstExisting([...existing,...signals]):signals;
 const incoming=new Set(signals.map(s=>s.id));
 const unique=new Set();
 const eligible=accepted.filter(s=>{
   if(!incoming.has(s.id))return false;
   if(ids.has(s.id)||unique.has(s.id))return false;
   unique.add(s.id);return true;
 });
 // The public D1 newsroom has a hard 600-row cap. Prefer already-admitted
 // concrete actor/action signals over generic publisher candidates, then
 // newest within each priority. Keep SQL and this comparator aligned.
 const recentFirst=privateWebsiteRetentionNewestFirst;
 const hasClock=row=>typeof row?.published_at==="string"&&
   Number.isFinite(Date.parse(row.published_at));
 const canPredict=existing.length>=600&&
   [...existing,...eligible].every(hasClock);
 const survivors=canPredict?new Set([...existing,...eligible]
   .sort(recentFirst).slice(0,600).map(row=>row.id)):null;
 const eligibleWithinCap=survivors?
   eligible.filter(s=>survivors.has(s.id)):eligible;
 const pending=eligibleWithinCap.slice(0,150);
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
 let visible=0,naturallyEvicted=0;
 if(pending.length){
   // One sweep after all bounded chunks. A full 600-row journal plus one
   // real new story must not strand all readers behind an over-cap 503.
   await sweep();
   const after=await readAll(fetchImpl,Date.now());
   if(!Array.isArray(after))throw Error("PRIVATE_OSINT_WEBSITE_READBACK_MISSING");
   const confirmed=new Set(after.map(s=>s.id));
   visible=pending.filter(s=>confirmed.has(s.id)).length;
   const absent=pending.filter(s=>!confirmed.has(s.id));
   // A separate concurrent real publisher may have inserted newer stories.
   // Accept a missing story only when it is outside a FULL 600-row D1 window,
   // never simply because a write receipt was green.
   const floor=after.length>=600&&after.every(hasClock)?
     [...after].sort(recentFirst)[599]:null;
   naturallyEvicted=floor?absent.filter(s=>hasClock(s)&&
     recentFirst(s,floor)>0).length:0;
   if(naturallyEvicted!==absent.length)
     throw Error("PRIVATE_OSINT_WEBSITE_EXACT_READBACK_FAILED_"+visible+
       "_OF_"+pending.length+"_VISIBLE_"+after.length);
 }
 return {candidates:signals.length,new_derived_stories:visible,
   deferred_unpublished:eligible.length-visible,
   d1_quota_evictions:naturallyEvicted,
   journal_readback_verified:true,private_raw_published:false};
}
