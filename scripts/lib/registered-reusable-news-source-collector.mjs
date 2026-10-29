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
export const REUSABLE_NEWS_WINDOW_HOURS=25;
const LOOKBACK=REUSABLE_NEWS_WINDOW_HOURS*3600000;
const MAX_ITEMS_PER_RUN=480;
// Source polling is not original-page or independently corroborated verification.
// Rechecking each category's <=24 endpoints once every three intended 5m slots
// is a NOMINAL source-discovery target; GitHub cron may be late or dropped.
export const REGISTERED_NEWS_POLL_SLOT_MINUTES=5;
const SOURCE_FETCH_CONCURRENCY=6;
// English and reviewed original-language headline tokens. These are keyword
// discovery hints, not translation, an attributed country, or event proof.
const TOPICS={
  geopolitics:/(?:\b(?:war|warfare|conflict|hostilities|invasion|sanctions?|trade disputes?|tariffs?|trade barriers?|export controls?|export bans?|ceasefire|airstrikes?|missiles?|drone strikes?|artillery|shelling|treaty|military|security|diploma\w*|peace|geopolitics?|refugees?|elections?|embargo|troop movements?|armed clashes?|border clashes?)\b|战争|停火|制裁|军事|袭击|حرب|وقف إطلاق النار|عقوبات|الهجوم|যুদ্ধ|নিষেধাজ্ঞা|युद्ध|प्रतिबंध|войн\w*|санкци\w*|перемири\w*|\bguerra\b|\balto el fuego\b)/iu,
  macro:/(?:\b(?:inflation|deflation|monetary|central bank|interest rates?|policy rates?|rate cuts?|rate hikes?|fx|foreign exchange|GDP|currency|tariffs?|economic|financial stability|liquidity|bond yields?|fiscal|unemployment|trade|trade deficit|exchange rates?|consumer prices?|CPI|sovereign debt|gross domestic product)\b|通胀|通脹|利率|汇率|匯率|经济|經濟|التضخم|سعر الصرف|মুদ্রাস্ফীতি|বিনিময় হার|मुद्रास्फीति|महंगाई|инфляци\w*|\binflación\b|\binflação\b)/iu,
  rare_earth:/(?:\b(?:critical minerals?|critical raw materials?|rare[- ]earths?|mining|cobalt|lithium|nickel|graphite|copper|gallium|germanium|tungsten|antimony|manganese|uranium|mineral supply|refiner(?:y|ies)|mineral processing|permanent magnets?|neodymium|dysprosium)\b|稀土|关键矿产|關鍵礦產|锂|鋰|钴|鈷|التعدين|المعادن الحرجة|লিথিয়াম|বিরল মৃত্তিকা|लिथियम|दुर्लभ मृदा|литий|редкозем\w*|\bminerales críticos\b|\bminerais críticos\b)/iu,
};

