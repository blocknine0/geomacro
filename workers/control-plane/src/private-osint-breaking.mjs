/**
 * AUTH-ONLY private OSINT metadata intake. No public route, Telegram scraping,
 * raw source titles/articles/URLs, or commercial publication.
 *
 * Source-native clock drives 25h expiry; immutable first_seen_at measures
 * observed ingestion lag against the requested 15-minute target.
 */
export const PRIVATE_OSINT_SCHEMA="geomacro.private-osint-15m-batch.v1";
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const STATES=new Set(["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW","UNAVAILABLE",
 "UNSUPPORTED_FORMAT","DENIED","MALFORMED","NOT_DUE"]);
const HEX=/^[a-f0-9]{64}$/u,ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const HOUR=3600000,MINUTE=60000,WINDOW=25*HOUR,CAP=4000;
const msg=(v,status=200)=>Response.json(v,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer",
}});
function bad(){throw Error("PRIVATE_OSINT_INPUT_INVALID")}
function iso(s){return typeof s==="string"&&ISO.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,19)===s.slice(0,19)}
function projection(item,now){
 if(!item||typeof item!=="object"||Array.isArray(item)||
   !/^news-[a-f0-9]{64}$/u.test(item.id??"")||
   item.schema!=="geomacro.reusable-news-json.v1"||
   item.id_is_cryptographic_proof!==false||!CATEGORIES.has(item.category)||
   !(item.country_iso3===null||/^[A-Z]{3}$/u.test(item.country_iso3))||
   !item.source||item.source.publisher_name!==null||item.source.original_url!==null||
   !iso(item.source.original_published_at)||
   now-Date.parse(item.source.original_published_at)>WINDOW||
   now<Date.parse(item.source.original_published_at)||
   !item.facts||!Array.isArray(item.facts.event_types)||
   !Array.isArray(item.facts.action_terms)||!Array.isArray(item.facts.named_organizations)||
   !Array.isArray(item.facts.numeric_mentions)||
   item.facts.event_types.length>12||item.facts.action_terms.length>12||
   item.facts.named_organizations.length>12||item.facts.numeric_mentions.length>15||
   !["MACHINE_EXTRACTED_UNVERIFIED","INSUFFICIENT_MACHINE_EXTRACTABLE_FACTS"].includes(item.facts.fact_extraction_status)||
   !item.usage_rights||item.usage_rights.commercial_reuse_authorized!==false||
   item.usage_rights.article_specific_permission_verified!==false||
   item.usage_rights.attribution_and_scope_review_required!==true||
   !item.verification||Object.values(item.verification).some(v=>v!==false)||
   !item.delivery||Object.values(item.delivery).some(v=>v!==false))bad();
 const keys=["schema","id","id_is_cryptographic_proof","category","country_iso3","source","facts","usage_rights","verification","delivery"];
 if(Object.keys(item).some(x=>!keys.includes(x))||
    Object.keys(item.source).some(x=>!["publisher_name","original_url","original_published_at"].includes(x))||
    Object.keys(item.facts).some(x=>!["event_types","action_terms","named_organizations","numeric_mentions","fact_extraction_status"].includes(x))||
    Object.keys(item.usage_rights).some(x=>!["declared_source_license","declaration_is_verified","article_specific_permission_verified","commercial_reuse_authorized","attribution_and_scope_review_required","factual_analysis_only"].includes(x)))bad();
 const text=JSON.stringify(item);
 if(text.length<400||text.length>2400||
    /https?:\/\/|<[^>]+>|bearer\s|BEGIN (?:PRIVATE|RSA)/iu.test(text))bad();
 // No free-form quoted content: only short pre-defined machine fact tags.
 for(const a of [item.facts.event_types,item.facts.action_terms,item.facts.named_organizations]){
   if(a.some(x=>typeof x!=="string"||x.length>72||!/^[a-zA-Z0-9_ ./-]+$/u.test(x)))bad();
 }
 for(const x of item.facts.numeric_mentions)
   if(!x||typeof x.value!=="string"||!/^\d{1,9}(?:\.\d{1,4})?$/u.test(x.value)||
      typeof x.unit!=="string"||x.unit.length>24||!/^[a-zA-Z% ]*$/u.test(x.unit)||
      !(x.scale===null||["million","billion","trillion"].includes(x.scale)))bad();
 return text;
}
export async function putPrivateOsint15m(env,batch,now=Date.now()){
 if(!env?.DB||!Number.isFinite(now)||!batch||batch.schema!==PRIVATE_OSINT_SCHEMA||
    !Array.isArray(batch.items)||batch.items.length>20||
    !Array.isArray(batch.checks)||batch.checks.length>16||
    batch.items.length+batch.checks.length===0)bad();
 const rows=[],checks=[],unique=new Set(),cunique=new Set();
 for(const item of batch.items){
   const json=projection(item,now),id=item.id.slice(5);
   if(unique.has(id))bad();unique.add(id);
   rows.push({id,json,at:item.source.original_published_at,category:item.category,country:item.country_iso3});
 }
 for(const c of batch.checks){
   if(!c||!HEX.test(c.source_ref)||!CATEGORIES.has(c.category)||
      !STATES.has(c.state)||!iso(c.checked_at)||
      Math.abs(now-Date.parse(c.checked_at))>15*MINUTE||
      cunique.has(c.source_ref)||Object.keys(c).some(k=>!["source_ref","category","state","checked_at"].includes(k)))bad();
   cunique.add(c.source_ref);checks.push(c);
 }
 const stamp=new Date(now).toISOString();
 try{
   const statements=[
     env.DB.prepare("DELETE FROM private_osint_news WHERE published_at < ?").bind(new Date(now-WINDOW).toISOString()),
     env.DB.prepare("DELETE FROM private_osint_source_checks WHERE checked_at < ?").bind(new Date(now-24*HOUR).toISOString()),
   ];
   for(const r of rows)statements.push(env.DB.prepare(
     "INSERT INTO private_osint_news(item_id,category,country_iso3,published_at,projection_json,first_seen_at) VALUES(?,?,?,?,?,?) "+
     "ON CONFLICT(item_id) DO UPDATE SET category=excluded.category,country_iso3=excluded.country_iso3,published_at=excluded.published_at,projection_json=excluded.projection_json"
   ).bind(r.id,r.category,r.country,r.at,r.json,stamp));
   for(const c of checks)statements.push(env.DB.prepare(
     "INSERT INTO private_osint_source_checks(source_ref,category,state,checked_at) VALUES(?,?,?,?) "+
     "ON CONFLICT(source_ref) DO UPDATE SET category=excluded.category,state=excluded.state,checked_at=excluded.checked_at"
   ).bind(c.source_ref,c.category,c.state,c.checked_at));
   statements.push(env.DB.prepare("DELETE FROM private_osint_news WHERE item_id NOT IN "+
     "(SELECT item_id FROM private_osint_news ORDER BY published_at DESC,item_id DESC LIMIT "+CAP+")"));
   await env.DB.batch(statements);
   let first=0,within15=0,late=0,missing=0;
   for(const r of rows){
     const found=await env.DB.prepare("SELECT projection_json,first_seen_at FROM private_osint_news WHERE item_id=?").bind(r.id).first();
     if(!found){missing++;continue}
     if(found.projection_json!==r.json||!iso(found.first_seen_at))throw Error("PRIVATE_OSINT_D1_READBACK_MISMATCH");
     if(found.first_seen_at===stamp){
       first++;
       const age=Date.parse(found.first_seen_at)-Date.parse(r.at);
       if(age>=0&&age<=15*MINUTE)within15++;else late++;
     }
   }
   return msg({ok:true,schema:"geomacro.private-osint-15m-write-ack.v1",
     retained_readback:rows.length-missing,first_observed:first,
     first_observed_within_15m:within15,first_observed_after_15m:late,
     excluded_by_rolling_capacity:missing,source_checks_written:checks.length,
     time_target_minutes:15,source_clock_is_original_page_verified:false,
     immutable_first_seen_clock:true,d1_readback_verified:true,
     private_only:true,public_published:false,commercial_authorized:false,
     retention_hours:25,raw_article_stored:false});
 }catch(e){
   return msg({ok:false,error:e?.message==="PRIVATE_OSINT_D1_READBACK_MISMATCH"?
     "PRIVATE_OSINT_D1_READBACK_MISMATCH":"PRIVATE_OSINT_D1_UNAVAILABLE",public_published:false},503);
 }
}
export async function getPrivateOsint15m(env,query=new URLSearchParams(),now=Date.now()){
 const keys=[...query.keys()],country=query.get("country"),category=query.get("category"),
  offsetRaw=query.get("offset")??"0",offset=Number(offsetRaw);
 if(keys.some(k=>!["country","category","offset"].includes(k))||
    ["country","category","offset"].some(k=>query.getAll(k).length>1)||
    (country!==null&&!/^[A-Z]{3}$/u.test(country))||
    (category!==null&&!CATEGORIES.has(category))||
    !/^\d+$/u.test(offsetRaw)||!Number.isSafeInteger(offset)||offset%100!==0||offset>=CAP)
   return msg({ok:false,error:"PRIVATE_OSINT_QUERY_INVALID"},400);
 try{
   const where=["published_at>=?"],args=[new Date(now-WINDOW).toISOString()];
   if(country){where.push("country_iso3=?");args.push(country)}
   if(category){where.push("category=?");args.push(category)}
   const found=await env.DB.prepare("SELECT projection_json,first_seen_at FROM private_osint_news WHERE "+
    where.join(" AND ")+" ORDER BY published_at DESC,item_id DESC LIMIT 101 OFFSET ?")
    .bind(...args,offset).all();
   const records=found?.results??[];
   const items=records.slice(0,100).map(x=>{
     const item=JSON.parse(x.projection_json);
     projection(item,now);return {item,first_seen_at:x.first_seen_at};
   });
   return msg({ok:true,schema:"geomacro.private-osint-15m-feed.v1",
      scope:"OWNER_PROTECTED_RESEARCH_ONLY",categories:["geopolitics","macro","rare_earth"],
      routing_country_count:195,coverage_195_verified:false,retention_hours:25,
      latency_target_minutes:15,latency_guaranteed:false,
      source_originals_verified:false,commercial_authorized:false,
      first_source_publication_is_native_feed_claim:true,
      private_only:true,raw_source_included:false,
      offset,page_size:100,has_more:records.length>100,
      next_offset:records.length>100&&offset+100<CAP?offset+100:null,
      items});
 }catch{return msg({ok:false,error:"PRIVATE_OSINT_READER_UNAVAILABLE"},503)}
}
