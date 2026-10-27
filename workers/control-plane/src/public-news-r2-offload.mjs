/**
 * Optional R2 public-only source-neutral projection offload.
 * D1 remains the canonical journal; B2 remains canonical evidence storage.
 * A missing/stale/untrusted R2 snapshot falls back to existing D1 handlers.
 * Never serve private, Predge, authenticated, signed or paid feeds from R2.
 */
import {verifyDerivedStory} from "./website-derived-intelligence.mjs";
import {eligiblePublicFreeD1CacheRequest} from "./public-free-d1-cache.mjs";

export const PUBLIC_NEWS_R2_KEY="geomacro/public-news/v1/current.json";
export const PUBLIC_NEWS_R2_MAX_AGE_MS=8*60_000;
export const PUBLIC_NEWS_R2_MAX_BYTES=850_000;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const CATSET=new Set(CATEGORIES);
const OFFSETS=["0","250","500"];
// The machine model has an exact, source-neutral projection contract. Unknown
// row keys (including raw article fields) are never persisted or served.
const MACHINE_ROW_KEYS=new Set([
  "schema","id","category","event_family","development_type","topic",
  "original_published_at","date_precision","geography_mentioned",
  "headline","observed_change","potential_relevance","confidence_state",
  "topical_match_verified","qualifying_topic_release_verified",
  "further_validation_required","event_detail_verified",
  "country_subject_verified","independent_same_event_verified",
  "commercial_derived_rights_verified","signed_product_verified",
  "numeric_impact_established","raw_upstream_delivered","chargeable","payable"
]);
const PAGE_KEYS=new Set([
  "ok","schema","checked_at","original_release_delay_minutes",
  "retention_days","retention_hours","delivery_scope","scored","chargeable",
  "supabase_dependency","page_offset","page_size","has_more","next_offset",
  "ingest_clock_kind","first_ingest","signals"
]);
const enc=new TextEncoder();
const reply=(data,status=200)=>Response.json(data,{status,headers:{
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"
}});
const safeInt=n=>Number.isSafeInteger(n)&&n>=0;
function fail(){throw Error("PUBLIC_NEWS_R2_CONTRACT_INVALID");}
function validatePage(doc,offset,now,seen){
  if(!doc||doc.ok!==true||doc.schema!=="geomacro.website-derived-news-feed.v1"||
     doc.delivery_scope!=="free_website_only"||doc.retention_hours!==72||
     doc.original_release_delay_minutes!==0||
     doc.page_offset!==Number(offset)||doc.page_size!==250||
     Object.keys(doc).some(k=>!PAGE_KEYS.has(k))||
     typeof doc.has_more!=="boolean"||!Array.isArray(doc.signals)||
     doc.signals.length>250||doc.scored!==false||doc.chargeable!==false)fail();
  for(const item of doc.signals){
    if(!verifyDerivedStory(item,now)||seen.has(item.id))fail();
    const published=Date.parse(item.published_at+(item.date_precision==="day"?"T00:00:00Z":""));
    // Recheck source-native 72h retention at every edge read. Day-only
    // publications cannot bypass their original publisher release rule.
    if(!Number.isFinite(published)||published<now-72*60*60_000)fail();
    seen.set(item.id,item);
  }
}
export function validatePublicNewsR2Bundle(value,now=Date.now()){
  if(!value||typeof value!=="object"||Array.isArray(value)||
     value.schema!=="geomacro.public-source-neutral-r2-bundle.v1"||
     !/^[a-f0-9]{40}$/.test(String(value.origin_deployed_source_sha??""))||
     !Number.isFinite(now))fail();
  const made=Date.parse(String(value.produced_at??""));
  if(!Number.isFinite(made)||made>now+15000||
     now-made>PUBLIC_NEWS_R2_MAX_AGE_MS||now-made< -15000)fail();
  const pages=value.pages,seen=new Map();
  if(!pages||typeof pages!=="object"||Array.isArray(pages)||
     !pages["0"]||Object.keys(pages).some(x=>!OFFSETS.includes(x)))fail();
  for(const offset of OFFSETS){
    const page=pages[offset];
    if(!page){
      if(offset!=="0"&&pages[String(Number(offset)-250)]?.has_more===false)break;
      fail();
    }
    validatePage(page,offset,now,seen);
    if(page.has_more){
      if(offset==="500"||page.next_offset!==Number(offset)+250)fail();
    }else if(page.next_offset!==null)fail();
    if(!page.has_more&&OFFSETS.some(x=>Number(x)>Number(offset)&&pages[x]))fail();
    if(!page.has_more)break;
  }
  const feed=value.machine;
  if(!feed||feed.ok!==true||
     feed.schema!=="geomacro.derived-news-structural-feed.v1"||
     feed.projection!=="source_neutral"||
     feed.chargeable!==false||feed.scored!==false||feed.signed!==false||
     feed.commercial_rights_verified!==false||
     feed.partner_resale_or_commercial_redistribution_authorized!==false||
     feed.raw_upstream_delivered!==false||
     !Array.isArray(feed.items)||feed.items.length>600)fail();
  const required=[...seen.values()].filter(x=>x.sources_credited.length===0);
  if(required.length!==feed.items.length)fail();
  const matched=new Set();
  for(const row of feed.items){
    if(!row||typeof row!=="object"||Array.isArray(row)||
       Object.keys(row).some(k=>!MACHINE_ROW_KEYS.has(k))||
       row.schema!=="geomacro.derived-news-structural.v1"||
       row.raw_upstream_delivered!==false||row.chargeable!==false||
       row.signed_product_verified!==false||
       row.numeric_impact_established!==false||
       row.further_validation_required!==true)fail();
    const story=seen.get(row?.id);
    if(!story||matched.has(row.id)||story.sources_credited.length!==0||
       story.category!==row.category||
       story.published_at!==row.original_published_at||
       story.what_changed!==row.observed_change||
       story.why_it_matters!==row.potential_relevance||
       row.payable!==false||row.commercial_derived_rights_verified!==false)fail();
    matched.add(row.id);
  }
  for(const category of CATEGORIES){
    if(!safeInt(feed.counts?.[category])||
       !feed.availability_by_category?.[category]||
       feed.counts[category]!==feed.items.filter(x=>x.category===category).length)fail();
  }
  return Object.freeze({total:seen.size,neutral:required.length,produced_at:value.produced_at});
}
const enabled=env=>env?.PUBLIC_NEWS_OFFLOAD_ENABLED==="1"&&
  env.PUBLIC_NEWS_R2&&typeof env.PUBLIC_NEWS_R2.get==="function";

