/** Authenticated-only, 72h D1 ledger for native corridor article metadata.
 * No headlines, article bodies, website news, PREDGE, signing or paid output.
 */
export const CORRIDOR_NATIVE_D1_SCHEMA="geomacro.corridor-native-news-d1-batch.v1";
const AGE=72*3600000,MAX=40,HEX=/^[0-9a-f]{64}$/u;
const PUBLISHERS=Object.freeze({
 boj_releases:["https://www.boj.or.jp/en/rss/whatsnew.xml",["macro"]],
 boe_news:["https://www.bankofengland.co.uk/rss/news",["macro"]],
 federal_reserve:["https://www.federalreserve.gov/feeds/press_all.xml",["macro"]],
 bank_of_canada:["https://www.bankofcanada.ca/content_type/press-releases/feed/",["macro"]],
 coindesk_rss:["https://www.coindesk.com/arc/outboundfeeds/rss/",["geopolitics","macro"]],
 cointelegraph_rss:["https://cointelegraph.com/rss",["geopolitics","macro"]]
});
const ROUTES=new Set(["strait_of_hormuz","bab_el_mandeb","suez_canal","panama_canal",
 "strait_of_malacca","singapore_strait","south_china_sea","taiwan_strait","red_sea",
 "gulf_of_aden_somali_basin","gulf_of_guinea","black_sea_grain_kerch"]);
const KEYS=["id","source_id","original_publisher_url","article_url","published_at",
 "source_title_sha256","categories","source_region_refs","candidate_corridor_ids",
 "attribution","source_time_is_not_event_time","corridor_impact_verified",
 "original_article_verified","independent_corroboration_verified",
 "article_content_acquired","commercial_rights_verified","customer_delivery_enabled"];
