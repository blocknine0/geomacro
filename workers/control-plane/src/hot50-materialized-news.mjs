/**
 * Dedicated, disposable, public-only CQRS row for the 72h source-news bundle.
 * The canonical website_derived_intelligence journal remains the truth.
 * Refreshed from the existing one-minute Worker cron on ten-minute boundaries.
 * No publisher text, protected/paid context, certified risk score or signing.
 */
const KEY="public_derived_news_hot50";
const MAX_BYTES=1_800_000;
const MAX_AGE_MS=11*60_000;
export async function readHot50MaterializedNews(env,now=Date.now()){
 if(!env?.DB?.prepare||!Number.isFinite(now))return null;
 try{
  const receipt=await env.DB.prepare(
    "SELECT payload,updated_at FROM materialized_cache WHERE key=? LIMIT 1"
  ).bind(KEY).all();
  if(!Array.isArray(receipt?.results)||receipt.results.length>1)return null;
  // Observed D1 billing rows, not a guess from SQL LIMIT 1. Explicit opt-in,
  // no source payload or key values are ever written to logs.
  if(env.GEOMACRO_D1_READ_METRICS_SAMPLE==="1")
    console.log(JSON.stringify({schema:"geomacro.d1-hot50-single-row-read.v1",
      query:"PUBLIC_CQRS_PK_ONLY",
      rows_read:Number.isSafeInteger(receipt?.meta?.rows_read)?
        receipt.meta.rows_read:null,
      rows_written:Number.isSafeInteger(receipt?.meta?.rows_written)?
        receipt.meta.rows_written:null}));
  const row=receipt.results[0];
  if(!row||typeof row.payload!=="string"||row.payload.length>MAX_BYTES||
     !Number.isSafeInteger(row.updated_at)||row.updated_at>now||
     now-row.updated_at>MAX_AGE_MS)return null;
  const data=JSON.parse(row.payload);
  return data?.ok===true&&data?.schema==="geomacro.website-derived-news-bundle.v1"&&
   data?.delivery_scope==="free_website_only"&&data?.chargeable===false&&
   data?.complete===true&&data?.item_cap===600&&
   Array.isArray(data.signals)&&data.signals.length<=600&&
   Array.isArray(data.first_ingest)&&data.first_ingest.length===data.signals.length?
   data:null;
 }catch{return null;}
}
export async function refreshHot50MaterializedNews(env,now=Date.now()){
 if(!env?.DB?.prepare||!Number.isFinite(now))return {ok:false,status:"D1_UNAVAILABLE"};
 // Existing 0033 revision-fenced pages avoid a canonical scan on QUIET
 // ticks. A changed journal incurs one bounded <=601-row scan on the producer.
 const {refreshMaterializedNewsPages}=await import("./materialized-public-news-pages.mjs");
 const pages=await refreshMaterializedNewsPages(env,now);
 if(!["MATERIALIZED_ALREADY_CURRENT","MATERIALIZED_COMMIT_VERIFIED"].includes(pages.status))
  return {ok:false,status:"PAGES_REVISION_NOT_VERIFIED"};
 // Dynamic import avoids a module cycle. The producer uses existing canonical
 // revision-fenced pages, never an anonymous HTTP cache hit or prior hot row.
 const {readDerivedStoriesBundle}=await import("./website-derived-intelligence.mjs");
 const response=await readDerivedStoriesBundle({
  ...env,GEOMACRO_D1_READ_HOTSPOT_V2:"0"
 },now,true);
 if(response.status!==200)return {ok:false,status:"JOURNAL_UNAVAILABLE"};
 const text=await response.text();
 if(new TextEncoder().encode(text).byteLength>MAX_BYTES)
  return {ok:false,status:"PAYLOAD_OVER_MAX"};
 let data;try{data=JSON.parse(text)}catch{return{ok:false,status:"JSON_INVALID"}}
 if(data?.schema!=="geomacro.website-derived-news-bundle.v1"||data.ok!==true||
    data.complete!==true||data.item_cap!==600||data.chargeable!==false||
    data.delivery_scope!=="free_website_only"||!Array.isArray(data.signals)||
    data.signals.length>600||!Array.isArray(data.first_ingest)||
    data.first_ingest.length!==data.signals.length)
  return {ok:false,status:"PROJECTION_INVALID"};
 try{
  const result=await env.DB.prepare(
   "INSERT INTO materialized_cache(key,payload,updated_at) VALUES(?,?,?) "+
   "ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at "+
   "WHERE materialized_cache.updated_at<=excluded.updated_at"
  ).bind(KEY,text,now).run();
  if(result?.success===false)throw Error("D1_WRITE");
  // The admission receipt is not provider read quota proof. Never pretend
  // the cron executed when writes were unavailable.
  return {ok:true,status:"CQRS_PUBLIC_REFRESHED",rows:data.signals.length,
   rows_read_for_write:result?.meta?.rows_read??null,
   rows_written_for_write:result?.meta?.rows_written??null};
 }catch{return {ok:false,status:"CQRS_WRITE_UNAVAILABLE"};}
}