export async function readPublicNewsR2Snapshot(request,env,now=Date.now()){
  if(!enabled(env)||!eligiblePublicFreeD1CacheRequest(request))return null;
  const url=new URL(request.url);
  let key=null,category=null;
  if(url.pathname==="/v1/public/website-derived-news-immediate"){
    key=url.search?url.search.slice(8):"0";
    if(!OFFSETS.includes(key))return null;
  }else if(url.pathname==="/v1/public/derived-structural-72h"){
    category=url.search?url.search.slice(8):null;
    if(category!==null&&!CATSET.has(category))return null;
  }else return null;
  try{
    const object=await env.PUBLIC_NEWS_R2.get(PUBLIC_NEWS_R2_KEY);
    if(!object||object.size>PUBLIC_NEWS_R2_MAX_BYTES)return null;
    const raw=await object.text();
    if(enc.encode(raw).byteLength>PUBLIC_NEWS_R2_MAX_BYTES)return null;
    const bundle=JSON.parse(raw);
    validatePublicNewsR2Bundle(bundle,now);
    const data=key!==null?bundle.pages[key]:
      category===null?bundle.machine:{
        ...bundle.machine,items:bundle.machine.items.filter(x=>x.category===category)
      };
    if(!data)return null;
    return Response.json(data,{headers:{
      "Cache-Control":"public, max-age=45",
      "X-Content-Type-Options":"nosniff",
      "Access-Control-Allow-Origin":"*",
      "Referrer-Policy":"no-referrer",
      "X-GeoMacro-Public-Offload":"r2"
    }});
  }catch{
    // A malformed or absent cache is NEVER converted to an empty-news event.
    return null;
  }
}

export async function publishPublicNewsR2Snapshot(env,bundle,now=Date.now()){
  if(!enabled(env))return reply({ok:false,error:"PUBLIC_NEWS_R2_NOT_CONFIGURED"},503);
  if(bundle?.origin_deployed_source_sha!==env.GEOMACRO_SOURCE_SHA)
    return reply({ok:false,error:"PUBLIC_NEWS_R2_WORKER_SHA_MISMATCH"},409);
  let audit;
  try{audit=validatePublicNewsR2Bundle(bundle,now)}catch{
    return reply({ok:false,error:"PUBLIC_NEWS_R2_CONTRACT_INVALID"},400);
  }
  const raw=JSON.stringify(bundle);
  if(enc.encode(raw).byteLength>PUBLIC_NEWS_R2_MAX_BYTES)
    return reply({ok:false,error:"PUBLIC_NEWS_R2_BATCH_TOO_LARGE"},413);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(raw))))
    .map(n=>n.toString(16).padStart(2,"0")).join("");
  try{
    // One current public projection object; no D1 writes and no B2 operations.
    await env.PUBLIC_NEWS_R2.put(PUBLIC_NEWS_R2_KEY,raw,{
      httpMetadata:{contentType:"application/json"}
    });
    // Independent R2 readback must match exact bytes before KV pointer update.
    const restored=await env.PUBLIC_NEWS_R2.get(PUBLIC_NEWS_R2_KEY);
    if(!restored||await restored.text()!==raw)
      return reply({ok:false,error:"PUBLIC_NEWS_R2_DURABLE_READBACK_MISMATCH"},503);
    let kv_updated=false;
    if(env.PUBLIC_NEWS_KV&&typeof env.PUBLIC_NEWS_KV.put==="function"){
      // One KV pointer write per bounded snapshot; KV is non-authoritative.
      await env.PUBLIC_NEWS_KV.put("geomacro:public-news:v1:latest",JSON.stringify({
        sha256:digest,produced_at:bundle.produced_at,
        origin_deployed_source_sha:bundle.origin_deployed_source_sha
      }));
      kv_updated=true;
    }
    return reply({ok:true,schema:"geomacro.public-source-neutral-r2-receipt.v1",
      sha256:digest,stored_records:audit.total,source_neutral_items:audit.neutral,
      r2_exact_readback_verified:true,kv_pointer_updated:kv_updated,
      d1_writes:0,b2_requests:0,source_fetches:0,payment_attempts:0});
  }catch{return reply({ok:false,error:"PUBLIC_NEWS_R2_WRITE_UNAVAILABLE"},503)}
}
