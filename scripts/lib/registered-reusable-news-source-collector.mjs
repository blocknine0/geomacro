/**
 * Registered news-feed rotator for commercial/noncommercial/unknown sources.
 * The source URL is pinned in existing repo catalogues; only native RSS/Atom
 * time and transient title metadata are consumed. No arbitrary page scraping,
 * paid provider, publisher text persistence, user URL input or redistribution.
 */
import {createHash} from "node:crypto";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS} from "./global-official-release-feeds.mjs";
import {EXPANDED_OFFICIAL_SOURCES} from "../ops/probe-expanded-official-source-mesh.mjs";
import {PUBLIC_FEED_ROTATION} from "../ops/observe-operator-free-feed-rotation.mjs";

const CATEGORY=["geopolitics","macro","rare_earth"];
const MAX_FEED_BYTES=192*1024;
const LOOKBACK=72*3600000;
const TOPICS={
  geopolitics:/\b(?:war|conflict|sanctions?|ceasefire|treaty|military|security|diploma|peace|geopolitics?|refugees?|elections?|embargo)\b/iu,
  macro:/\b(?:inflation|monetary|central bank|interest rate|fx|foreign exchange|GDP|currency|tariffs?|economic|fiscal|unemployment|trade)\b/iu,
  rare_earth:/\b(?:critical minerals?|rare[- ]earths?|mining|cobalt|lithium|nickel|graphite|copper|gallium|germanium|mineral supply|refinery)\b/iu,
};
const hex=x=>createHash("sha256").update(x).digest("hex");
const scalar=x=>typeof x==="string"?x:"";
const cleanText=s=>scalar(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu,"$1")
  .replace(/<[^>]*>/gu," ").replace(/&#(\d{1,5});/gu,(_,n)=>{
    const i=Number(n);return i>=32&&i<=126?String.fromCodePoint(i):" ";
  }).replace(/&(amp|quot|apos|lt|gt|nbsp);/giu,(_,x)=>({
    amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" "
  })[x.toLowerCase()]??" ").replace(/\s+/gu," ").trim();
