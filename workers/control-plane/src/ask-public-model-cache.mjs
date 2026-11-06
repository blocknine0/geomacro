/**
 * Authenticated control-plane D1 cache for already-approved public Ask model
 * wording. Callers hold the existing derived control-plane bearer token.
 *
 * Strict privacy boundary: only SHA-256 fingerprints and FOUR approved public
 * answer fields, never question/identity/context/evidence/signature/score.
 */
const KEY=/^[a-f0-9]{64}$/u;
const FIELDS=["summary","what_changed","why_it_matters","geomacro_view"];
const MAX_FIELD=[400,520,420,420];
const NO_PRIVATE=/(?:https?:\/\/|www\.|@|<\/?|-----BEGIN|sk-[a-z0-9_-]+|\b(?:osint|unverified|publisher|source url|source id|internal database|private source|openai api|chatgpt api)\b)/iu;
const maxBody=2500;
function reply(json,status=200){
 return new Response(JSON.stringify(json),{
  status,headers:{"content-type":"application/json; charset=utf-8",
    "cache-control":"private, no-store"}});
}
export function boundedCacheFields(candidate){
 if(!candidate||typeof candidate!=="object"||Array.isArray(candidate)||
   Object.keys(candidate).sort().join("|")!==FIELDS.slice().sort().join("|"))
   return null;
 const fields={};
 for(let i=0;i<FIELDS.length;i++){
   const field=FIELDS[i],value=candidate[field];
   if(typeof value!=="string"||!value.trim()||value.length>MAX_FIELD[i]||
     NO_PRIVATE.test(value))return null;
   fields[field]=value;
 }
 const encoded=JSON.stringify(fields);
 return encoded.length<=2200?encoded:null;
}
export async function handleAskPublicModelCache(request,env,now=Date.now()){
 if(!env?.DB?.prepare)return reply({ok:false,error:"CACHE_DATABASE_UNAVAILABLE"},503);
 const method=request.method;
 const url=new URL(request.url);
 const cacheKey=method==="GET"?url.searchParams.get("key"):null;
 const epoch=Math.floor(now/1000);
 if(method==="GET"){
   if(!KEY.test(cacheKey??"")||[...url.searchParams.keys()].some(k=>k!=="key"))
     return reply({ok:false,error:"INVALID_KEY"},400);
   try{
     const hit=await env.DB.prepare(
       "SELECT response_json FROM ask_public_model_cache WHERE cache_key=? AND expires_at>?"
     ).bind(cacheKey,epoch).first();
     if(!hit)return reply({ok:true,hit:false});
     const fields=JSON.parse(hit.response_json);
     if(!boundedCacheFields(fields))return reply({ok:true,hit:false});
     return reply({ok:true,hit:true,fields});
   }catch{return reply({ok:false,error:"CACHE_READ_UNAVAILABLE"},503);}
 }
 if(method!=="PUT")return reply({ok:false,error:"METHOD_NOT_ALLOWED"},405);
 let body;
 try{
   const length=Number(request.headers.get("content-length")??0);
   if(length>maxBody)return reply({ok:false,error:"OVERSIZE"},413);
   const raw=await request.text();
   if(raw.length>maxBody)return reply({ok:false,error:"OVERSIZE"},413);
   body=JSON.parse(raw);
 }catch{return reply({ok:false,error:"INVALID_JSON"},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||
   Object.keys(body).sort().join("|")!=="expires_at|fields|key")
   return reply({ok:false,error:"INVALID_SHAPE"},400);
 const fields=boundedCacheFields(body.fields);
 if(!KEY.test(body.key??"")||!fields||
   !Number.isInteger(body.expires_at)||
   body.expires_at<epoch+30||body.expires_at>epoch+1800)
   return reply({ok:false,error:"INVALID_ENTRY"},400);
 try{
   // Idempotent: no rewrite of an unexpired cached value. One row write on
   // a new/expired key, preserving the first accepted TTL and minimizing quota.
   const result=await env.DB.prepare(
     "INSERT INTO ask_public_model_cache(cache_key,response_json,created_at,expires_at) "+
     "VALUES(?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET "+
     "response_json=excluded.response_json,created_at=excluded.created_at,"+
     "expires_at=excluded.expires_at WHERE ask_public_model_cache.expires_at<=?"
   ).bind(body.key,fields,epoch,body.expires_at,epoch).run();
   return reply({ok:true,stored:result?.meta?.changes>0});
 }catch{return reply({ok:false,error:"CACHE_WRITE_UNAVAILABLE"},503);}
}
export async function purgeExpiredAskPublicModelCache(env,now=Date.now()){
 if(!env?.DB?.prepare)return {ok:false};
 const cutoff=Math.floor(now/1000);
 try{
   const result=await env.DB.prepare(
     "DELETE FROM ask_public_model_cache WHERE expires_at<=?"
   ).bind(cutoff).run();
   return {ok:true,deleted:Number(result?.meta?.changes??0)};
 }catch{return {ok:false};}
}
