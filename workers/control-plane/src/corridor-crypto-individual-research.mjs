/** Authenticated private CryptoCompare individual-article five-part D1 ledger.
 * No article bodies/headlines, paid delivery, signed GRO, website or PREDGE.
 */
import {CRYPTO_NEWS_SCHEMA,validCryptoIndividual,cryptoIndividualRecord}
 from "../../../lib/crypto-news-individual-structured.mjs";
const AGE=72*3600000,HEX=/^[a-f0-9]{64}$/u,MAX=10;
const respond=(obj,status=200)=>Response.json(obj,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
 "Referrer-Policy":"no-referrer"}});
const sha=async x=>{
 const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(x));
 return [...new Uint8Array(b)].map(y=>y.toString(16).padStart(2,"0")).join("");
};
const iso=x=>typeof x==="string"&&!Number.isNaN(Date.parse(x))&&
 new Date(x).toISOString()===x;
function invalid(){throw Error("PRIVATE_CRYPTO_NEWS_PROVENANCE_INVALID")}
export async function validateCryptoNewsResearchPacket(packet,now=Date.now()){
 if(!packet||typeof packet!=="object"||Array.isArray(packet)||
  Object.keys(packet).sort().join("|")!==["schema","channel","checked_at","items",
   "website_intelligence_enabled","commercial_rights_verified"].sort().join("|")||
  packet.schema!==CRYPTO_NEWS_SCHEMA||packet.channel!=="CORRIDOR_ONLY"||
  packet.website_intelligence_enabled!==false||packet.commercial_rights_verified!==false||
  !iso(packet.checked_at)||Math.abs(now-Date.parse(packet.checked_at))>15*60000||
  !Array.isArray(packet.items)||packet.items.length>MAX)invalid();
 const result=[],ids=new Set();
 for(const entry of packet.items){
  if(!entry||Object.keys(entry).sort().join("|")!=="record|record_sha256")invalid();
  const record=entry.record,c=record?.candidate;
  if(!validCryptoIndividual(c,now)||!HEX.test(entry.record_sha256)||ids.has(c.id))invalid();
  const calculatedId=await sha(["cryptocompare_news",c.provider_id,
   c.published_at,c.article_url].join("\x1f"));
  if(calculatedId!==c.id)invalid();
  const expected=cryptoIndividualRecord(c);
  // Exact server-side regeneration prevents arbitrary AI text or fake evidence.
  if(JSON.stringify(record)!==JSON.stringify(expected)||JSON.stringify(record).length>6000||
    await sha(JSON.stringify(record))!==entry.record_sha256)invalid();
  ids.add(c.id);
  result.push({record,hash:entry.record_sha256});
 }
 return result;
}
const WRITE="INSERT INTO corridor_crypto_individual_research "+
 "(article_id,provider_id,published_at,article_url,source_name,title_sha256,"+
 "topic,record_sha256,structured_json,first_seen_at,last_seen_at) "+
 "VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(article_id) DO UPDATE SET "+
 "source_name=excluded.source_name,title_sha256=excluded.title_sha256,"+
 "topic=excluded.topic,record_sha256=excluded.record_sha256,"+
 "structured_json=excluded.structured_json,last_seen_at=excluded.last_seen_at "+
 "WHERE corridor_crypto_individual_research.provider_id=excluded.provider_id "+
 "AND corridor_crypto_individual_research.published_at=excluded.published_at "+
 "AND corridor_crypto_individual_research.article_url=excluded.article_url";