const xmlTag=(body,tag)=>{
  const m=body.match(new RegExp("<(?:[a-z][a-z0-9._-]*:)?"+tag+
    "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z][a-z0-9._-]*:)?"+tag+">","iu"));
  return m?cleanText(m[1]):null;
};
function originalClock(value,now){
  if(!value||value.length>85||
     /^\d{4}-\d{2}-\d{2}$/u.test(value)||
     !(/[+-]\d{2}:?\d{2}|(?:GMT|UTC|Z)\b/iu).test(value))return null;
  const ms=Date.parse(value);
  if(!Number.isFinite(ms)||ms>now||now-ms>LOOKBACK)return null;
  return new Date(ms).toISOString();
}
function normalizeCatalogueSource(r){
  if(typeof r?.id!=="string"||!r.id||typeof r.url!=="string")return null;
  let url;
  try{url=new URL(r.url)}catch{return null}
  if(url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     url.hostname==="localhost"||!url.hostname.includes("."))return null;
  const categories=r.categories??(r.category?[r.category]:r.domain?[r.domain]:[]);
  if(!Array.isArray(categories)||!categories.every(x=>CATEGORY.includes(x)))return null;
  const type=r.format??r.media;
  const supported=["rss","atom","xml","rdf"].includes(type);
  return {id:r.id,url:r.url,categories,type,supported};
}
export function registeredReusableNewsSources(){
  const inputs=[
    ...GLOBAL_OFFICIAL_RELEASE_FEEDS,
    ...EXPANDED_OFFICIAL_SOURCES,
    ...PUBLIC_FEED_ROTATION.map(x=>({...x,categories:CATEGORY})),
  ];
  const map=new Map();
  for(const item of inputs){
    const source=normalizeCatalogueSource(item);
    if(!source)throw Error("REUSABLE_SOURCE_REGISTRY_INVALID");
    // Never claim repeated alias/host variants are separate original issuers.
    const key=source.url;
    const old=map.get(key);
    if(old){
      old.categories=[...new Set([...old.categories,...source.categories])];
      old.supported=old.supported||source.supported;
      if(!old.supported)old.type=source.type;
    }else map.set(key,source);
  }
  return Object.freeze([...map.values()].sort((a,b)=>a.id.localeCompare(b.id)));
}
export function selectRegisteredNewsSources(now=new Date(),registry=registeredReusableNewsSources(),perCategory=4){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Array.isArray(registry)||registry.length>200||
     !Number.isSafeInteger(perCategory)||perCategory<1||perCategory>8)
    throw Error("REUSABLE_NEWS_ROTATION_INVALID");
  // Fixed 15-minute cursor, rotating each category's entire source inventory.
  // Selected per-category registration is deterministic across re-runs.
  const slot=Math.floor(now.getTime()/(15*60_000));
  const selected=new Map();
  for(const category of CATEGORY){
    const matches=registry.filter(s=>s.categories.includes(category));
    if(!matches.length)continue;
    const start=(slot*perCategory)%matches.length;
    for(let n=0;n<Math.min(perCategory,matches.length);n++){
      const source=matches[(start+n)%matches.length];
      const previous=selected.get(source.url);
      if(previous)previous.categories=[...new Set([...previous.categories,category])];
      else selected.set(source.url,{...source,categories:[category]});
    }
  }
  return [...selected.values()];
}
function feedBlocks(source,body){
  if(body.length>MAX_FEED_BYTES||/<!DOCTYPE|<!ENTITY/iu.test(body))return null;
  const root=body.trimStart().slice(0,350);
  if(!/^<\?xml\b|^<(?:rss|feed|rdf:RDF)\b/iu.test(root))return null;
  const pattern=/<(?:[a-z][a-z0-9._-]*:)?(item|entry)\b[^>]*>[\s\S]*?<\/(?:[a-z][a-z0-9._-]*:)?\1>/giu;
  const result=[];
  for(const m of body.matchAll(pattern)){
    const entry=m[0];
    const title=xmlTag(entry,"title");
    if(!title||title.length<25||title.length>250||
       /<|>|\u0000/gu.test(title))continue;
    // Native item publication only: RSS pubDate or Atom published.
    // Feed updated/issue day and collection clock are never publication time.
    const native=xmlTag(entry,"pubDate")??xmlTag(entry,"published");
    result.push({title,native});
    if(result.length>=30)break;
  }
  return result;
}
async function fetchFeed(spec,fetchImpl){
  try{
    const r=await fetchImpl(spec.url,{method:"GET",redirect:"manual",
      headers:{accept:"application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9"},
      signal:AbortSignal.timeout(7000)});
    if([401,403,429].includes(r.status))return {state:"DENIED",body:null};
    if(r.status!==200||(r.url&&r.url!==spec.url))return {state:"UNAVAILABLE",body:null};
    if(Number(r.headers.get("content-length")||0)>MAX_FEED_BYTES||!r.body)
      return {state:"MALFORMED",body:null};
    const reader=r.body.getReader();let size=0,chunks=[];
    try{
      for(;;){const data=await reader.read();if(data.done)break;
        size+=data.value.byteLength;
        if(size>MAX_FEED_BYTES)return {state:"MALFORMED",body:null};
        chunks.push(data.value);
      }
    }finally{try{await reader.cancel()}catch{}reader.releaseLock()}
    const body=new TextDecoder("utf-8",{fatal:true}).decode(
      Uint8Array.from(chunks.flatMap(b=>[...b])));
    if(!body.length)return {state:"MALFORMED",body:null};
    return {state:"OBSERVED",body};
  }catch{return {state:"UNAVAILABLE",body:null}}
}
export async function collectRegisteredReusableNews({
  now=new Date(),fetchImpl=fetch,registry=registeredReusableNewsSources(),
  perCategory=4,normalize
}={}){
  if(typeof normalize!=="function"||!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error("REUSABLE_NEWS_COLLECTOR_INPUT_INVALID");
  const active=selectRegisteredNewsSources(now,registry,perCategory);
  const checks=[],items=[],seen=new Set();
  for(const s of active){
    let state="UNSUPPORTED_FORMAT",blocks=null;
    if(s.supported){
      const res=await fetchFeed(s,fetchImpl);
      state=res.state;
      if(res.body!==null){
        blocks=feedBlocks(s,res.body);
        if(!blocks)state="MALFORMED";
        else if(!blocks.length)state="EMPTY_OR_OUTSIDE_WINDOW";
      }
    }
    const activeCategories=s.categories;
    let candidates=0;
    const domainCandidates=Object.fromEntries(activeCategories.map(c=>[c,0]));
    for(const item of blocks??[]){
      const at=originalClock(item.native,now.getTime());
      if(!at)continue;
      for(const category of activeCategories){
        if(!TOPICS[category].test(item.title))continue;
        // Source text remains ephemeral. Only finite machine fact tags are
        // produced; third-party noncommercial titles never enter D1.
        const normalized=normalize({category,text:item.title,
          published_at:at,license:"unknown"});
        if(normalized.schema!=="geomacro.reusable-news-json.v1"||
           normalized.delivery.raw_article_included!==false||
           normalized.usage_rights.commercial_reuse_authorized!==false)
          throw Error("REUSABLE_NEWS_NORMALIZER_UNSAFE");
        const id=hex([s.id,category,at,item.title].join("\n"));
        const safe={...normalized,id:"news-"+id};
        if(!seen.has(id)){seen.add(id);items.push(safe);candidates++;domainCandidates[category]++}
        if(items.length>=40)break;
      }
      if(items.length>=40)break;
    }
    if(state==="OBSERVED"&&candidates===0)state="EMPTY_OR_OUTSIDE_WINDOW";
    for(const category of activeCategories)
      checks.push({source_ref:hex([s.id,s.url,category].join("\n")),
        category,state:state==="OBSERVED"&&!domainCandidates[category]?
          "EMPTY_OR_OUTSIDE_WINDOW":state,checked_at:now.toISOString()});
    if(items.length>=40)break;
  }
  return {
    schema:"geomacro.reusable-source-news-batch.v1",items,
    checks,
    summary:{registered_source_endpoints:registry.length,
      selected_source_endpoints:active.length,
      completed_source_endpoints:new Set(checks.map(c=>c.source_ref)).size,
      observed_news_items:items.length,
      source_states:checks.reduce((a,c)=>(a[c.state]=(a[c.state]??0)+1,a),{}),
      original_issuer_page_verified:false,
      source_rights_commercial_authorized:false,paid_publication_authorized:false,
      raw_upstream_stored:false},
  };
}
