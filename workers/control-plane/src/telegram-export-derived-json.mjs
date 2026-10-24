export const OWNER_EXPORT_DERIVED_SCHEMA="geomacro.telegram-export-derived.v1";
const LIMIT=72*60*60*1000;
const CATEGORIES=new Set(["geopolitics","macro","rare_earth"]);
const RIGHTS="OWNER_DECLARED_TELEGRAM_DERIVED_ONLY";
const SHA=/^[0-9a-f]{64}$/u;
const SAFE_SNAP=/^(?:Geopolitical claim|Macro\/FX claim|Critical-minerals claim) [a-z /-]{8,100}; unverified export-derived research only(?:\.|\. Explicit numeric units present: [a-z%, ]{1,60}\.)$/u;
const LIMITS=Object.freeze({maxItems:20,maxRows:300,maxPayloadBytes:50_000});
const H={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const respond=(v,status=200)=>Response.json(v,{status,headers:H});
function reject(){throw Error("TELEGRAM_EXPORT_DERIVED_BATCH_INVALID")}
function valid(item,now){
 if(!item||typeof item!=="object"||Array.isArray(item))reject();
 const keys=["schema_version","category","topic_code","country_iso3","event_type",
   "derived_summary","source_native_published_at","time_quality","observed_at",
   "provenance","rights_state","verification_status","confidence","numeric_mentions",
   "language","scored","execution_authorized",
   "internal_message_fingerprint","internal_chat_fingerprint"];
 if(Object.keys(item).length!==keys.length||
    Object.keys(item).some(x=>!keys.includes(x)))reject();
 if(item.schema_version!==OWNER_EXPORT_DERIVED_SCHEMA||!CATEGORIES.has(item.category)||
   !(item.country_iso3===null||/^[A-Z]{3}$/u.test(item.country_iso3))||
   typeof item.topic_code!=="string"||!/^[A-Z_]{3,32}$/u.test(item.topic_code)||
   item.event_type!==item.topic_code||
   typeof item.derived_summary!=="string"||item.derived_summary.length>280||
   !SAFE_SNAP.test(item.derived_summary))reject();
 if(item.provenance!=="TELEGRAM_PUBLIC_EXPORT"||item.rights_state!==RIGHTS||
   item.verification_status!=="UNVERIFIED_CLAIM"||
   item.confidence!==0.65||item.scored!==false||
   item.execution_authorized!==false||
   !SHA.test(item.internal_message_fingerprint)||
   !SHA.test(item.internal_chat_fingerprint)||
   !["en","bn","ru","zh","unknown"].includes(item.language))reject();
 if(!["EXACT","UNKNOWN_TZ"].includes(item.time_quality)||
    (item.time_quality==="UNKNOWN_TZ")!==(item.source_native_published_at===null))reject();
 const reported=Date.parse(item.observed_at);
 if(!Number.isFinite(reported)||reported>now+60_000||now-reported>15*60_000)reject();
 if(item.source_native_published_at!==null){
   const ms=Date.parse(item.source_native_published_at);
   if(!Number.isFinite(ms)||ms>now||now-ms>LIMIT)reject();
 }
 if(!Array.isArray(item.numeric_mentions)||item.numeric_mentions.length>5||
   item.numeric_mentions.some(n=>!n||typeof n!=="object"||
     Object.keys(n).sort().join("|")!=="unit|value"||
     !/^[0-9]{1,9}(?:\.[0-9]{1,3})?$/u.test(n.value)||
     !/^(?:%|percent|usd|eur|inr|tonnes?|tons?|kg|kilograms?|mt|million|billion|bps)$/u.test(n.unit)))reject();
 const publicRow=Object.fromEntries(Object.entries(item).filter(([k])=>!k.startsWith("internal_")));
 const raw=JSON.stringify(publicRow);
 if(raw.length>2000||/https?:\/\/|t\.me\/|@[\w]+|telegram_(?:username|message_id)|raw_payload/i.test(raw))reject();
 return raw;
}
export async function writeOwnerTelegramExportJson(env,body,now=Date.now()){
 if(!env?.DB||!body||body.schema!=="geomacro.telegram-export-derived-batch.v1"||
   !SHA.test(body.object_sha256)||!Array.isArray(body.items)||
   body.items.length>LIMITS.maxItems||
   Object.keys(body).sort().join("|")!=="items|object_sha256|schema")reject();
 const ids=new Set(),textHashes=new Set(),prepared=[];
 const at=new Date(now).toISOString(),expires=new Date(now+LIMIT).toISOString();
 for(const item of body.items){
   const projection=valid(item,now);
   const digest=await crypto.subtle.digest("SHA-256",
     new TextEncoder().encode(body.object_sha256+"|"+
       item.internal_message_fingerprint+"|"+item.internal_chat_fingerprint));
   const id=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
   if(ids.has(id)||textHashes.has(item.internal_message_fingerprint))reject();
   ids.add(id);textHashes.add(item.internal_message_fingerprint);
   prepared.push({id,item,projection});
 }
 try{
   const prior=await env.DB.prepare("SELECT accepted_items FROM telegram_export_processed_objects WHERE object_sha256=?")
       .bind(body.object_sha256).first();
   if(prior)return respond({ok:true,already_processed:true,accepted:prior.accepted_items,
     commercial_rights_verified:false,paid_delivery_enabled:false});
   // Detect old message text fingerprints across prior exports before INSERT.
   // Duplicate suppression must not be reported as newly admitted news.
   const fresh=[];
   for(const row of prepared){
     const duplicate=await env.DB.prepare(
       "SELECT item_id FROM telegram_export_derived_items WHERE private_text_sha256=?")
        .bind(row.item.internal_message_fingerprint).first();
     if(!duplicate)fresh.push(row);
   }
   // One D1 transaction, dedupe via unique private text hash and input source.
   const batch=[env.DB.prepare(
     "INSERT INTO telegram_export_processed_objects(object_sha256,processed_at,expires_at,accepted_items) VALUES(?,?,?,?)")
       .bind(body.object_sha256,at,expires,fresh.length)];
   for(const r of fresh)batch.push(env.DB.prepare(
     "INSERT OR IGNORE INTO telegram_export_derived_items(item_id,source_object_sha256,private_chat_sha256,private_text_sha256,category,country_iso3,source_native_published_at,observed_at,expires_at,projection_json) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .bind(r.id,body.object_sha256,r.item.internal_chat_fingerprint,
        r.item.internal_message_fingerprint,r.item.category,r.item.country_iso3,
        r.item.source_native_published_at,r.item.observed_at,expires,r.projection));
   batch.push(env.DB.prepare("DELETE FROM telegram_export_derived_items WHERE expires_at<?").bind(at));
   batch.push(env.DB.prepare("DELETE FROM telegram_export_processed_objects WHERE expires_at<?").bind(at));
   batch.push(env.DB.prepare(
      "DELETE FROM telegram_export_derived_items WHERE item_id NOT IN (SELECT item_id FROM telegram_export_derived_items ORDER BY observed_at DESC,item_id DESC LIMIT 300)"));
   await env.DB.batch(batch);
   // Exact D1 readback but no post identity/data in response.
   let admitted=0;
   for(const r of fresh){
     const found=await env.DB.prepare("SELECT projection_json FROM telegram_export_derived_items WHERE item_id=?")
        .bind(r.id).first();
     if(found&&found.projection_json===r.projection)admitted++;
   }
   if(admitted!==fresh.length)throw Error("TELEGRAM_EXPORT_D1_READBACK_FAILED");
   return respond({ok:true,already_processed:false,accepted:admitted,
     checked:prepared.length,d1_readback_verified:true,
     raw_telegram_content_stored:false,commercial_rights_verified:false,
     paid_delivery_enabled:false,source_content_reproduced:false});
 }catch{return respond({ok:false,error:"TELEGRAM_EXPORT_D1_WRITE_UNAVAILABLE"},503)}
}
export async function privateOwnerTelegramExportJson(env,q=new URLSearchParams(),now=Date.now()){
 if(q.getAll("object_sha256").length===1&&[...q.keys()].length===1){
   const value=q.get("object_sha256");
   if(!SHA.test(value))return respond({ok:false,error:"TELEGRAM_EXPORT_OBJECT_CHECK_INVALID"},400);
   try{
     const seen=await env.DB.prepare(
       "SELECT accepted_items FROM telegram_export_processed_objects WHERE object_sha256=? AND expires_at>?")
       .bind(value,new Date(now).toISOString()).first();
     return respond({ok:true,object_processed:!!seen,accepted_items:seen?.accepted_items??0,
       paid_delivery_enabled:false});
   }catch{return respond({ok:false,error:"TELEGRAM_EXPORT_OBJECT_CHECK_D1_UNAVAILABLE"},503)}
 }
 const fields=[...q.keys()];
 if(fields.some(x=>!["category","country","offset"].includes(x))||
   ["category","country","offset"].some(x=>q.getAll(x).length>1)||
   (q.has("category")&&!CATEGORIES.has(q.get("category")))||
   (q.has("country")&&!/^[A-Z]{3}$/u.test(q.get("country")))||
   (q.has("offset")&&!["0","100","200"].includes(q.get("offset"))))
   return respond({ok:false,error:"TELEGRAM_EXPORT_QUERY_INVALID"},400);
 try{
   const params=[new Date(now-LIMIT).toISOString()];
   let where=" WHERE observed_at>=? AND expires_at>?";params.push(new Date(now).toISOString());
   if(q.has("category")){where+=" AND category=?";params.push(q.get("category"))}
   if(q.has("country")){where+=" AND country_iso3=?";params.push(q.get("country"))}
   const offset=Number(q.get("offset")??0);
   const rows=(await env.DB.prepare("SELECT projection_json FROM telegram_export_derived_items"+where+
     " ORDER BY observed_at DESC,item_id DESC LIMIT 101 OFFSET ?").bind(...params,offset).all()).results??[];
   const items=rows.slice(0,100).map(x=>JSON.parse(x.projection_json));
   return respond({ok:true,schema:"geomacro.telegram-export-derived-private-feed.v1",
    items,offset,has_more:rows.length>100,
    next_offset:rows.length>100&&offset<200?offset+100:null,
    payment_required_now:false,commercial_rights_verified:false,
    paid_feature_flag_default_off:true,unscored:true});
 }catch{return respond({ok:false,error:"TELEGRAM_EXPORT_READER_UNAVAILABLE",items:[]},503)}
}
