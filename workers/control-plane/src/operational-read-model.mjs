/**
 * Point-lookups only. Never recalculate these answers by COUNT(*) or scans.
 * Stale/missing/unverified models return null; no paid, signed GRO, B2
 * integrity, rights, queue ACK or financial ledger decision uses this cache.
 * The D1 schema is staged separately until 0204/0211 succeed.
 */
const SHA=/^[0-9a-f]{64}$/u;
const KEY=/^[a-z][a-z0-9_]{1,79}$/u;
const SCOPES=new Set(["PUBLIC_DERIVED","INTERNAL_OBSERVABILITY"]);
export const STORAGE_LOCATION_SQL=
 "SELECT provider,symbolic_locator,authority_role,verification_state "+
 "FROM geomacro_storage_locator_v1 WHERE logical_id=? LIMIT 1";
export const OPERATIONAL_MODEL_SQL=
 "SELECT scope,source_revision_sha256,payload_json,updated_at_ms,expires_at_ms "+
 "FROM geomacro_operational_read_model_v1 WHERE model_key=? LIMIT 1";
export async function readStorageLocation(env,logicalId){
 if(!env?.DB?.prepare||!KEY.test(logicalId??""))return null;
 try{
  const row=await env.DB.prepare(STORAGE_LOCATION_SQL).bind(logicalId).first();
  if(!row||!["EXPECTED_NOT_VERIFIED","PROVIDER_VERIFIED"].includes(row.verification_state))
   return null;
  return {logical_id:logicalId,provider:row.provider,
   symbolic_locator:row.symbolic_locator,authority_role:row.authority_role,
   provider_verified:row.verification_state==="PROVIDER_VERIFIED",
   may_route_to_store:row.verification_state==="PROVIDER_VERIFIED"};
 }catch{return null;}
}
export async function readOperationalModel(env,modelKey,{
 scope,expectedRevision,now=Date.now(),maxAgeMs=20*60_000
}={}){
 if(!env?.DB?.prepare||!KEY.test(modelKey??"")||
    !SCOPES.has(scope)||!SHA.test(expectedRevision??"")||
    !Number.isSafeInteger(now)||!Number.isSafeInteger(maxAgeMs)||
    maxAgeMs<1||maxAgeMs>20*60_000)return null;
 try{
  const row=await env.DB.prepare(OPERATIONAL_MODEL_SQL).bind(modelKey).first();
  if(!row||row.scope!==scope||row.source_revision_sha256!==expectedRevision||
     !Number.isSafeInteger(row.updated_at_ms)||!Number.isSafeInteger(row.expires_at_ms)||
     row.updated_at_ms>now||now-row.updated_at_ms>maxAgeMs||
     row.expires_at_ms<now||row.expires_at_ms<row.updated_at_ms||
     typeof row.payload_json!=="string"||row.payload_json.length>100000)return null;
  const payload=JSON.parse(row.payload_json);
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||
     payload.schema!=="geomacro.operational-read-model.v1"||
     payload.scope!==scope||payload.model_key!==modelKey||
     payload.source_revision_sha256!==expectedRevision)return null;
  return {ok:true,model_key:modelKey,scope,source_revision_sha256:expectedRevision,
   as_of_ms:row.updated_at_ms,expires_at_ms:row.expires_at_ms,payload,
   source_authority_preserved:true,certifies_b2_physical_parity:false,
   certifies_signed_gro:false,authorizes_payment:false};
 }catch{return null;}
}