// Existing protected inventory already recognizes the White House RSS; add
// the primary original-action lane to THIS bounded collector as well.
// The filtered Federal Register feed is a separate publication of US
// presidential documents, not automatically independent event corroboration.
export const PRESIDENTIAL_ACTION_SOURCE_FEEDS=Object.freeze([
  Object.freeze({id:"white_house_presidential_actions",url:"https://www.whitehouse.gov/presidential-actions/feed/",
    categories:["geopolitics"],format:"rss",priority:true,officialDocument:true}),
  Object.freeze({id:"federal_register_executive_orders",url:"https://www.federalregister.gov/api/v1/documents.rss?conditions%5Bcorrection%5D=0&conditions%5Bpresident%5D=&conditions%5Bpresidential_document_type%5D=executive_order&conditions%5Bsigning_date%5D%5Byear%5D=&conditions%5Btype%5D%5B%5D=PRESDOCU",
    categories:["geopolitics"],format:"rss",priority:true,officialDocument:true}),
  Object.freeze({id:"white_house_briefings_statements",url:"https://www.whitehouse.gov/briefings-statements/feed/",
    categories:["geopolitics","macro","rare_earth"],format:"rss",priority:false,officialDocument:false}),
]);
const hex=x=>createHash("sha256").update(x).digest("hex");
const scalar=x=>typeof x==="string"?x:"";
// For CJK scripts 14 native characters can communicate a complete headline;
// 25 Latin characters remains the conservative default everywhere else.
function substantiveHeadline(title){
 if(title.length>=25&&title.length<=250)return true;
 return title.length>=14&&title.length<25&&
  (title.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)??[]).length>=12;
}
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
function originalClock(value,now,maxAgeMs=LOOKBACK){
  if(!Number.isFinite(maxAgeMs)||maxAgeMs<1||maxAgeMs>72*3600000||
     !value||value.length>85||
     /^\d{4}-\d{2}-\d{2}$/u.test(value)||
     !(/[+-]\d{2}:?\d{2}|(?:GMT|UTC|Z)\b/iu).test(value))return null;
  const ms=Date.parse(value);
  if(!Number.isFinite(ms)||ms>now||now-ms>maxAgeMs)return null;
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
  const supported=["rss","atom","xml","rdf"].includes(type)||
    (type==="json"&&url.hostname==="www.gov.uk"&&
      url.pathname==="/api/search.json"&&r.id.startsWith("govuk_"));
  return {id:r.id,url:r.url,categories,type,supported,
    priority:r.priority===true,officialDocument:r.officialDocument===true};
}
export function registeredReusableNewsSources(){
  const inputs=[
    ...GLOBAL_OFFICIAL_RELEASE_FEEDS,
    ...EXPANDED_OFFICIAL_SOURCES,
    ...PUBLIC_FEED_ROTATION.map(x=>({...x,categories:CATEGORY})),
    ...PRESIDENTIAL_ACTION_SOURCE_FEEDS,
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
      old.priority=old.priority||source.priority;
      old.officialDocument=old.officialDocument||source.officialDocument;
      if(!old.supported)old.type=source.type;
    }else map.set(key,source);
  }
  return Object.freeze([...map.values()].sort((a,b)=>a.id.localeCompare(b.id)));
}
export function selectRegisteredNewsSources(now=new Date(),registry=registeredReusableNewsSources(),perCategory=8){
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Array.isArray(registry)||registry.length>200||
     !Number.isSafeInteger(perCategory)||perCategory<1||perCategory>8)
    throw Error("REUSABLE_NEWS_ROTATION_INVALID");
  // Five-minute cursor; every category with <=24 endpoints is selected across
  // three consecutive intended slots. Actual scheduler delivery is not guaranteed.
  // Selected per-category registration is deterministic across re-runs.
  const slot=Math.floor(now.getTime()/(REGISTERED_NEWS_POLL_SLOT_MINUTES*60_000));
  const selected=new Map();
  // A fixed two-feed presidential lane avoids losing official actions when a
  // rotating slot is delayed. Retain the FULL preexisting eight/feed/category
  // rotation: priority feeds are extra, never displace country or mineral sources.
  for(const source of registry.filter(s=>s.priority===true)){
    if(!source.supported||!source.categories?.length)continue;
    selected.set(source.url,{...source,categories:[...source.categories]});
  }
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
function feedBlocks(source,body,allowRdfNativeDates=false,maxFeedBytes=MAX_FEED_BYTES){
  if(body.length>maxFeedBytes||/<!DOCTYPE|<!ENTITY/iu.test(body))return null;
  if(source.type==="json"){
    if(!source.url.startsWith("https://www.gov.uk/api/search.json?"))return null;
    try{
      const data=JSON.parse(body);
      if(!Array.isArray(data.results)||data.results.length>100)return null;
      return data.results.slice(0,70).flatMap(x=>{
        const title=typeof x?.title==="string"?cleanText(x.title):"";
        const native=typeof x?.public_timestamp==="string"?x.public_timestamp:null;
        return substantiveHeadline(title)&&native?[{title,native,articleUrl:null}]:[];
      });
    }catch{return null}
  }
  const root=body.trimStart().slice(0,350);
  if(!/^<\?xml\b|^<(?:rss|feed|rdf:RDF)\b/iu.test(root))return null;
  const pattern=/<(?:[a-z][a-z0-9._-]*:)?(item|entry)\b[^>]*>[\s\S]*?<\/(?:[a-z][a-z0-9._-]*:)?\1>/giu;
  const result=[];
  for(const m of body.matchAll(pattern)){
    const entry=m[0];
    const title=xmlTag(entry,"title");
    if(!title||!substantiveHeadline(title)||
       /<|>|\u0000/gu.test(title))continue;
    // Native item publication only: RSS pubDate or Atom published.
    // Feed updated/issue day and collection clock are never publication time.
    const native=xmlTag(entry,"pubDate")??xmlTag(entry,"published")??
      (allowRdfNativeDates&&/<rdf:RDF\b/iu.test(body)&&
       /xmlns:dc=["']http:\/\/purl\.org\/dc\/elements\/1\.1\/["']/iu.test(body)
        ?entry.match(/<dc:date\b[^>]*>([^<]+)<\/dc:date>/iu)?.[1]?.trim():null);
    const rssLink=xmlTag(entry,"link");
    const atomLink=entry.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/iu)?.[1]??null;
    result.push({title,native,articleUrl:rssLink??atomLink});
    if(result.length>=100)break;
  }
  return result;
}
async function fetchFeed(spec,fetchImpl,maxFeedBytes=MAX_FEED_BYTES){
  try{
    const r=await fetchImpl(spec.url,{method:"GET",redirect:"manual",
      headers:{accept:"application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9"},
      signal:AbortSignal.timeout(7000)});
    if([401,403,429].includes(r.status))return {state:"DENIED",body:null};
    if(r.status!==200||(r.url&&r.url!==spec.url))return {state:"UNAVAILABLE",body:null};
    if(Number(r.headers.get("content-length")||0)>maxFeedBytes||!r.body)
      return {state:"MALFORMED",body:null};
    const reader=r.body.getReader();let size=0,chunks=[];
    try{
      for(;;){const data=await reader.read();if(data.done)break;
        size+=data.value.byteLength;
        if(size>maxFeedBytes)return {state:"MALFORMED",body:null};
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
  perCategory=8,normalize,resolveCountry=()=>null,networkConcurrency=6,
  topicPatterns=TOPICS,allowRdfNativeDates=false,
  maxFeedBytes=MAX_FEED_BYTES,
  deduplicateIndexItems=false,onOriginalCandidate=null,
}={}){
  if(typeof normalize!=="function"||typeof resolveCountry!=="function"||
     !(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Number.isSafeInteger(networkConcurrency)||networkConcurrency<1||networkConcurrency>6||
     typeof allowRdfNativeDates!=="boolean"||
     typeof deduplicateIndexItems!=="boolean"||
     !(onOriginalCandidate===null||typeof onOriginalCandidate==="function")||
     !Number.isSafeInteger(maxFeedBytes)||maxFeedBytes<1||maxFeedBytes>1024*1024||
     CATEGORY.some(c=>!(topicPatterns?.[c] instanceof RegExp)||/[gy]/u.test(topicPatterns[c].flags)))
    throw Error("REUSABLE_NEWS_COLLECTOR_INPUT_INVALID");
  const active=selectRegisteredNewsSources(now,registry,perCategory);
  const checks=[],items=[],seen=new Set();
  let capacitySkipped=0;
  // A sequential 7s timeout for 24 pinned endpoints could exceed the target
  // window by itself. Bounded parallelism preserves source ordering, limits
  // simultaneous requests, and never forwards raw feed bodies to D1.
  const fetched=[];
  for(let i=0;i<active.length;i+=networkConcurrency){
    const chunk=active.slice(i,i+networkConcurrency);
    fetched.push(...await Promise.all(chunk.map(s=>s.supported
      ?fetchFeed(s,fetchImpl,maxFeedBytes)
      :Promise.resolve({state:"UNSUPPORTED_FORMAT",body:null}))));
  }
  for(let i=0;i<active.length;i++){
    const s=active[i],res=fetched[i];
    let state=res.state,blocks=null;
    if(res.body!==null){
      blocks=feedBlocks(s,res.body,allowRdfNativeDates,maxFeedBytes);
      if(!blocks)state="MALFORMED";
      else if(!blocks.length)state="EMPTY_OR_OUTSIDE_WINDOW";
    }
    const activeCategories=s.categories;
    let candidates=0;
    const domainCandidates=Object.fromEntries(activeCategories.map(c=>[c,0]));
    for(const item of blocks??[]){
      // The WEBSITE retains 72h of derived news, unlike private discovery's
      // strict 25h intake window. Surface exact native-dated original metadata
      // only to the in-memory, pinned-first-party website callback BEFORE
      // private topic/capacity rules; it never enters the private D1 journal.
      const websiteClock=onOriginalCandidate&&item.articleUrl
        ?originalClock(item.native,now.getTime(),72*3600000):null;
      if(websiteClock)for(const category of activeCategories)
        onOriginalCandidate({news_id:null,source_url:s.url,category,
          title:item.title,article_url:item.articleUrl,published_at:websiteClock});
      const at=originalClock(item.native,now.getTime());
      if(!at)continue;
      for(const category of activeCategories){
        // Every native-dated government presidential document merits private
        // policy-action discovery even if its title contains no risk keyword.
        // This is NOT evidence of war, a country event or paid eligibility.
        if(!(s.officialDocument===true&&category==="geopolitics")&&
           !topicPatterns[category].test(item.title))continue;
        // Source text remains ephemeral. Only finite machine fact tags are
        // produced; third-party noncommercial titles never enter D1.
        const country=resolveCountry(item.title);
        if(country!==null&&(!/^[A-Z]{3}$/u.test(country)))
          throw Error("REUSABLE_NEWS_COUNTRY_RESOLVER_INVALID");
        const normalized=normalize({category,text:item.title,
          published_at:at,license:"unknown",
          ...(country?{country_iso3:country}:{})});
        if(normalized.schema!=="geomacro.reusable-news-json.v1"||
           normalized.delivery.raw_article_included!==false||
           normalized.usage_rights.commercial_reuse_authorized!==false)
          throw Error("REUSABLE_NEWS_NORMALIZER_UNSAFE");
        // A single indexed article appearing in ten search queries is one
        // private discovery item, not ten distinct publisher observations.
        const identity=deduplicateIndexItems&&new URL(s.url).hostname==="news.google.com"?
          "google-news-rss-index-v1":s.id;
        const id=hex([identity,category,at,item.title].join("\n"));
        const safe={...normalized,id:"news-"+id};
        if(!seen.has(id)){
          seen.add(id);
          if(items.length<MAX_ITEMS_PER_RUN){
             items.push(safe);candidates++;domainCandidates[category]++;
           }
          else capacitySkipped++;
        }
      }
    }
    if(state==="OBSERVED"&&candidates===0)state="EMPTY_OR_OUTSIDE_WINDOW";
    for(const category of activeCategories)
      checks.push({source_ref:hex([s.id,s.url,category].join("\n")),
        category,state:state==="OBSERVED"&&!domainCandidates[category]?
          "EMPTY_OR_OUTSIDE_WINDOW":state,checked_at:now.toISOString()});
    // Even if the bounded 40-record item quota is reached, check every
    // selected source and report its status. Never silently drop issuers.
  }
  // Receipt describes OBSERVED attributable countries only. A registered
  // country route, healthy feed, global publisher or CLDR name does not count
  // as a native-dated event for any country. Never log raw title or URL.
  const observedCountries=Object.fromEntries(CATEGORY.map(category=>[
    category,new Set(items.filter(i=>i.category===category&&
      /^[A-Z]{3}$/u.test(i.country_iso3??"")).map(i=>i.country_iso3)).size,
  ]));
  const registeredFeeds=Object.fromEntries(CATEGORY.map(category=>[
    category,registry.filter(s=>s.supported&&s.categories.includes(category)).length,
  ]));
  return {
    schema:"geomacro.reusable-source-news-batch.v1",items,
    checks,
    summary:{registered_source_endpoints:registry.length,
      supported_registered_sources_by_category:registeredFeeds,
      actual_observed_country_count_by_category:observedCountries,
      observed_country_count_is_not_195x3_coverage_certification:true,
      pinned_presidential_sources_selected:active.filter(s=>s.priority===true).length,
      nominal_poll_slot_minutes:REGISTERED_NEWS_POLL_SLOT_MINUTES,
      nominal_max_category_revisit_minutes:Math.max(...CATEGORY.map(category=>
        Math.ceil(registry.filter(s=>s.categories.includes(category)).length/perCategory)*REGISTERED_NEWS_POLL_SLOT_MINUTES)),
      schedule_and_first_report_latency_verified:false,
      selected_source_endpoints:active.length,
      completed_source_endpoints:new Set(checks.map(c=>c.source_ref)).size,
      observed_news_items:items.length,
      excluded_by_collector_capacity:capacitySkipped,
      all_matching_items_captured_within_scanned_feeds:capacitySkipped===0,
      source_states:checks.reduce((a,c)=>(a[c.state]=(a[c.state]??0)+1,a),{}),
      original_issuer_page_verified:false,
      source_rights_commercial_authorized:false,paid_publication_authorized:false,
      raw_upstream_stored:false},
  };
}
