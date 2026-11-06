import {reserveB2AccountQuota} from "./b2-account-quota.mjs";
const TYPES=new Set(["verified_media","official","unverified_osint"]);
const CATEGORIES=new Set(["conflict","macro_economics","commodities","sanctions"]);
const CATEGORY_ALIASES=Object.freeze({macro:"macro_economics",geopolitics:"conflict",
 "critical_minerals":"commodities",rare_earth:"commodities"});
const HEX=/^[a-f0-9]{64}$/u;
const ENCODER=new TextEncoder();
const text=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.length<=max;
const isoCountry=v=>v===null||typeof v==="string"&&/^[A-Z]{2}$/u.test(v);
const json=(v,status=200,headers={})=>Response.json(v,{status,headers:{
 "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",...headers}});
const normalizeTitle=v=>v.normalize("NFC").trim().replace(/\s+/gu," ").toLowerCase();
const sha=async v=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v)))].map(x=>x.toString(16).padStart(2,"0")).join("");

export async function putUnifiedEvents(env,body,now=Date.now()){
 if(!env?.DB?.prepare||body?.schema!=="geomacro.unified-event-batch.v1"||
    !Array.isArray(body.items)||body.items.length<1||body.items.length>100)
  return json({ok:false,error:"UNIFIED_EVENT_BATCH_INVALID"},400);
 try{
  const rows=[],ids=new Set();
  for(const x of body.items){
   if(!x||typeof x!=="object"||!HEX.test(x.id)||!TYPES.has(x.source_type)||
      !text(x.source_name,160)||!(x.source_url===null||typeof x.source_url==="string"&&x.source_url.startsWith("https://")&&x.source_url.length<=1800)||!Number.isFinite(x.credibility_score)||
      x.credibility_score<0.1||x.credibility_score>1||!text(x.title,1200)||
      !(x.summary===null||typeof x.summary==="string"&&x.summary.length<=4000)||
      !(x.raw_payload_ref===null||text(x.raw_payload_ref,512))||!isoCountry(x.country_iso)||
      !CATEGORIES.has(x.risk_category)||!(x.sentiment_score===null||
       Number.isFinite(x.sentiment_score)&&x.sentiment_score>=-1&&x.sentiment_score<=1)||
      !Number.isSafeInteger(x.published_at)||x.published_at<0||
      x.published_at>Math.floor(now/1000)+60)throw Error("ROW_INVALID");
   const normalized=normalizeTitle(x.title);
   if(await sha(`${x.source_name}\n${normalized}\n${x.published_at}`)!==x.id)
    throw Error("ID_MISMATCH");
   if(ids.has(x.id))continue;
   ids.add(x.id);rows.push(x);
  }
  if(!rows.length)return json({ok:true,accepted:0,duplicates:body.items.length,d1_exact_readback_verified:true});
  const stmts=rows.map(x=>env.DB.prepare(
   "INSERT OR IGNORE INTO events(id,source_type,source_name,source_url,credibility_score,title,summary,raw_payload_ref,country_iso,risk_category,independently_verified,sentiment_score,published_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)"
  ).bind(x.id,x.source_type,x.source_name,x.source_url,x.credibility_score,x.title,x.summary,
   x.raw_payload_ref,x.country_iso,x.risk_category,0,x.sentiment_score,x.published_at));
  const written=await env.DB.batch(stmts);
  if(!Array.isArray(written)||written.length!==rows.length||written.some(v=>v?.success===false))
   throw Error("BATCH_WRITE_UNVERIFIED");
  const placeholders=rows.map(()=>"?").join(",");
  const read=await env.DB.prepare(`SELECT id,source_type,source_name,source_url,credibility_score,title,summary,raw_payload_ref,country_iso,risk_category,independently_verified,sentiment_score,published_at FROM events WHERE id IN (${placeholders})`).bind(...rows.map(x=>x.id)).all();
  if(!Array.isArray(read?.results)||read.results.length!==rows.length)throw Error("BATCH_READBACK_MISSING");
  const persisted=new Map(read.results.map(x=>[x.id,x]));
  for(const x of rows){
   const r=persisted.get(x.id);
   if(!r||r.source_type!==x.source_type||r.source_name!==x.source_name||r.source_url!==x.source_url||
      r.credibility_score!==x.credibility_score||r.title!==x.title||
      r.summary!==x.summary||r.raw_payload_ref!==x.raw_payload_ref||
      r.country_iso!==x.country_iso||r.risk_category!==x.risk_category||
      r.independently_verified!==0||r.sentiment_score!==x.sentiment_score||r.published_at!==x.published_at)
    throw Error("BATCH_READBACK_DIVERGED");
  }
  const accepted=written.reduce((n,r)=>n+(Number(r?.meta?.changes)>0?1:0),0);
  return json({ok:true,accepted,unchanged:rows.length-accepted,
   duplicate_batch_ids:body.items.length-rows.length,rows:rows.length,
   d1_exact_readback_verified:true,per_row_readback_verified:true});
 }catch(e){
  const code=/^(ROW_INVALID|ID_MISMATCH|BATCH_WRITE_UNVERIFIED|BATCH_READBACK_MISSING|BATCH_READBACK_DIVERGED)$/u.test(e?.message)?e.message:"D1_UNAVAILABLE";
  return json({ok:false,error:code,held:body.items.length},503);
 }
}

