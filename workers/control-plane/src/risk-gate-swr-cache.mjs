/**
 * Private, per-Worker-isolate SWR of an ALREADY verified immutable daily HMAC
 * snapshot. Never cache bearer tokens, caller policies, audit receipts,
 * signed GRO expiry decisions or payment. No cross-worker speed guarantee.
 */
export const RISK_GATE_SWR_FRESH_MS=20000;
export const RISK_GATE_SWR_STALE_MS=120000;
const caches=new WeakMap();
const MAX_ENTRIES=128;
const snapshotOK=(value,target,day)=>value&&
 value.snapshot?.target_type===target.type&&
 value.snapshot?.target_id===target.id&&
 value.snapshot?.day_utc===day&&
 /^[a-f0-9]{64}$/u.test(value.audit_proof?.content_sha256??"")&&
 /^hmac_sha256:[a-f0-9]{64}$/u.test(value.audit_proof?.signature??"");
export async function readRiskGateSnapshotSWR(db,target,{now=Date.now(),
 read,waitUntil=null}={}){
 if(!db||typeof db!=="object"||!target||
  !["COUNTRY","CORRIDOR"].includes(target.type)||typeof target.id!=="string"||
  !Number.isFinite(now)||typeof read!=="function")
  throw Error("RISK_GATE_SWR_INPUT_INVALID");
 const day=new Date(now).toISOString().slice(0,10);
 let cache=caches.get(db);
 if(!cache){cache=new Map();caches.set(db,cache);}
 const key=target.type+"|"+target.id+"|"+day;
 const old=cache.get(key);
 if(old&&old.validated_at<=now&&snapshotOK(old.value,target,day)){
  const age=now-old.validated_at;
  if(age<=RISK_GATE_SWR_FRESH_MS)
   return {...old.value,swr_cache:"PRIVATE_VERIFIED_HMAC_FRESH"};
  if(age<=RISK_GATE_SWR_STALE_MS&&typeof waitUntil==="function"){
   // Must be attached to the actual Worker context. A background failure
   // never mutates the previously HMAC-checked cache entry.
   const job=Promise.resolve().then(read).then(next=>{
    if(snapshotOK(next,target,day))cache.set(key,{value:next,validated_at:Date.now()});
   }).catch(()=>{});
   waitUntil(job);
   return {...old.value,swr_cache:"PRIVATE_VERIFIED_HMAC_STALE_REVALIDATING"};
  }
 }
 const fresh=await read();
 if(!snapshotOK(fresh,target,day))
  throw Error("RISK_GATE_SWR_PROOF_OR_SUBJECT_INVALID");
 if(cache.size>=MAX_ENTRIES)cache.delete(cache.keys().next().value);
 cache.set(key,{value:fresh,validated_at:now});
 return {...fresh,swr_cache:"PRIVATE_VERIFIED_HMAC_REFRESHED"};
}
