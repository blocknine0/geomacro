/**
 * Free global GDELT DOC index hints, private and discovery-only.
 * GDELT seendate is INDEX OBSERVATION TIME, never first-party publication.
 * Original article URLs/titles are transient only and no public/store/GRI
 * result may be inferred. Three bounded queries, sequential for rate limiting.
 */
import {createHash} from "node:crypto";
const SEARCHES=Object.freeze([
 ["geopolitics", '(sanctions OR ceasefire OR "foreign ministry" OR military OR conflict)'],
 ["macro", '(inflation OR "central bank" OR GDP OR "foreign exchange" OR fiscal)'],
 ["rare_earth", '("critical minerals" OR "rare earth" OR lithium OR cobalt OR mining)'],
]);
const MAX_BYTES=240000;
const hash=s=>createHash("sha256").update(s).digest("hex");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function indexClock(x){
 const raw=String(x??"");
 if(!/^\d{8}T\d{6}Z$/u.test(raw))return null;
 const time=Date.parse(raw.slice(0,4)+"-"+raw.slice(4,6)+"-"+raw.slice(6,8)+
  "T"+raw.slice(9,11)+":"+raw.slice(11,13)+":"+raw.slice(13,15)+"Z");
 return Number.isFinite(time)?time:null;
}
export async function privateGdeltGlobalDiscovery({
 now=new Date(),fetchImpl=fetch,resolveCountry,sleepImpl=sleep,
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
  typeof resolveCountry!=="function"||typeof fetchImpl!=="function"||
  typeof sleepImpl!=="function")throw Error("OSINT_GDELT_CONFIG_INVALID");
 const outcomes=[],hintIds=new Set(),countryHints=new Set(),countryCategoryHints=new Set();
 let total=0,ambiguous=0;
 for(let i=0;i<SEARCHES.length;i++){
   if(i)await sleepImpl(5200);
   const [category,query]=SEARCHES[i];
   const url=new URL("https://api.gdeltproject.org/api/v2/doc/doc");
   for(const [k,v] of Object.entries({
     query,mode:"artlist",format:"json",timespan:"15min",
     sort:"datedesc",maxrecords:"100"
   }))url.searchParams.set(k,v);
   let state="UNAVAILABLE",candidate=0;
   try{
     const r=await fetchImpl(url.toString(),{method:"GET",
       redirect:"manual",headers:{Accept:"application/json"},
       signal:AbortSignal.timeout(8500)});
     if([401,403,429].includes(r.status))state="DENIED";
     else if(r.status===200&&(!r.url||r.url===url.toString())){
       const bytes=await r.arrayBuffer();
       if(bytes.byteLength>0&&bytes.byteLength<=MAX_BYTES){
         const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
         if(Array.isArray(data.articles)&&data.articles.length<=100){
           state="OBSERVED_INDEX";
           for(const x of data.articles){
             const original=x?.url,head=x?.title,seen=indexClock(x?.seendate);
             if(typeof original!=="string"||typeof head!=="string"||head.length<20||
                head.length>400||!original.startsWith("https://")||!seen||
                seen>now.getTime()+5*60000||seen<now.getTime()-40*60000)continue;
             const country=resolveCountry(head);
             if(country!==null&&!/^[A-Z]{3}$/u.test(country))
               throw Error("OSINT_GDELT_COUNTRY_INVALID");
             if(country===null)ambiguous++;else{
               countryHints.add(country);
               countryCategoryHints.add(category+"\n"+country);
             }
             // A hashed research identity only; never copy index headline/URL
             // into DB, logs, GitHub artifacts or the customer feed.
             const id=hash(category+"\n"+original+"\n"+head);
             if(hintIds.has(id))continue;
             hintIds.add(id);candidate++;total++;
           }
         }else state="MALFORMED";
       }else state="MALFORMED";
     }
   }catch(e){if(e?.message==="OSINT_GDELT_COUNTRY_INVALID")throw e;state="UNAVAILABLE"}
   outcomes.push({category,state,index_metadata_hints:candidate});
 }
 return {
  schema:"geomacro.private-gdelt-discovery-hints.v1",
  checks:outcomes,global_article_index_hints:total,
  mapped_country_count:countryHints.size,
  mapped_country_category_cells:[...countryCategoryHints].map(key=>{
    const [category,country_iso3]=key.split("\n");
    return {category,country_iso3};
  }).sort((a,b)=>a.country_iso3.localeCompare(b.country_iso3)||a.category.localeCompare(b.category)),
  mapped_country_category_counts:Object.fromEntries(SEARCHES.map(([category])=>[
    category,[...countryCategoryHints].filter(key=>key.startsWith(category+"\n")).length
  ])),
  unmapped_or_ambiguous_hints:ambiguous,
  canonical_195_country_router:true,source_publisher_clock_verified:false,
  gdelt_index_time_is_not_publication_time:true,
  source_original_pages_verified:false,commercial_rights_verified:false,
  attribution_and_scope_pending:true,
  original_article_urls_or_titles_emitted:false,
  headline_body_stored:false,raw_content_downloaded:false,
  private_only:true,public_published:false,paid_products_authorized:false,
  index_refresh_guaranteed_within_15m:false,
 };
}