export async function putPrivateCryptoNewsResearch(env,packet,now=Date.now()){
 let items;try{items=await validateCryptoNewsResearchPacket(packet,now)}
 catch{return respond({ok:false,error:"CRYPTO_NEWS_RESEARCH_INVALID",chargeable:false},422)}
 if(!env?.DB?.prepare||!env?.DB?.batch)
  return respond({ok:false,error:"CRYPTO_NEWS_D1_UNAVAILABLE",chargeable:false},503);
 const clock=new Date(now).toISOString(),cutoff=new Date(now-AGE).toISOString();
 try{
  if(items.length)await env.DB.batch(items.map(({record,hash})=>{
   const c=record.candidate;
   return env.DB.prepare(WRITE).bind(c.id,c.provider_id,c.published_at,
    c.article_url,c.source_name,c.title_sha256,c.topic,hash,JSON.stringify(record),
    clock,clock);
  }));
  await env.DB.prepare("DELETE FROM corridor_crypto_individual_research "+
   "WHERE published_at < ?").bind(cutoff).run();
  let verified=0;
  if(items.length){
   const rows=(await env.DB.prepare("SELECT article_id,provider_id,published_at,"+
    "article_url,source_name,title_sha256,topic,record_sha256,structured_json "+
    "FROM corridor_crypto_individual_research WHERE article_id IN ("+
    items.map(()=>"?").join(",")+") AND published_at>=?")
    .bind(...items.map(x=>x.record.candidate.id),cutoff).all())?.results??[];
   const byId=new Map(rows.map(x=>[x.article_id,x]));
   verified=items.filter(({record,hash})=>{
    const c=record.candidate,r=byId.get(c.id);
    return r&&r.provider_id===c.provider_id&&r.published_at===c.published_at&&
     r.article_url===c.article_url&&r.source_name===c.source_name&&
     r.title_sha256===c.title_sha256&&r.topic===c.topic&&
     r.record_sha256===hash&&r.structured_json===JSON.stringify(record);
   }).length;
  }
  if(verified!==items.length)return respond({ok:false,
   error:"CRYPTO_NEWS_D1_READBACK_MISMATCH",submitted:items.length,
   verified,chargeable:false},503);
  return respond({ok:true,schema:"geomacro.crypto-news-private-d1-receipt.v1",
   channel:"CORRIDOR_ONLY",submitted:items.length,verified,
   d1_individual_five_part_readback:true,retention_hours:72,
   verified_real_world_events:0,signed_gro_generated:false,
   customer_delivery_authorized:false,commercial_eligible:false,
   website_intelligence_writes:0,predge_writes:0,
   raw_publisher_content_stored:false,chargeable:false});
 }catch{return respond({ok:false,error:"CRYPTO_NEWS_D1_WRITE_UNAVAILABLE",chargeable:false},503)}
}
export async function readPrivateCryptoNewsResearch(env,params=new URLSearchParams(),now=Date.now()){
 if(!env?.DB?.prepare)return respond({ok:false,error:"CRYPTO_NEWS_D1_UNAVAILABLE"},503);
 const n=params.get("limit")??"20";
 if(!/^(?:[1-9]|[1-4]\d|50)$/u.test(n))
  return respond({ok:false,error:"CRYPTO_NEWS_READ_LIMIT_INVALID"},400);
 try{
  const rows=(await env.DB.prepare("SELECT article_id,provider_id,published_at,"+
   "article_url,topic,record_sha256,structured_json FROM corridor_crypto_individual_research "+
   "WHERE published_at>=? ORDER BY published_at DESC LIMIT ?")
   .bind(new Date(now-AGE).toISOString(),Number(n)).all())?.results??[];
  return respond({ok:true,schema:"geomacro.crypto-news-private-read.v1",
   channel:"CORRIDOR_ONLY",count:rows.length,
   records:rows.map(x=>({id:x.article_id,provider_id:x.provider_id,
     published_at:x.published_at,article_url:x.article_url,topic:x.topic,
     record_sha256:x.record_sha256,
     structured:JSON.parse(x.structured_json).structured})),
   independent_events_verified:0,customer_delivery_authorized:false,
   commercial_eligible:false,chargeable:false});
 }catch{return respond({ok:false,error:"CRYPTO_NEWS_D1_READ_UNAVAILABLE"},503)}
}
export async function purgePrivateCryptoNewsResearch(env,now=Date.now()){
 if(!env?.DB?.prepare)return {ok:false};
 try{await env.DB.prepare("DELETE FROM corridor_crypto_individual_research "+
  "WHERE published_at < ?").bind(new Date(now-AGE).toISOString()).run();
  return {ok:true};}catch{return {ok:false}}
}
