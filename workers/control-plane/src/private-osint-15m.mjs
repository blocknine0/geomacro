/**
 * Separate private OSINT intake under HMAC-domain-separated scope credential.
 * 25h original-feed-native-clock research; genuinely verified D1 writes/readbacks.
 * A native RSS/Atom timestamp is NOT an independently verified original page
 * nor evidence of a same-event corroboration, rights clearance or paid product.
 * No unauthenticated/public routes, raw articles, Telegram content or B2 spend.
 */
import {validateReusableSourceNewsItem} from "./reusable-source-news.mjs";
import {privateOsintBundleRead} from "./private-osint-bundle.mjs";

const categories=new Set(["geopolitics","macro","rare_earth"]);
const states=new Set(["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW","UNAVAILABLE","UNSUPPORTED_FORMAT","DENIED","MALFORMED","NOT_DUE"]);
const sha=/^[a-f0-9]{64}$/u, iso=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const maxAgeMs=25*60*60*1000,maxRows=4000;
export const PRIVATE_OSINT_D1_SCHEMA="geomacro.private-osint-15m-durable.v1";
/**
 * Never echo SQL/provider exceptions or source content. Protected callers can
 * distinguish the Cloudflare Free daily hard stop from missing migrations or
 * transient storage failure, without leaking raw D1 messages.
 */
export function privateOsintD1FailureClass(error){
 const message=String(error?.message??"");
 if(/(?:exceeded D1.*daily row read limit|D1.*daily row read limit exceeded|D1_DAILY_ROW_READ_LIMIT)/iu.test(message))
  return "D1_FREE_DAILY_ROW_READ_LIMIT";
 if(/(?:exceeded D1.*daily row write limit|D1.*daily row write limit exceeded|D1_DAILY_ROW_WRITE_LIMIT)/iu.test(message))
  return "D1_FREE_DAILY_ROW_WRITE_LIMIT";
 if(/(?:no such table|no such column|no such index)/iu.test(message))
  return "D1_SCHEMA_UNAVAILABLE";
 return "D1_UNCLASSIFIED_STORAGE_FAILURE";
}
function privateOsintQuotaReset(now){
 const date=new Date(now);
 return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1)).toISOString();
}
const respond=(v,status=200)=>Response.json(v,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex,nofollow",
}});
const exact=(o,fields)=>o&&typeof o==="object"&&!Array.isArray(o)&&
 Object.keys(o).every(k=>fields.includes(k));
function fail(){throw Error("PRIVATE_OSINT_RESEARCH_INPUT_INVALID")}

