/**
 * All-source factual JSON lane, separate from signed paid intelligence.
 * Authenticated scheduled ingest -> bounded D1 read-only public JSON.
 * Never stores original articles, original titles, article URLs, publisher
 * names, private keys, external source payloads or licensing claims.
 */
export const SOURCE_NEWS_PUBLIC_SCHEMA="geomacro.reusable-source-news-feed.v1";
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const RIGHTS=new Set(["commercial","noncommercial","public_domain","unknown"]);
const STATES=new Set(["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW","UNAVAILABLE","UNSUPPORTED_FORMAT","DENIED","MALFORMED","NOT_DUE"]);
const HEX=/^[0-9a-f]{64}$/u;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
const MS72=72*3600000;
const msg=(payload,status=200)=>Response.json(payload,{status,headers:{
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","Access-Control-Allow-Origin":"*",
}});
function validDate(v){
  if(typeof v!=="string"||!UTC.test(v))return false;
  const time=Date.parse(v);
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,19)===v.slice(0,19);
}
function unsafe(){throw Error("REUSABLE_SOURCE_NEWS_INVALID")}
const keysExact=(obj,allowed)=>{
  if(!obj||typeof obj!=="object"||Array.isArray(obj))return false;
  return Object.keys(obj).every(x=>allowed.includes(x));
};
function validItem(item,now){
  if(!keysExact(item,["schema","id","id_is_cryptographic_proof","category","country_iso3","source","facts","usage_rights","verification","delivery"])||
     item.schema!=="geomacro.reusable-news-json.v1"||
     typeof item.id!=="string"||!/^news-[0-9a-f]{64}$/u.test(item.id)||
     !CATEGORIES.has(item.category)||item.country_iso3!==null||
     item.id_is_cryptographic_proof!==false)unsafe();
  const source=item.source;
  if(!keysExact(source,["publisher_name","original_url","original_published_at"])||
     source.publisher_name!==null||source.original_url!==null||
     !validDate(source.original_published_at))unsafe();
  const age=now-Date.parse(source.original_published_at);
  if(age<0||age>MS72)unsafe();
  const facts=item.facts;
  if(!keysExact(facts,["event_types","action_terms","named_organizations","numeric_mentions","fact_extraction_status"])||
     !Array.isArray(facts.event_types)||facts.event_types.length>12||
     !Array.isArray(facts.action_terms)||facts.action_terms.length>12||
     !Array.isArray(facts.named_organizations)||facts.named_organizations.length>12||
     !Array.isArray(facts.numeric_mentions)||facts.numeric_mentions.length>15||
     !["MACHINE_EXTRACTED_UNVERIFIED","INSUFFICIENT_MACHINE_EXTRACTABLE_FACTS"].includes(facts.fact_extraction_status))
    unsafe();
  for(const arr of [facts.event_types,facts.action_terms,facts.named_organizations]){
    if(arr.some(x=>typeof x!=="string"||x.length>72||!(/^[a-zA-Z0-9_ ./-]+$/u).test(x)))unsafe();
  }
  for(const n of facts.numeric_mentions){
    if(!keysExact(n,["value","unit","scale"])||typeof n.value!=="string"||
       !/^\d{1,9}(?:\.\d{1,4})?$/u.test(n.value)||
       typeof n.unit!=="string"||n.unit.length>24||
       !/^[a-zA-Z% ]*$/u.test(n.unit)||
       !(n.scale===null||["million","billion","trillion"].includes(n.scale)))unsafe();
  }
  if(!keysExact(item.usage_rights,["declared_source_license","declaration_is_verified",
      "article_specific_permission_verified","commercial_reuse_authorized",
      "attribution_and_scope_review_required","factual_analysis_only"])||
     !RIGHTS.has(item.usage_rights.declared_source_license)||
     item.usage_rights.declaration_is_verified!==false||
     item.usage_rights.article_specific_permission_verified!==false||
     item.usage_rights.commercial_reuse_authorized!==false||
     item.usage_rights.attribution_and_scope_review_required!==true||
     item.usage_rights.factual_analysis_only!==true||
     !keysExact(item.verification,["original_page_verified","independent_event_verified",
       "facts_reviewed","source_licence_verified"])||
     Object.values(item.verification).some(x=>x!==false)||
     !keysExact(item.delivery,["raw_article_included","raw_headline_included",
       "downstream_paid_product_authorized","signing_authorized","user_submission_persisted"])||
     Object.values(item.delivery).some(x=>x!==false))unsafe();
  const serialized=JSON.stringify(item);
  if(serialized.length>2400||/https?:\/\/|<[^>]+>|BEGIN (?:PRIVATE|RSA)|bearer\s/iu.test(serialized))
    unsafe();
  return serialized;
}
function validCheck(c,now){
  if(!keysExact(c,["source_ref","category","state","checked_at"])||
     !HEX.test(c.source_ref)||!CATEGORIES.has(c.category)||
     !STATES.has(c.state)||!validDate(c.checked_at)||
     Math.abs(now-Date.parse(c.checked_at))>15*60_000)unsafe();
}
export async function publishReusableSourceNews(env,body,now=Date.now()){
  if(!env?.DB||!Number.isFinite(now)||!keysExact(body,["schema","items","checks"])||
     body.schema!=="geomacro.reusable-source-news-batch.v1"||
     !Array.isArray(body.items)||body.items.length>40||
     !Array.isArray(body.checks)||body.checks.length>48||
     body.items.length+body.checks.length===0)unsafe();
  const unique=new Set(),checks=new Set(),checkedAt=new Date(now).toISOString();
  const rows=body.items.map(item=>{
    const value=validItem(item,now),id=item.id.slice(5);
    if(unique.has(id))unsafe();unique.add(id);
    return {id,category:item.category,at:item.source.original_published_at,json:value};
  });
  for(const check of body.checks){
    validCheck(check,now);
    if(checks.has(check.source_ref))unsafe();
    checks.add(check.source_ref);
  }
  try{
    // Each batch is validated before any writes. Use one transaction via
    // D1 batch to avoid partially promoted groups on an adapter error.
    const prepared=[
      env.DB.prepare("DELETE FROM reusable_news_items WHERE first_seen_at < ?")
        .bind(new Date(now-MS72).toISOString()),
      env.DB.prepare("DELETE FROM reusable_source_checks WHERE checked_at < ?")
        .bind(new Date(now-24*3600000).toISOString()),
    ];
    for(const row of rows){
      prepared.push(env.DB.prepare(
        "INSERT OR IGNORE INTO reusable_news_items(item_id,category,published_at,projection_json,first_seen_at) VALUES(?,?,?,?,?)")
        .bind(row.id,row.category,row.at,row.json,checkedAt));
    }
    for(const check of body.checks){
      prepared.push(env.DB.prepare(
        "INSERT INTO reusable_source_checks(source_ref,category,state,checked_at) VALUES(?,?,?,?) ON CONFLICT(source_ref) DO UPDATE SET category=excluded.category,state=excluded.state,checked_at=excluded.checked_at")
        .bind(check.source_ref,check.category,check.state,check.checked_at));
    }
    await env.DB.batch(prepared);
    // Check admitted IDs by D1 independent readback, even for old duplicates.
    for(const row of rows){
      const found=await env.DB.prepare(
        "SELECT projection_json FROM reusable_news_items WHERE item_id = ?").bind(row.id).first();
      if(!found||found.projection_json!==row.json)throw Error("REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH");
    }
    return msg({ok:true,schema:"geomacro.reusable-source-news-write-receipt.v1",
      accepted:rows.length,checked_sources:body.checks.length,
      d1_readback_verified:true,raw_upstream_stored:false,
      paid_product_authorized:false});
  }catch{
    return msg({ok:false,error:"REUSABLE_SOURCE_NEWS_D1_UNAVAILABLE",paid_product_authorized:false},503);
  }
}
export async function publicReusableSourceNews(env,searchParams=new URLSearchParams(),now=Date.now()){
  const keys=[...searchParams.keys()];
  if(keys.some(k=>k!=="domain"&&k!=="offset")||
     searchParams.getAll("domain").length>1||
     searchParams.getAll("offset").length>1||
     (searchParams.has("domain")&&!CATEGORIES.has(searchParams.get("domain")))||
     (searchParams.has("offset")&&!["0","200","400"].includes(searchParams.get("offset"))))
    return msg({ok:false,error:"REUSABLE_SOURCE_NEWS_QUERY_INVALID"},400);
  const domain=searchParams.get("domain"),offset=Number(searchParams.get("offset")??0);
  try{
    const q=domain?
      env.DB.prepare("SELECT projection_json FROM reusable_news_items WHERE published_at >= ? AND category = ? ORDER BY published_at DESC,item_id DESC LIMIT 201 OFFSET ?")
        .bind(new Date(now-MS72).toISOString(),domain,offset):
      env.DB.prepare("SELECT projection_json FROM reusable_news_items WHERE published_at >= ? ORDER BY published_at DESC,item_id DESC LIMIT 201 OFFSET ?")
        .bind(new Date(now-MS72).toISOString(),offset);
    const raw=(await q.all()).results??[];
    const items=raw.slice(0,200).map(x=>{
      const item=JSON.parse(x.projection_json);
      validItem(item,now);
      return item;
    });
    const checkQ=domain?
      env.DB.prepare("SELECT state,COUNT(*) AS total FROM reusable_source_checks WHERE checked_at >= ? AND category = ? GROUP BY state")
        .bind(new Date(now-24*3600000).toISOString(),domain):
      env.DB.prepare("SELECT state,COUNT(*) AS total FROM reusable_source_checks WHERE checked_at >= ? GROUP BY state")
        .bind(new Date(now-24*3600000).toISOString());
    const checks=(await checkQ.all()).results??[];
    return msg({ok:true,schema:SOURCE_NEWS_PUBLIC_SCHEMA,
      item_schema:"geomacro.reusable-news-json.v1",
      scope:"REGISTERED_RSS_ATOM_NATIVE_FEEDS_AND_EXISTING_DERIVED_NEWS_SEPARATELY",
      public_raw_article_delivery:false,full_global_coverage_claimed:false,
      all_registered_sources_news_capable:false,
      article_licenses_automatically_granted:false,
      commercial_product_ready:false,
      window_hours:72,checked_source_window_hours:24,
      offset,page_size:200,has_more:raw.length>200,
      next_offset:raw.length>200&&offset<400?offset+200:null,
      checked_source_states:Object.fromEntries(checks.map(x=>[x.state,x.total])),
      items});
  }catch{
    return msg({ok:false,error:"REUSABLE_SOURCE_NEWS_READER_UNAVAILABLE",items:[]},503);
  }
}
