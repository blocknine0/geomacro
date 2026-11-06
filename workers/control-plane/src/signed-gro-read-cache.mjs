/**
 * Optional, strictly positive, short-lived cache of previously VERIFIED
 * signed GRO database rows. Never cache the final Risk Gate decision, partner
 * usage ledger, progressive facts, flash overrides or reviewer certification.
 * An operator must explicitly accept the <=5s freshness window by enabling
 * GEOMACRO_PREDGE_SIGNED_GRO_READ_CACHE=1. Otherwise every read is D1.
 *
 * KV is optional, private and eventually consistent: it stores only rows that
 * were independently Ed25519-verified at cache insertion. Every cache hit is
 * reverified with CURRENT trust keys and expiry. Timestamp age is <=5s even
 * when KV internally holds the object longer. The isolated KV namespace must
 * never have public routes or shared consumer bindings.
 */
const groups=new WeakMap();
const TTL_MS=5000;
const MAX_JSON=700000;
export async function readCachedSignedGro(env,subject,now,readD1,verify){
 if(typeof readD1!=="function"||typeof verify!=="function")throw Error("GRO_CACHE_INPUT_INVALID");
 if(env?.GEOMACRO_PREDGE_SIGNED_GRO_READ_CACHE!=="1"||
    !env?.DB||typeof env.DB!=="object")
   return verify(await readD1());
 const key="gro-verified-v1:"+subject.type+":"+subject.id;
 let cache=groups.get(env.DB);
 if(!cache){cache=new Map();groups.set(env.DB,cache)}
 const local=cache.get(key);
 if(local&&now>=local.at&&now-local.at<TTL_MS){
  const checked=await verify(local.row);
  if(checked)return checked;
  cache.delete(key);
 }
 const kv=env?.SIGNED_GRO_CACHE_KV;
 if(kv&&typeof kv.get==="function"){
  try{
   const hit=await kv.get(key,"json");
   if(hit&&Number.isSafeInteger(hit.at)&&now>=hit.at&&now-hit.at<TTL_MS&&
      hit.row&&JSON.stringify(hit.row).length<=MAX_JSON){
    const checked=await verify(hit.row);
    if(checked){cache.set(key,hit);return checked}
   }
  }catch{/* KV errors and unsafe data must fall back to primary D1. */}
 }
 const row=await readD1();
 const checked=row?await verify(row):null;
 // Do not negative-cache missing or malformed signed GRO.
 if(!checked)return null;
 const value={at:now,row};
 cache.set(key,value);
 if(cache.size>150)cache.delete(cache.keys().next().value);
 if(kv&&typeof kv.put==="function"){
  try{if(JSON.stringify(value).length<=MAX_JSON)
   await kv.put(key,JSON.stringify(value),{expirationTtl:60});
  }catch{/* KV write is advisory, never a requirement for signed delivery. */}
 }
 return checked;
}