export async function readUnifiedEvents(env,url,now=Date.now()){
 const requestedCategory=url.searchParams.get("category")||"";
 const category=CATEGORY_ALIASES[requestedCategory]||requestedCategory;
 const minRaw=url.searchParams.get("min_credibility")||"";
 const min=Number(minRaw);
 const raw=url.search.startsWith("?")?url.search.slice(1):"";
 if(!env?.DB?.prepare||!CATEGORIES.has(category)||!Number.isFinite(min)||
    !["0.1","0.5","0.7","1"].includes(minRaw)||
    url.searchParams.size!==2||raw!==`category=${requestedCategory}&min_credibility=${url.searchParams.get("min_credibility")}`)
  return json({ok:false,error:"UNIFIED_EVENT_QUERY_INVALID"},400);
 try{
  const args=[category,min,Math.floor(now/1000)-7*86400];
  let sql="SELECT id,source_type,source_name,source_url,credibility_score,title,summary,raw_payload_ref,country_iso,risk_category,independently_verified,sentiment_score,published_at,created_at FROM events WHERE risk_category=? AND credibility_score>=? AND published_at>=?";
  sql+=" ORDER BY published_at DESC,id DESC LIMIT 50";
  const result=await env.DB.prepare(sql).bind(...args).all();
  if(!Array.isArray(result?.results))throw Error();
  return json({ok:true,schema:"geomacro.unified-event-feed.v1",checked_at:new Date(now).toISOString(),
   retention_days:7,category,min_credibility:min,rows:result.results.length,events:result.results},200,
   {"Cache-Control":"public, max-age=60","Access-Control-Allow-Origin":"*","Vary":"Accept-Encoding"});
 }catch{return json({ok:false,error:"UNIFIED_EVENT_FEED_UNAVAILABLE",events:[]},503)}
}

export async function pruneUnifiedEvents(env,now=Date.now(),limit=500){
 if(!env?.DB?.prepare||!Number.isInteger(limit)||limit<1||limit>1000)throw Error("EVENT_PRUNE_INVALID");
 const cutoff=Math.floor(now/1000)-7*86400;
 const r=await env.DB.prepare("DELETE FROM events WHERE id IN (SELECT id FROM events WHERE published_at<? AND archived_at IS NOT NULL ORDER BY published_at,id LIMIT ?)").bind(cutoff,limit).run();
 if(r?.success===false)throw Error("EVENT_PRUNE_FAILED");
 return {ok:true,deleted:Number(r?.meta?.changes)||0,cutoff_epoch:cutoff};
}

export async function exportUnifiedEvents(env,limit=500){
 if(!env?.DB?.prepare||!Number.isInteger(limit)||limit<1||limit>500)
  return json({ok:false,error:"UNIFIED_EVENT_EXPORT_LIMIT_INVALID"},400);
 try{
  const r=await env.DB.prepare("SELECT id,source_type,source_name,source_url,credibility_score,title,summary,raw_payload_ref,country_iso,risk_category,independently_verified,sentiment_score,published_at,created_at FROM events WHERE archived_at IS NULL ORDER BY published_at,id LIMIT ?").bind(limit).all();
  if(!Array.isArray(r?.results))throw Error();
  return json({ok:true,schema:"geomacro.unified-event-archive-export.v1",events:r.results,
   count:r.results.length,has_more:r.results.length===limit});
 }catch{return json({ok:false,error:"UNIFIED_EVENT_EXPORT_UNAVAILABLE"},503)}
}

