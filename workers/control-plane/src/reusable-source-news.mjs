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
export const REUSABLE_NEWS_RETENTION_HOURS=25;
const MS25=REUSABLE_NEWS_RETENTION_HOURS*3600000;
export const REUSABLE_NEWS_MAX_STORED_ITEMS=4000;
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
export function validateReusableSourceNewsItem(item,now){
  if(!keysExact(item,["schema","id","id_is_cryptographic_proof","category","country_iso3","source","facts","usage_rights","verification","delivery"])||
     item.schema!=="geomacro.reusable-news-json.v1"||
     typeof item.id!=="string"||!/^news-[0-9a-f]{64}$/u.test(item.id)||
     !CATEGORIES.has(item.category)||
     !(item.country_iso3===null||typeof item.country_iso3==="string"&&
       /^[A-Z]{3}$/u.test(item.country_iso3))||
     item.id_is_cryptographic_proof!==false)unsafe();
  const source=item.source;
  if(!keysExact(source,["publisher_name","original_url","original_published_at"])||
     source.publisher_name!==null||source.original_url!==null||
     !validDate(source.original_published_at))unsafe();
  const age=now-Date.parse(source.original_published_at);
  if(age<0||age>MS25)unsafe();
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
    const value=validateReusableSourceNewsItem(item,now),id=item.id.slice(5);
    if(unique.has(id))unsafe();unique.add(id);
    return {id,category:item.category,at:item.source.original_published_at,json:value};
  });
  for(const check of body.checks){
    validCheck(check,now);
    if(checks.has(check.source_ref))unsafe();
    checks.add(check.source_ref);
  }
  try{
    const ids=rows.map(r=>r.id);
    const markers=rows.map(()=>"?").join(",");
    // An exact indexed prefetch replaces N independent readback lookups.
    // First-seen is immutable; a repeated native feed never becomes "new".
    const priorRows=rows.length?await env.DB.prepare(
      "SELECT item_id,first_seen_at FROM reusable_news_items WHERE item_id IN ("+markers+")"
    ).bind(...ids).all():{results:[]};
    if(!Array.isArray(priorRows.results)||priorRows.results.length>rows.length)
      throw Error("REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH");
    const previous=new Map(priorRows.results.map(r=>[r.item_id,r.first_seen_at]));
    if(previous.size!==priorRows.results.length)
      throw Error("REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH");
    const newlyObserved=rows.some(r=>!previous.has(r.id));
    const prepared=[];
    // TTL sweep is required only for new items, not every duplicate feed
    // observation / 48-source health bundle. All read routes already exclude
    // expired native dates independently.
    if(newlyObserved){
      prepared.push(env.DB.prepare("DELETE FROM reusable_news_items WHERE published_at < ?")
        .bind(new Date(now-MS25).toISOString()));
      prepared.push(env.DB.prepare("DELETE FROM reusable_source_checks WHERE checked_at < ?")
        .bind(new Date(now-24*3600000).toISOString()));
    }
    if(rows.length){
      prepared.push(env.DB.prepare(
        "INSERT INTO reusable_news_items(item_id,category,published_at,projection_json,first_seen_at) "+
        "SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),"+
        "json_extract(value,'$[2]'),json_extract(value,'$[3]'),? "+
        "FROM json_each(?) WHERE 1 "+
        "ON CONFLICT(item_id) DO UPDATE SET "+
        "category=excluded.category,published_at=excluded.published_at,"+
        "projection_json=excluded.projection_json "+
        "WHERE reusable_news_items.category<>excluded.category "+
        "OR reusable_news_items.published_at<>excluded.published_at "+
        "OR reusable_news_items.projection_json<>excluded.projection_json"
      ).bind(checkedAt,JSON.stringify(rows.map(r=>[
        r.id,r.category,r.at,r.json
      ]))));
    }
    if(body.checks.length){
      // 48 checks per SQL statement. Unchanged health checks refresh at most
      // hourly; a changed state is recorded immediately. No fake fetches.
      prepared.push(env.DB.prepare(
        "INSERT INTO reusable_source_checks(source_ref,category,state,checked_at) "+
        "SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]'),"+
        "json_extract(value,'$[2]'),json_extract(value,'$[3]') "+
        "FROM json_each(?) WHERE 1 "+
        "ON CONFLICT(source_ref) DO UPDATE SET "+
        "category=excluded.category,state=excluded.state,checked_at=excluded.checked_at "+
        "WHERE reusable_source_checks.category<>excluded.category "+
        "OR reusable_source_checks.state<>excluded.state "+
        "OR reusable_source_checks.checked_at<=?"
      ).bind(JSON.stringify(body.checks.map(c=>[
        c.source_ref,c.category,c.state,c.checked_at
      ])),new Date(now-3600000).toISOString()));
    }
    if(newlyObserved){
      // Only new items can push the hard 4,000-row cap. Oldest-first indexed
      // eviction avoids the former full-ring NOT IN scan on every feed poll.
      prepared.push(env.DB.prepare(
        "DELETE FROM reusable_news_items WHERE item_id IN "+
        "(SELECT item_id FROM reusable_news_items "+
        "ORDER BY published_at ASC,item_id ASC LIMIT "+
        "MAX(0,(SELECT COUNT(*) FROM reusable_news_items)-"+REUSABLE_NEWS_MAX_STORED_ITEMS+"))"
      ));
    }
    if(prepared.length){
      const writes=await env.DB.batch(prepared);
      if(!Array.isArray(writes)||writes.some(x=>x?.success===false))
        throw Error("REUSABLE_SOURCE_NEWS_D1_WRITE_FAILED");
    }
    // Independent exact D1 readback: one index lookup for up to 40 IDs, not
    // 40 separate requests. Never assume an UPSERT is a durable write proof.
    const after=rows.length?await env.DB.prepare(
      "SELECT item_id,projection_json,first_seen_at FROM reusable_news_items WHERE item_id IN ("+markers+")"
    ).bind(...ids).all():{results:[]};
    if(!Array.isArray(after.results)||after.results.length>rows.length)
      throw Error("REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH");
    const savedById=new Map(after.results.map(x=>[x.item_id,x]));
    if(savedById.size!==after.results.length)
      throw Error("REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH");
    let retained=0,capacityExcluded=0,firstSeenWithin15m=0,firstSeenLate15m=0,previouslySeen=0;
    for(const row of rows){
      const found=savedById.get(row.id);
      if(!found){capacityExcluded++;continue}
      if(found.projection_json!==row.json||
         (previous.has(row.id)&&found.first_seen_at!==previous.get(row.id)))
        throw Error("REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH");
      const firstSeen=Date.parse(found.first_seen_at??"");
      if(!Number.isFinite(firstSeen)||firstSeen>now+10*60_000)
        throw Error("REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH");
      if(!previous.has(row.id)&&found.first_seen_at===checkedAt){
        if(firstSeen-Date.parse(row.at)<=15*60_000)firstSeenWithin15m++;
        else firstSeenLate15m++;
      }else previouslySeen++;
      retained++;
    }
    return msg({ok:true,schema:"geomacro.reusable-source-news-write-receipt.v1",
      accepted:retained,capacity_excluded:capacityExcluded,
      checked_sources:body.checks.length,
      first_observed_within_15m_count:firstSeenWithin15m,
      first_observed_later_than_15m_count:firstSeenLate15m,
      previously_observed_count:previouslySeen,
      d1_bundled_query_count:prepared.length+(rows.length?2:0),
      d1_batch_checks:body.checks.length,d1_batch_news:rows.length,
      first_observation_is_not_independent_verification:true,
      retention_hours:REUSABLE_NEWS_RETENTION_HOURS,
      d1_readback_verified:true,raw_upstream_stored:false,
      paid_product_authorized:false});
  }catch(e){
    // A stable diagnostic code, never the private D1/SQL/source exception.
    const code=e instanceof Error&&e.message==="REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH"
      ?"REUSABLE_SOURCE_NEWS_D1_READBACK_MISMATCH":"REUSABLE_SOURCE_NEWS_D1_UNAVAILABLE";
    return msg({ok:false,error:code,paid_product_authorized:false},503);
  }
}
export async function publicReusableSourceNews(env,searchParams=new URLSearchParams(),now=Date.now()){
  const keys=[...searchParams.keys()];
  const offsetRaw=searchParams.get("offset")??"0";
  const offsetN=Number(offsetRaw);
  if(keys.some(k=>!["domain","offset","country"].includes(k))||
     searchParams.getAll("domain").length>1||
     searchParams.getAll("country").length>1||
     searchParams.getAll("offset").length>1||
     (searchParams.has("domain")&&!CATEGORIES.has(searchParams.get("domain")))||
     (searchParams.has("country")&&!/^[A-Z]{3}$/u.test(searchParams.get("country")??""))||
     !/^\d+$/u.test(offsetRaw)||!Number.isSafeInteger(offsetN)||
     offsetN%200!==0||offsetN<0||offsetN>=REUSABLE_NEWS_MAX_STORED_ITEMS)
    return msg({ok:false,error:"REUSABLE_SOURCE_NEWS_QUERY_INVALID"},400);
  const domain=searchParams.get("domain"),country=searchParams.get("country"),offset=offsetN;
  try{
    const where=["published_at >= ?"],params=[new Date(now-MS25).toISOString()];
    if(domain){where.push("category = ?");params.push(domain)}
    if(country){where.push("json_extract(projection_json, '$.country_iso3') = ?");params.push(country)}
    const q=env.DB.prepare("SELECT projection_json FROM reusable_news_items WHERE "+where.join(" AND ")+
      " ORDER BY published_at DESC,item_id DESC LIMIT 201 OFFSET ?")
      .bind(...params,offset);
    const raw=(await q.all()).results??[];
    const items=raw.slice(0,200).map(x=>{
      const item=JSON.parse(x.projection_json);
      validateReusableSourceNewsItem(item,now);
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
      window_hours:REUSABLE_NEWS_RETENTION_HOURS,
      max_retained_news_items:REUSABLE_NEWS_MAX_STORED_ITEMS,
      country_filter:country,domain_filter:domain,
      checked_source_window_hours:24,
      offset,page_size:200,has_more:raw.length>200,
      next_offset:raw.length>200&&offset+200<REUSABLE_NEWS_MAX_STORED_ITEMS?offset+200:null,
      checked_source_states:Object.fromEntries(checks.map(x=>[x.state,x.total])),
      items});
  }catch{
    return msg({ok:false,error:"REUSABLE_SOURCE_NEWS_READER_UNAVAILABLE",items:[]},503);
  }
}