async function credential(request,env){
 const root=String(env?.CONTROL_PLANE_TOKEN??"").trim();
 if(root.length!==64||!sha.test(root))return {ok:false,status:503,error:"PRIVATE_OSINT_AUTH_UNCONFIGURED"};
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(root),
   {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,
   new TextEncoder().encode("geomacro-private-osint-15m-v1")));
 const expected=[...digest].map(b=>b.toString(16).padStart(2,"0")).join("");
 const supplied=String(request.headers.get("authorization")??"");
 const target=supplied.startsWith("Bearer ")?supplied.slice(7).trim():"";
 if(!sha.test(target))return {ok:false,status:401,error:"UNAUTHORIZED"};
 let diff=0;for(let i=0;i<64;i++)diff|=expected.charCodeAt(i)^target.charCodeAt(i);
 if(diff!==0)return {ok:false,status:401,error:"UNAUTHORIZED"};
 return {ok:true};
}
function validChecks(check,now){
 if(!exact(check,["source_ref","category","state","checked_at"])||
    !sha.test(check.source_ref)||!categories.has(check.category)||
    !states.has(check.state)||!iso.test(check.checked_at)||
    !Number.isFinite(Date.parse(check.checked_at))||
    Math.abs(now-Date.parse(check.checked_at))>10*60000)fail();
}
export async function privateOsint15mWrite(env,body,now=Date.now()){
 if(!env?.DB||!Number.isFinite(now)||!exact(body,["schema","items","checks"])||
    body.schema!==PRIVATE_OSINT_D1_SCHEMA||
    !Array.isArray(body.items)||body.items.length>20||
    !Array.isArray(body.checks)||body.checks.length>32||
    body.items.length+body.checks.length===0)fail();
 const ids=new Set(),refs=new Set();
 const rows=body.items.map(item=>{
   const projection=validateReusableSourceNewsItem(item,now);
   const id=item.id.slice(5);
   if(ids.has(id))fail();ids.add(id);
   return {id,category:item.category,country:item.country_iso3,
     native:item.source.original_published_at,projection};
 });
 for(const check of body.checks){
   validChecks(check,now);
   const key=check.source_ref+":"+check.category;
   if(refs.has(key))fail();refs.add(key);
 }
 const when=new Date(now).toISOString();
 try{
   // Duplicate source polls need a primary-key read, not a complete 4,000-row
   // retention scan on every tiny write batch. Actual new ids still enforce
   // the hard ring limit in the same transaction as their insert.
   const placeholders=rows.map(()=>"?").join(","),itemIds=rows.map(r=>r.id);
   const before=rows.length?await env.DB.prepare("SELECT item_id FROM private_osint_news_25h WHERE item_id IN ("+placeholders+")").bind(...itemIds).all():{results:[]};
   if(!Array.isArray(before.results))throw Error("D1_PREFETCH_INVALID");
   const existingIds=new Set(before.results.map(r=>r.item_id));
   for(const r of rows)r.preexisting=existingIds.has(r.id);
   const hasNewRows=rows.some(r=>!r.preexisting);
   const statements=[
     env.DB.prepare("DELETE FROM private_osint_news_25h WHERE native_feed_published_at < ?")
       .bind(new Date(now-maxAgeMs).toISOString()),
     env.DB.prepare("DELETE FROM private_osint_source_checks_24h WHERE checked_at < ?")
       .bind(new Date(now-24*3600000).toISOString()),
   ];
   for(const r of rows){
    // UPDATE cannot resurrect an old id evicted by a concurrent new batch.
    // Only insert paths need and receive the atomic hard-cap pruning below.
    if(r.preexisting)statements.push(env.DB.prepare(
     "UPDATE private_osint_news_25h SET category=?,country_iso3=?,native_feed_published_at=?,projection_json=?,last_seen_at=? "+
     "WHERE item_id=? AND (projection_json<>? OR last_seen_at<=?)")
     .bind(r.category,r.country,r.native,r.projection,when,r.id,r.projection,new Date(now-6*3600000).toISOString()));
    else statements.push(env.DB.prepare(
     "INSERT INTO private_osint_news_25h(item_id,category,country_iso3,native_feed_published_at,projection_json,first_seen_at,last_seen_at) "+
     "VALUES(?,?,?,?,?,?,?) ON CONFLICT(item_id) DO UPDATE SET "+
     "category=excluded.category,country_iso3=excluded.country_iso3,"+
     "native_feed_published_at=excluded.native_feed_published_at,"+
     "projection_json=excluded.projection_json,last_seen_at=excluded.last_seen_at "+
     "WHERE private_osint_news_25h.projection_json<>excluded.projection_json "+
     "OR private_osint_news_25h.last_seen_at<=?")
     .bind(r.id,r.category,r.country,r.native,r.projection,when,when,new Date(now-6*3600000).toISOString()));
   }
   // 16 rows use 65 bindings including cutoff, below D1's 100-parameter
   // ceiling. Bundling also keeps the largest valid write below 50 queries.
   for(let i=0;i<body.checks.length;i+=16){
    const group=body.checks.slice(i,i+16);
    statements.push(env.DB.prepare(
     "INSERT INTO private_osint_source_checks_24h(source_ref,category,state,checked_at) VALUES "+group.map(()=>"(?,?,?,?)").join(",")+" "+
     "ON CONFLICT(source_ref,category) DO UPDATE SET state=excluded.state,checked_at=excluded.checked_at "+
     "WHERE private_osint_source_checks_24h.state<>excluded.state "+
     "OR private_osint_source_checks_24h.checked_at<=?")
     .bind(...group.flatMap(c=>[c.source_ref,c.category,c.state,c.checked_at]),new Date(now-3600000).toISOString()));
   }
   if(hasNewRows)statements.push(env.DB.prepare(
     // Exact hard-cap retention with a fast SQLite btree COUNT and oldest-
     // first index walk over ONLY the excess rows. The prior NOT IN newest
     // 4,000 scanned the entire retention ring for every new 16-item batch.
     // Preserves oldest eviction, atomic batch and immutable first_seen_at.
     "DELETE FROM private_osint_news_25h WHERE item_id IN "+
     "(SELECT item_id FROM private_osint_news_25h "+
     "ORDER BY native_feed_published_at ASC,item_id ASC LIMIT "+
     "MAX(0,(SELECT COUNT(*) FROM private_osint_news_25h)-"+maxRows+"))"));
   const batch=await env.DB.batch(statements);
   if(batch.some(result=>result?.success===false))throw Error("D1_BATCH_FAILED");
   const readback=rows.length?await env.DB.prepare(
    "SELECT item_id,category,country_iso3,native_feed_published_at,projection_json,first_seen_at FROM private_osint_news_25h WHERE item_id IN ("+placeholders+")")
    .bind(...itemIds).all():{results:[]};
   if(!Array.isArray(readback.results))throw Error("D1_READBACK_INVALID");
   // Native D1 query metadata is optional during rollout. Track actual
   // row consumption when every query reports it; unknown must remain null.
   // No extra D1 queries or private source values are emitted.
   const metadatas=[before.meta,...batch.map(x=>x?.meta),readback.meta];
   const allUsageKnown=metadatas.every(m=>m&&
    Number.isSafeInteger(m.rows_read)&&m.rows_read>=0&&
    Number.isSafeInteger(m.rows_written)&&m.rows_written>=0);
   const d1RowsRead=allUsageKnown?metadatas.reduce((sum,m)=>sum+m.rows_read,0):null;
   const d1RowsWritten=allUsageKnown?metadatas.reduce((sum,m)=>sum+m.rows_written,0):null;
   const foundById=new Map(readback.results.map(r=>[r.item_id,r]));
   let retained=0,excluded=0,within15=0,after15=0,newWithin15=0,newLate=0,reobserved=0;
   for(const r of rows){
     const found=foundById.get(r.id);
     if(!found){excluded++;continue}
     if(found.projection_json!==r.projection||found.category!==r.category||
        (found.country_iso3??null)!==r.country||found.native_feed_published_at!==r.native)
       throw Error("PRIVATE_OSINT_D1_EXACT_READBACK_MISMATCH");
     const first=Date.parse(found.first_seen_at),lag=first-Date.parse(r.native);
     if(!Number.isFinite(first)||first>now+60_000||lag<0)throw Error("PRIVATE_OSINT_D1_FIRST_SEEN_INVALID");
     retained++;
     if(lag<=15*60000)within15++;else after15++;
     // First-seen stays fixed on retries. Report genuinely NEW late arrivals
     // separately from reobservations of a previously durably stored item.
     if(!r.preexisting&&found.first_seen_at===when){
       if(lag<=15*60000)newWithin15++;else newLate++;
     }else reobserved++;
   }
   return respond({ok:true,schema:"geomacro.private-osint-15m-write-receipt.v1",
     persisted:retained,capacity_excluded:excluded,checks_saved:body.checks.length,
     native_feed_to_first_durable_write_within_15m:within15,
     native_feed_to_first_durable_write_over_15m:after15,
     newly_persisted_within_15m:newWithin15,
     newly_persisted_after_15m:newLate,
     previously_persisted_reobserved:reobserved,
     late_arrivals_not_rejected_by_15m_cutoff:true,
     d1_exact_readback_verified:true,
     existence_and_readback_bundled:true,d1_queries_this_write:statements.length+(rows.length?2:0),
     d1_rows_read_this_write:d1RowsRead,d1_rows_written_this_write:d1RowsWritten,
     d1_usage_metadata_complete:allUsageKnown,
     duplicate_news_last_seen_refresh_hours:6,unchanged_check_refresh_minutes:60,
     independent_verification_required_for_ingestion:false,
     original_page_verified:false,source_rights_verified:false,
     breaking_news_global_15m_guaranteed:false,
     publicly_served:false,paid_product_authorized:false,raw_upstream_stored:false});
 }catch(error){
   const failure_class=privateOsintD1FailureClass(error);
   const quota=failure_class==="D1_FREE_DAILY_ROW_READ_LIMIT"||
     failure_class==="D1_FREE_DAILY_ROW_WRITE_LIMIT";
   return respond({ok:false,error:"PRIVATE_OSINT_D1_WRITE_OR_READBACK_UNAVAILABLE",
     failure_class,
     retry_after_utc:quota?privateOsintQuotaReset(now):null,
     write_or_readback_commit_status_unknown:true,
     public_published:false,paid_product_authorized:false},503);
 }
}
export async function privateOsint15mRead(env,query=new URLSearchParams(),now=Date.now()){
 const names=[...query.keys()],cat=query.get("category"),country=query.get("country"),
   offsetRaw=query.get("offset")??"0",offset=Number(offsetRaw);
 if(names.some(x=>!["category","country","offset"].includes(x))||
    ["category","country","offset"].some(x=>query.getAll(x).length>1)||
    (cat!==null&&!categories.has(cat))||
    (country!==null&&!/^[A-Z]{3}$/u.test(country))||
    !/^\d+$/u.test(offsetRaw)||!Number.isSafeInteger(offset)||offset%100!==0||
    offset<0||offset>=maxRows)
   return respond({ok:false,error:"PRIVATE_OSINT_QUERY_INVALID"},400);
 try{
   const where=["native_feed_published_at >= ?"],args=[new Date(now-maxAgeMs).toISOString()];
   if(cat){where.push("category=?");args.push(cat)}
   if(country){where.push("country_iso3=?");args.push(country)}
   const results=await env.DB.prepare(
     "SELECT projection_json,first_seen_at,last_seen_at FROM private_osint_news_25h WHERE "+
     where.join(" AND ")+" ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 101 OFFSET ?")
      .bind(...args,offset).all();
   const rows=results?.results;
   if(!Array.isArray(rows))throw Error("D1_ROWSET_INVALID");
   const items=rows.slice(0,100).map(r=>{
     const item=JSON.parse(r.projection_json);
     validateReusableSourceNewsItem(item,now);
     return {...item,private_first_seen_at:r.first_seen_at,
       private_last_seen_at:r.last_seen_at,
       private_feed_clock_observed:true,
       original_page_independently_verified:false,
       commercially_eligible:false};
   });
   return respond({ok:true,schema:PRIVATE_OSINT_D1_SCHEMA,
     scope:"PROTECTED_INTERNAL_OSINT_RESEARCH_ONLY",
     first_seen_is_database_server_clock:true,
     publisher_native_feed_timestamp_not_page_proof:true,
     independent_verification_required_for_ingestion:false,
     original_page_verified:false,commercial_use_authorized:false,
     country_195_router_not_verified_full_coverage:true,
     retention_hours:25,offset,has_more:rows.length>100,
     next_offset:rows.length>100&&offset+100<maxRows?offset+100:null,items});
 }catch{
   return respond({ok:false,error:"PRIVATE_OSINT_D1_READER_UNAVAILABLE"},503);
 }
}
export async function handlePrivateOsint15m(request,env){
 const auth=await credential(request,env);
 if(!auth.ok)return respond({ok:false,error:auth.error},auth.status);
 const url=new URL(request.url);
 if(!env?.DB)return respond({ok:false,error:"PRIVATE_OSINT_D1_UNAVAILABLE"},503);
 if(request.method==="GET")return url.searchParams.get("view")==="bundle"?
  privateOsintBundleRead(env,url.searchParams):privateOsint15mRead(env,url.searchParams);
 if(request.method!=="PUT"||url.search)return respond({ok:false,error:"PRIVATE_OSINT_METHOD_NOT_ALLOWED"},405);
 try{
   const declared=Number(request.headers.get("content-length")??"0");
   if(Number.isFinite(declared)&&declared>64000)fail();
   const raw=await request.text();
   if(new TextEncoder().encode(raw).byteLength>64000)fail();
   return privateOsint15mWrite(env,JSON.parse(raw));
 }catch{return respond({ok:false,error:"PRIVATE_OSINT_INVALID_BATCH"},400)}
}
