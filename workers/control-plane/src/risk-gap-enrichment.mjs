/** 20-minute metadata-only search for stale country/corridor category cells. */
import {PHASE2H_COUNTRIES_195} from "../../../scripts/lib/phase2h-country-originals-195.mjs";
import {CATEGORY_SPECS,CATEGORIES} from "./unified-risk-categories.mjs";
import {DAILY_RG_CORRIDORS,parseGoogleRiskRss} from "./daily-risk-gate-generator.mjs";

const BATCH=12, SHA=/^[a-f0-9]{64}$/u;
const TIER_ONE_HOSTS=["apnews.com","bbc.com","dw.com","aljazeera.com","france24.com","theguardian.com","reuters.com","npr.org"];
const iso=n=>new Date(n).toISOString();
const enc=new TextEncoder();
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("");
const hostOf=value=>{try{const u=new URL(value);return u.protocol==="https:"?u.hostname.toLowerCase().replace(/^www\./u,""):""}catch{return ""}};
const cleanHost=value=>typeof value==="string"&&/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/iu.test(value)?value.toLowerCase().replace(/^www\./u,""):"";
function impactFactor(title,category){
 const text=String(title??"").normalize("NFKC").toLowerCase();
 const terms=CATEGORY_SPECS[category]?.keywords??[];
 const hits=terms.filter(term=>text.includes(term.toLowerCase())).length;
 const acute=/\b(default|invasion|airstrike|export ban|shutdown|sanctions|devaluation|strike|blockade|closure)\b/u.test(text);
 return Math.min(100,Math.max(0,Math.min(4,hits)*10+(acute?20:0)));
}
function allowedPublisher(host,category){
 const allowed=[...(CATEGORY_SPECS[category]?.authoritative_domains??[]),...TIER_ONE_HOSTS];
 return allowed.some(domain=>host===domain||host.endsWith("."+domain));
}
function htmlText(html){
 return String(html).replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1\s*>/giu," ")
  .replace(/<!--([\s\S]*?)-->/gu," ").replace(/<[^>]+>/gu," ")
  .replace(/&nbsp;|&#160;/giu," ").replace(/&amp;/giu,"&")
  .replace(/&lt;/giu,"<").replace(/&gt;/giu,">")
  .replace(/&quot;|&#34;/giu,'"').replace(/&#39;|&apos;/giu,"'")
  .replace(/\s+/gu," ").slice(0,240000);
}
async function fetchArticle(item,target,fetcher){
 const expected=cleanHost(item.publisher_host);
 if(!expected||!allowedPublisher(expected,target.category))return null;
 let current=item.url;
 for(let hop=0;hop<4;hop++){
  const response=await fetcher(current,{redirect:"manual",cache:"no-store",
   signal:AbortSignal.timeout(7000),headers:{Accept:"text/html,application/xhtml+xml;q=0.9"}});
  if(response.status>=300&&response.status<400){
   const location=response.headers.get("location");if(!location)return null;
   const next=new URL(location,current),nextHost=hostOf(next.href);
   if(next.protocol!=="https:"||!(nextHost===expected||nextHost.endsWith("."+expected)||
      nextHost==="news.google.com"||nextHost==="google.com"||nextHost.endsWith(".google.com")))return null;
   current=next.href;continue;
  }
  const host=hostOf(response.url||current);
  if(response.status!==200||!(host===expected||host.endsWith("."+expected))||
     !allowedPublisher(host,target.category)||
     !String(response.headers.get("content-type")??"").toLowerCase().includes("html"))return null;
  const length=Number(response.headers.get("content-length")||0);
  if(!Number.isFinite(length)||length>400000)return null;
  const body=await response.text();if(enc.encode(body).length>400000)return null;
  const extracted=htmlText(body);
  return extracted.length>=120?extracted:null;
 }
 return null;
}
function targets(){
 const all=[];
 for(const c of PHASE2H_COUNTRIES_195)for(const category of CATEGORIES)
  all.push({type:"COUNTRY",id:c.iso3,name:c.name,category});
 for(const c of DAILY_RG_CORRIDORS)for(const category of CATEGORIES)
  all.push({type:"CORRIDOR",id:c.id,name:c.id.replace(/-/gu," "),category});
 return all;
}
async function search(target,now,fetcher){
 const spec=CATEGORY_SPECS[target.category];
 const q='"'+target.name+'" ('+spec.keywords.map(x=>'"'+x+'"').join(" OR ")+") when:24h";
 const url="https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl=en-US&gl=US&ceid=US:en";
 const response=await fetcher(url,{redirect:"manual",cache:"no-store",
  signal:AbortSignal.timeout(7000),headers:{Accept:"application/rss+xml, application/xml;q=0.9"}});
 if(response.status!==200||response.url&&hostOf(response.url)!=="news.google.com")return [];
 const size=Number(response.headers.get("content-length")||0);
 if(!Number.isFinite(size)||size>600000)return [];
 return (await parseGoogleRiskRss(await response.text(),now)).slice(0,20);
}
/** Process one rotating page; this runs only when the existing Worker cron reaches :00/:20/:40. */
export async function riskGapEnrichmentTick(env,{now=Date.now(),fetcher=fetch}={}){
 if(!env?.DB?.prepare||!env?.DB?.batch||!Number.isFinite(now))
  return {ok:false,error:"RISK_GAP_D1_UNAVAILABLE"};
 try{
  const all=targets(),cutoff=iso(now-12*3600000);
  const recent=await env.DB.prepare(
   "SELECT entity_type,entity_id,category,MAX(discovered_at) AS last_input "+
   "FROM unverified_observations WHERE discovered_at>=? "+
   "GROUP BY entity_type,entity_id,category"
  ).bind(cutoff).all();
  const fresh=new Set((recent?.results??[]).map(x=>x.entity_type+"|"+x.entity_id+"|"+x.category));
  const observed=await env.DB.prepare(
   "SELECT entity_type,entity_id,category FROM risk_observations WHERE created_at>=? "+
   "AND evidence_status IN ('VERIFIED_SIGNED_GRO','OBSERVED_UNVERIFIED') GROUP BY entity_type,entity_id,category"
  ).bind(cutoff).all();
  for(const x of observed?.results??[])fresh.add(x.entity_type+"|"+x.entity_id+"|"+x.category);
  const gaps=all.filter(x=>!fresh.has(x.type+"|"+x.id+"|"+x.category));
  const cursor=await env.DB.prepare("SELECT next_offset FROM risk_gap_enrichment_cursor WHERE singleton=1").first();
  const start=Number.isSafeInteger(cursor?.next_offset)?cursor.next_offset%Math.max(gaps.length,1):0;
  const page=Array.from({length:Math.min(BATCH,gaps.length)},(_,i)=>gaps[(start+i)%gaps.length]);
  const results=await Promise.all(page.map(async target=>{
   const items=await search(target,now,fetcher).catch(()=>[]);
   const newest=items[0];
   const fullText=newest?await fetchArticle(newest,target,fetcher).catch(()=>null):null;
   return {target,items:newest?[newest]:[],fullText};
  }));
  const rows=[];
  for(const {target,items,fullText} of results)for(const item of items){
   const sourceHost=cleanHost(item.publisher_host);
   if(!sourceHost||!SHA.test(item.title_hash)||!Number.isFinite(Date.parse(item.published_at)))continue;
   const eventId=await hash([target.type,target.id,target.category,item.title_hash].join("|"));
   rows.push({
    observation_id:await hash([eventId,target.type,target.id,target.category,sourceHost].join("|")),
    event_id:eventId,entity_type:target.type,entity_id:target.id,category:target.category,
    event_at:item.published_at,source_id:item.source_id,source_host:sourceHost,
    title_sha256:item.title_hash,impact_factor:impactFactor((fullText||"")+" "+item.title,target.category),
    fact_basis:fullText?"ARTICLE_FULL_TEXT":"SEARCH_TITLE_ONLY",original_page_fetched:fullText?1:0,
    status:"OBSERVED",independent_source_count:1,discovered_at:iso(now),
   });
  }
  const statements=[];
  if(rows.length)statements.push(env.DB.prepare(
   "INSERT INTO unverified_observations(observation_id,event_id,entity_type,entity_id,category,event_at,source_id,source_host,title_sha256,impact_factor,fact_basis,original_page_fetched,status,independent_source_count,discovered_at) "+
   "SELECT json_extract(value,'$.observation_id'),json_extract(value,'$.event_id'),json_extract(value,'$.entity_type'),json_extract(value,'$.entity_id'),json_extract(value,'$.category'),json_extract(value,'$.event_at'),json_extract(value,'$.source_id'),json_extract(value,'$.source_host'),json_extract(value,'$.title_sha256'),json_extract(value,'$.impact_factor'),json_extract(value,'$.fact_basis'),json_extract(value,'$.original_page_fetched'),'OBSERVED',1,json_extract(value,'$.discovered_at') FROM json_each(?) WHERE 1 "+
   "ON CONFLICT(event_id,source_host) DO UPDATE SET discovered_at=excluded.discovered_at,impact_factor=MAX(COALESCE(unverified_observations.impact_factor,0),COALESCE(excluded.impact_factor,0)),fact_basis=excluded.fact_basis,original_page_fetched=excluded.original_page_fetched"
  ).bind(JSON.stringify(rows)));
  // Require distinct publishers and publication times separated by six hours
  // before promoting identical event fingerprints beyond OBSERVED.
  if(rows.length)statements.push(env.DB.prepare(
   "UPDATE unverified_observations SET independent_source_count=(SELECT COUNT(DISTINCT source_host) FROM unverified_observations x WHERE x.event_id=unverified_observations.event_id), "+
   "status=CASE WHEN (SELECT COUNT(DISTINCT source_host) FROM unverified_observations x WHERE x.event_id=unverified_observations.event_id)>=2 AND (SELECT MAX(julianday(event_at))-MIN(julianday(event_at)) FROM unverified_observations x WHERE x.event_id=unverified_observations.event_id)>=0.25 THEN 'CORROBORATED' ELSE 'OBSERVED' END "+
   "WHERE event_id IN (SELECT value FROM json_each(?))"
  ).bind(JSON.stringify([...new Set(rows.map(x=>x.event_id))])));
  const next=(start+page.length)%Math.max(gaps.length,1);
  statements.push(env.DB.prepare(
   "INSERT INTO risk_gap_enrichment_cursor(singleton,next_offset,last_run_at) VALUES(1,?,?) "+
   "ON CONFLICT(singleton) DO UPDATE SET next_offset=excluded.next_offset,last_run_at=excluded.last_run_at"
  ).bind(next,iso(now)));
  if(statements.length){const write=await env.DB.batch(statements);if(!Array.isArray(write)||write.some(x=>x?.success===false))throw Error();}
  const saved=rows.length?await env.DB.prepare(
   "SELECT observation_id,event_id FROM unverified_observations WHERE observation_id IN (SELECT json_extract(value,'$.observation_id') FROM json_each(?))"
  ).bind(JSON.stringify(rows)).all():{results:[]};
  if(!Array.isArray(saved?.results)||saved.results.length!==new Set(rows.map(x=>x.observation_id)).size)
   throw Error();
  const storedCursor=await env.DB.prepare("SELECT next_offset,last_run_at FROM risk_gap_enrichment_cursor WHERE singleton=1").first();
  if(storedCursor?.next_offset!==next||storedCursor?.last_run_at!==iso(now))throw Error();
  return {ok:true,schema:"geomacro.risk-gap-enrichment.v1",gap_cells:gaps.length,
   searched_cells:page.length,observations:rows.length,
   fulltext_articles_fetched:results.filter(x=>x.fullText).length,
   original_fulltext_stored:false,provisional_only:true,
   cursor_next:next,run_at:iso(now)};
 }catch{return {ok:false,error:"RISK_GAP_ENRICHMENT_FAILED"};}
}