async function hmac(key,value){
 const raw=typeof key==="string"?ENCODER.encode(key):key;
 const imported=await crypto.subtle.importKey("raw",raw,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return new Uint8Array(await crypto.subtle.sign("HMAC",imported,ENCODER.encode(value)));
}
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,"0")).join("");
async function digest(value){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",value)))}

export async function verifyUnifiedB2Archive(env,body,{fetchImpl=globalThis.fetch.bind(globalThis),
 now=new Date(),reserve=async()=>reserveB2AccountQuota(env.DB,
  {kind:"GET",workflow_id:"unified_event_archive"},{now})}={}){
 const key=body?.archive_object_key;
 if(!env?.DB?.prepare||!HEX.test(body?.archive_sha256??"")||
    typeof key!=="string"||!/^archive\/events\/20\d{6}T\d{2}-[a-f0-9]{64}\.ndjson\.gz$/u.test(key)||
    key.includes(".."))return json({ok:false,error:"UNIFIED_EVENT_ARCHIVE_VERIFY_INVALID"},400);
 try{
  const endpoint=new URL(String(env.B2_S3_ENDPOINT??""));
  const bucket=String(env.B2_SPOOL_BUCKET??"");
  const access=String(env.B2_KEY_ID??""),secret=String(env.B2_APPLICATION_KEY??"");
  if(endpoint.protocol!=="https:"||!/^s3\.[a-z0-9-]+\.backblazeb2\.com$/u.test(endpoint.hostname)||
     !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(bucket)||access.length<5||secret.length<20)
   throw Error("B2_CONFIGURATION_UNAVAILABLE");
  const quota=await reserve();
  if(!quota.ok||!quota.reserved)throw Error("B2_QUOTA_HELD");
  const at=now.toISOString().replace(/[:-]|\.\d{3}/gu,"");
  const day=at.slice(0,8),region=endpoint.hostname.slice(3,-".backblazeb2.com".length);
  const path="/"+[bucket,...key.split("/")].map(encodeURIComponent).join("/");
  const host=endpoint.host,emptyHash=await digest(new Uint8Array());
  const headers="host:"+host+"\n"+"x-amz-content-sha256:"+emptyHash+"\n"+"x-amz-date:"+at+"\n";
  const signed="host;x-amz-content-sha256;x-amz-date",scope=day+"/"+region+"/s3/aws4_request";
  const canonical=["GET",path,"",headers,signed,emptyHash].join("\n");
  const canonicalHash=await digest(ENCODER.encode(canonical));
  const stringToSign=["AWS4-HMAC-SHA256",at,scope,canonicalHash].join("\n");
  const kd=await hmac("AWS4"+secret,day),kr=await hmac(kd,region),ks=await hmac(kr,"s3"),sigKey=await hmac(ks,"aws4_request");
  const signature=hex(await hmac(sigKey,stringToSign));
  const response=await fetchImpl(endpoint.origin+path,{method:"GET",redirect:"manual",
   headers:{"x-amz-content-sha256":emptyHash,"x-amz-date":at,
    "Authorization":"AWS4-HMAC-SHA256 Credential="+access+"/"+scope+
     ", SignedHeaders="+signed+", Signature="+signature},
   signal:AbortSignal.timeout(12000)});
  if(response.status!==200||response.redirected)throw Error("B2_OBJECT_FETCH_FAILED");
  const length=Number(response.headers.get("content-length")||"0");
  if(Number.isFinite(length)&&length>5_000_000)throw Error("B2_OBJECT_TOO_LARGE");
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length>5_000_000||await digest(bytes)!==body.archive_sha256)
   throw Error("B2_OBJECT_SHA256_MISMATCH");
  return json({ok:true,archive_object_key:key,archive_sha256:body.archive_sha256,
   b2_exact_readback_verified:true,byte_length:bytes.length},200);
 }catch(error){
  const code=/^(B2_CONFIGURATION_UNAVAILABLE|B2_QUOTA_HELD|B2_OBJECT_FETCH_FAILED|B2_OBJECT_TOO_LARGE|B2_OBJECT_SHA256_MISMATCH)$/u.test(error?.message)?error.message:"B2_READBACK_UNAVAILABLE";
  return json({ok:false,error:code,held:true},503);
 }
}