const reply=(data,status=200)=>Response.json(data,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
const date=x=>typeof x==="string"&&
 /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(x)&&
 Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
function invalid(){throw Error("CORRIDOR_PRIVATE_ITEM_INVALID")}
function pinned(url,expected,article=false){
 let u,b;try{u=new URL(url);b=new URL(expected)}catch{return false}
 const host=x=>x.hostname.toLowerCase().replace(/^www\./u,"");
 return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&!u.search&&
   host(u)===host(b)&&u.href.length<=1024&&(article||u.href===expected);
}
function item(x,now){
 if(!x||typeof x!=="object"||Array.isArray(x)||
    Object.keys(x).length!==KEYS.length||KEYS.some(k=>!Object.hasOwn(x,k)))invalid();
 const p=PUBLISHERS[x.source_id];
 if(!p||!HEX.test(x.id)||!HEX.test(x.source_title_sha256)||
    x.original_publisher_url!==p[0]||!pinned(x.original_publisher_url,p[0])||
    !pinned(x.article_url,p[0],true)||!date(x.published_at)||
    Date.parse(x.published_at)>now||now-Date.parse(x.published_at)>AGE||
    !Array.isArray(x.categories)||x.categories.length!==p[1].length||
    x.categories.some(c=>!p[1].includes(c))||
    !Array.isArray(x.source_region_refs)||x.source_region_refs.length<1||
    x.source_region_refs.length>4||
    x.source_region_refs.some(c=>typeof c!=="string"||!/^[a-z-]{2,30}$/u.test(c))||
    !Array.isArray(x.candidate_corridor_ids)||x.candidate_corridor_ids.length>12||
    x.candidate_corridor_ids.some(c=>!ROUTES.has(c))||
    new Set(x.candidate_corridor_ids).size!==x.candidate_corridor_ids.length||
    x.attribution!=="FIRST_PARTY_NATIVE_FEED_METADATA"||
    x.source_time_is_not_event_time!==true||
    [x.corridor_impact_verified,x.original_article_verified,
     x.independent_corroboration_verified,x.article_content_acquired,
     x.commercial_rights_verified,x.customer_delivery_enabled].some(v=>v!==false))
   invalid();
 return [x.id,x.source_id,x.published_at,x.article_url,x.source_title_sha256,
  JSON.stringify(x.source_region_refs),JSON.stringify(x.candidate_corridor_ids),
  JSON.stringify(x.categories)];
}
export function validateCorridorNativeNewsBatch(batch,now=Date.now()){
 if(!Number.isFinite(now)||!batch||typeof batch!=="object"||
   Object.keys(batch).sort().join("|")!==[
    "schema","channel","checked_at","items","website_intelligence_enabled",
    "commercial_rights_verified"].sort().join("|")||
   batch.schema!==CORRIDOR_NATIVE_D1_SCHEMA||batch.channel!=="CORRIDOR_ONLY"||
   batch.website_intelligence_enabled!==false||batch.commercial_rights_verified!==false||
   !date(batch.checked_at)||Math.abs(now-Date.parse(batch.checked_at))>15*60000||
   !Array.isArray(batch.items)||batch.items.length>MAX)invalid();
 const normalized=batch.items.map(x=>item(x,now));
 if(new Set(normalized.map(x=>x[0])).size!==normalized.length)invalid();
 return normalized;
}
const SQL_INSERT="INSERT OR IGNORE INTO corridor_native_news_candidates "+
 "(candidate_id,source_id,native_published_at,article_url,source_title_sha256,"+
 "source_region_refs_json,candidate_corridor_ids_json,categories_json,first_ingested_at) "+
 "VALUES (?,?,?,?,?,?,?,?,?)";
export async function putPrivateCorridorNativeNews(env,batch,now=Date.now()){
 let records;try{records=validateCorridorNativeNewsBatch(batch,now)}
 catch{return reply({ok:false,error:"CORRIDOR_PRIVATE_ITEM_INVALID",chargeable:false},422)}
 if(!env?.DB?.prepare||!env?.DB?.batch)
   return reply({ok:false,error:"CORRIDOR_PRIVATE_D1_UNAVAILABLE",chargeable:false},503);
 const checked=new Date(now).toISOString(),cutoff=new Date(now-AGE).toISOString();
 try{
  if(records.length)
   await env.DB.batch(records.map(x=>env.DB.prepare(SQL_INSERT).bind(...x,checked)));
  await env.DB.prepare("DELETE FROM corridor_native_news_candidates "+
    "WHERE native_published_at < ?").bind(cutoff).run();
  let found=0;
  if(records.length){
   const placeholders=records.map(()=>"?").join(",");
   const rows=await env.DB.prepare("SELECT candidate_id FROM corridor_native_news_candidates "+
    "WHERE candidate_id IN ("+placeholders+") AND native_published_at >= ?")
     .bind(...records.map(x=>x[0]),cutoff).all();
   const ids=new Set((rows?.results??[]).map(x=>x.candidate_id));
   found=records.filter(x=>ids.has(x[0])).length;
  }
  if(found!==records.length)
    return reply({ok:false,error:"CORRIDOR_NATIVE_D1_READBACK_MISMATCH",
      expected:records.length,verified:found,chargeable:false},503);
  return reply({ok:true,schema:"geomacro.corridor-native-news-d1-receipt.v1",
   checked_at:checked,channel:"CORRIDOR_ONLY",submitted:records.length,verified:found,
   d1_readback_verified:true,retention_hours:72,website_intelligence_writes:0,
   publisher_title_stored:false,raw_upstream_stored:false,
   paid_publication_authorized:false,signed_gro_generated:false,chargeable:false});
 }catch{return reply({ok:false,error:"CORRIDOR_PRIVATE_D1_WRITE_UNAVAILABLE",chargeable:false},503)}
}
export async function readPrivateCorridorNativeNews(env,params=new URLSearchParams(),now=Date.now()){
 if(!env?.DB?.prepare)return reply({ok:false,error:"CORRIDOR_PRIVATE_D1_UNAVAILABLE",chargeable:false},503);
 const count=params.get("limit")??"25";
 if(!/^(?:[1-9]|[1-4]\d|50)$/u.test(count))
   return reply({ok:false,error:"CORRIDOR_PRIVATE_READ_LIMIT_INVALID",chargeable:false},400);
 try{
  const rows=await env.DB.prepare(
   "SELECT candidate_id,source_id,native_published_at,article_url,candidate_corridor_ids_json "+
   "FROM corridor_native_news_candidates WHERE native_published_at >= ? "+
   "ORDER BY native_published_at DESC LIMIT ?"
  ).bind(new Date(now-AGE).toISOString(),Number(count)).all();
  return reply({ok:true,schema:"geomacro.corridor-native-news-private-read.v1",
   channel:"CORRIDOR_ONLY",checked_at:new Date(now).toISOString(),
   count:(rows?.results??[]).length,candidates:(rows?.results??[]).map(r=>({
    id:r.candidate_id,source_id:r.source_id,published_at:r.native_published_at,
    article_url:r.article_url,candidate_corridor_ids:JSON.parse(r.candidate_corridor_ids_json)
   })),raw_publisher_content:false,verified_events:false,commercial_eligible:false,
   website_intelligence_enabled:false,chargeable:false});
 }catch{return reply({ok:false,error:"CORRIDOR_PRIVATE_D1_READ_UNAVAILABLE",chargeable:false},503)}
}
export async function purgeExpiredCorridorNativeNews(env,now=Date.now()){
 if(!env?.DB?.prepare)return {ok:false};
 try{
  await env.DB.prepare("DELETE FROM corridor_native_news_candidates "+
   "WHERE native_published_at < ?").bind(new Date(now-AGE).toISOString()).run();
  return {ok:true};
 }catch{return {ok:false}}
}