export async function reserveUnifiedEventArchiveSlot(env,body,now=Date.now()){
 const hour=new Date(now).toISOString().slice(0,13);
 if(!env?.DB?.prepare||body?.schema!=="geomacro.unified-event-archive-slot.v1"||body.hour_utc!==hour)
  return json({ok:false,error:"UNIFIED_EVENT_ARCHIVE_HOUR_INVALID"},400);
 try{
  const inserted=await env.DB.prepare("INSERT OR IGNORE INTO unified_event_archive_slots(hour_utc,state,reserved_at) VALUES(?,'RESERVED',?)")
   .bind(hour,Math.floor(now/1000)).run();
  if(Number(inserted?.meta?.changes)!==1)return json({ok:false,reserved:false,hour_utc:hour,error:"UNIFIED_EVENT_ARCHIVE_SLOT_ALREADY_USED"},409);
  const row=await env.DB.prepare("SELECT hour_utc,state,reserved_at FROM unified_event_archive_slots WHERE hour_utc=? LIMIT 1").bind(hour).first();
  return json({ok:row?.state==="RESERVED",reserved:row?.state==="RESERVED"&&row?.reserved_at===Math.floor(now/1000),
   hour_utc:hour,
   error:row?.state==="RESERVED"?null:"UNIFIED_EVENT_ARCHIVE_SLOT_UNAVAILABLE"},row?.state==="RESERVED"?200:409);
 }catch{return json({ok:false,error:"UNIFIED_EVENT_ARCHIVE_SLOT_UNAVAILABLE"},503)}
}

export async function ackUnifiedEventsArchive(env,body,now=Date.now()){
 if(!env?.DB?.prepare||body?.schema!=="geomacro.unified-event-archive-ack.v1"||
    !/^20\d{2}-\d{2}-\d{2}T\d{2}$/u.test(body.hour_utc)||!text(body.archive_object_key,512)||!HEX.test(body.archive_sha256)||!Array.isArray(body.ids)||body.ids.length<1||body.ids.length>500||
    body.b2_exact_readback_verified!==true||body.ids.some(x=>!HEX.test(x))||new Set(body.ids).size!==body.ids.length)
  return json({ok:false,error:"UNIFIED_EVENT_ARCHIVE_ACK_INVALID"},400);
 try{
  const placeholders=body.ids.map(()=>"?").join(",");
  await env.DB.prepare(`UPDATE events SET archived_at=?,archive_object_key=?,raw_payload_ref=?,archive_sha256=? WHERE id IN (${placeholders}) AND archived_at IS NULL`)
   .bind(Math.floor(now/1000),body.archive_object_key,body.archive_object_key,body.archive_sha256,...body.ids).run();
  const r=await env.DB.prepare(`SELECT id,archived_at,archive_object_key,archive_sha256 FROM events WHERE id IN (${placeholders})`).bind(...body.ids).all();
  if(!Array.isArray(r?.results)||r.results.length!==body.ids.length||
     r.results.some(x=>!x.archived_at||x.archive_object_key!==body.archive_object_key||x.archive_sha256!==body.archive_sha256))
   throw Error();
  const hour=body.hour_utc;
  await env.DB.prepare("UPDATE unified_event_archive_slots SET state='ACKED',archive_object_key=?,archive_sha256=?,acked_at=? WHERE hour_utc=? AND state='RESERVED'")
   .bind(body.archive_object_key,body.archive_sha256,Math.floor(now/1000),hour).run();
  const slot=await env.DB.prepare("SELECT state,archive_object_key,archive_sha256 FROM unified_event_archive_slots WHERE hour_utc=? LIMIT 1").bind(hour).first();
  if(slot?.state!=="ACKED"||slot.archive_object_key!==body.archive_object_key||slot.archive_sha256!==body.archive_sha256)throw Error();
  return json({ok:true,acknowledged:r.results.length,b2_exact_readback_verified:true,
   d1_archive_pointer_readback_verified:true});
 }catch{return json({ok:false,error:"UNIFIED_EVENT_ARCHIVE_ACK_UNVERIFIED",held:body.ids.length},503)}
}
