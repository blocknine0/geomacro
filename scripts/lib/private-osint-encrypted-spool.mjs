/**
 * AES-GCM sealed, short-lived GitHub Actions holding area ONLY when account-wide
 * D1 admission is HELD. GitHub artifact bytes may be publicly retrievable:
 * persist ciphertext, never native feed titles, raw URLs, provider keys or
 * unencrypted source observations. D1 remains the canonical ingest database.
 */
import {createCipheriv,createDecipheriv,createHmac,randomBytes} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
import {validateReusableSourceNewsItem} from "../../workers/control-plane/src/reusable-source-news.mjs";
import {buildPrivateSourceSharedReadManifest,assertPrivateSourceSharedReadManifest} from "./private-osint-shared-read-contract.mjs";

export const OSINT_SPOOL_ENVELOPE="geomacro.encrypted-private-osint-held-spool.v1";
export const OSINT_SPOOL_ARTIFACT_NAME="geomacro-encrypted-private-osint-held";
const SCOPE="geomacro.osint-held-spool.aes256gcm.v1";
const MAX_ITEMS=768,MAX_INPUT_BYTES=2_400_000,MAX_OUTPUT_BYTES=3_500_000;
const MAX_AGE_MS=25*3600000;
const validTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))&&
 new Date(x).toISOString()===x;
const key=root=>{
 if(typeof root!=="string"||root.length<32||root.length>4096)
  throw Error("OSINT_SPOOL_CREDENTIAL_UNAVAILABLE");
 return createHmac("sha256",root).update(SCOPE).digest();
};
function acceptedItems(items,now){
 if(!Array.isArray(items)||items.length>MAX_ITEMS)throw Error("OSINT_SPOOL_ITEM_LIMIT");
 const ids=new Set();
 for(const item of items){
  validateReusableSourceNewsItem(item,now);
  if(ids.has(item.id))throw Error("OSINT_SPOOL_DUPLICATE_NEWS_ID");
  ids.add(item.id);
 }
 return items;
}
/**
 * Triage collector output BEFORE attempting to seal. Native-source dates can
 * cross the 25h eligibility boundary while 511 feeds are being fetched, and
 * one bad publisher must not cancel all other eligible country observations.
 * Never change a timestamp, rights flag, country or verification claim.
 * Invalid/duplicate items are counted, never serialized or logged.
 */
export function selectEligiblePrivateOsintSpoolItems(items,now=Date.now()){
 if(!Array.isArray(items)||items.length>MAX_ITEMS||!Number.isFinite(now))
  throw Error("OSINT_SPOOL_SOURCE_BATCH_INVALID");
 const eligible=[],seen=new Set();
 let invalid=0,duplicates=0;
 for(const item of items){
  try{
   validateReusableSourceNewsItem(item,now);
   if(seen.has(item.id)){duplicates++;continue}
   seen.add(item.id);
   eligible.push(item);
  }catch{invalid++}
 }
 return Object.freeze({items:eligible,invalid,duplicates,
  examined:items.length,source_clock_cannot_be_extended:true,
  original_verification_not_granted:true});
}
export function sealPrivateOsintSpool({items,root,now=Date.now(),nonce=randomBytes(12)}){
 if(!Number.isFinite(now)||!Buffer.isBuffer(nonce)||nonce.byteLength!==12)
  throw Error("OSINT_SPOOL_CLOCK_OR_NONCE_INVALID");
 const checked=acceptedItems(items,now);
 if(!checked.length)return null;
 const created_at=new Date(now).toISOString();
 const plain=Buffer.from(JSON.stringify({schema:"geomacro.private-osint-spool-payload.v1",
  created_at,items:checked,
  shared_source_read:buildPrivateSourceSharedReadManifest(checked,now)}));
 if(plain.byteLength>MAX_INPUT_BYTES)throw Error("OSINT_SPOOL_INPUT_TOO_LARGE");
 const zipped=gzipSync(plain,{level:6});
 const cipher=createCipheriv("aes-256-gcm",key(root),nonce);
 cipher.setAAD(Buffer.from(SCOPE+"|"+created_at));
 const ciphertext=Buffer.concat([cipher.update(zipped),cipher.final()]);
 return Object.freeze({schema:OSINT_SPOOL_ENVELOPE,created_at,
  algorithm:"aes-256-gcm+gzip",nonce:nonce.toString("base64"),
  ciphertext:ciphertext.toString("base64"),
  tag:cipher.getAuthTag().toString("base64"),
  unverified_observation_count:checked.length,
  canonical_d1_write_verified:false,rights_authorized:false});
}
export function unsealPrivateOsintSpool(envelope,root,now=Date.now()){
 if(!envelope||typeof envelope!=="object"||Array.isArray(envelope)||
   Object.keys(envelope).sort().join(",")!==
     ["algorithm","canonical_d1_write_verified","ciphertext","created_at",
      "nonce","rights_authorized","schema","tag","unverified_observation_count"].sort().join(",")||
   envelope.schema!==OSINT_SPOOL_ENVELOPE||envelope.algorithm!=="aes-256-gcm+gzip"||
   envelope.canonical_d1_write_verified!==false||envelope.rights_authorized!==false||
   !validTime(envelope.created_at)||!Number.isFinite(now)||
   !Number.isSafeInteger(envelope.unverified_observation_count)||
   envelope.unverified_observation_count<1||
   envelope.unverified_observation_count>MAX_ITEMS||
   typeof envelope.ciphertext!=="string"||
   envelope.ciphertext.length>MAX_OUTPUT_BYTES||
   typeof envelope.nonce!=="string"||!/^[A-Za-z0-9+/]{16}$/u.test(envelope.nonce)||
   typeof envelope.tag!=="string"||!/^[A-Za-z0-9+/]{22}==$/u.test(envelope.tag))
  throw Error("OSINT_SPOOL_ENVELOPE_INVALID");
 const age=now-Date.parse(envelope.created_at);
 if(age<0||age>MAX_AGE_MS)throw Error("OSINT_SPOOL_EXPIRED");
 let doc;
 try{
  const decipher=createDecipheriv("aes-256-gcm",key(root),
    Buffer.from(envelope.nonce,"base64"));
  decipher.setAAD(Buffer.from(SCOPE+"|"+envelope.created_at));
  decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
  const zipped=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,"base64")),
    decipher.final()]);
  doc=JSON.parse(gunzipSync(zipped,{maxOutputLength:MAX_INPUT_BYTES}).toString("utf8"));
 }catch{throw Error("OSINT_SPOOL_AUTHENTICATION_FAILED")}
 if(doc?.schema!=="geomacro.private-osint-spool-payload.v1"||
    doc.created_at!==envelope.created_at||
    !Array.isArray(doc.items)||doc.items.length!==envelope.unverified_observation_count)
  throw Error("OSINT_SPOOL_PROTECTED_CONTENT_INVALID");
 // Legacy pre-manifest v1 ciphertext remains decryptable. Newly staged
 // ciphertext verifies SAME fact bytes and categories under the captured
 // native clock before any expiry filtering or D1 replay.
 if(doc.shared_source_read!==undefined)
  assertPrivateSourceSharedReadManifest(doc.items,doc.shared_source_read,
    Date.parse(doc.created_at));
 // Reapply the same strict 25-hour native publisher clock on replay. Native
 // source items that expired since sealed collection must never be extended.
 const fresh=doc.items.filter(item=>{
  const t=Date.parse(item?.source?.original_published_at??"");
  return Number.isFinite(t)&&t<=now&&now-t<=MAX_AGE_MS;
 });
 acceptedItems(fresh,now);
 return Object.freeze({items:fresh,expired:doc.items.length-fresh.length,
  original_count:doc.items.length,created_at:doc.created_at,
  shared_source_read:buildPrivateSourceSharedReadManifest(fresh,now),
  original_shared_source_read:doc.shared_source_read??
    buildPrivateSourceSharedReadManifest(doc.items,Date.parse(doc.created_at)),
  verified_d1:false});
}
export function selectPrivateOsintSpoolArtifacts(artifacts,now=Date.now(),limit=1){
 if(!Array.isArray(artifacts)||artifacts.length>300||
    !Number.isFinite(now)||!Number.isSafeInteger(limit)||limit<1||limit>2)
  throw Error("OSINT_SPOOL_ARTIFACT_LIST_INVALID");
 return artifacts.filter(x=>x&&x.name===OSINT_SPOOL_ARTIFACT_NAME&&
  Number.isSafeInteger(x.id)&&x.id>0&&x.expired===false&&
  Number.isSafeInteger(x.workflow_run?.id)&&x.workflow_run.id>0&&
  x.workflow_run?.head_branch==="main"&&validTime(x.created_at)&&
  Date.parse(x.created_at)<=now&&now-Date.parse(x.created_at)<=MAX_AGE_MS
 ).sort((a,b)=>a.created_at.localeCompare(b.created_at)).slice(0,limit);
}

/**
 * At most two authenticated ciphertext artifacts are replayed per admitted
 * D1 cycle; avoid writing the same news ID twice within an atomic Worker
 * request. Caller MUST unseal and revalidate original timestamps first.
 */
export function planPrivateOsintEncryptedReplay(decoded){
 if(!Array.isArray(decoded)||decoded.length>2||
    decoded.some(b=>!b||!Array.isArray(b.items)||
      !Number.isSafeInteger(b.original_count)||b.original_count<1||
      !Number.isSafeInteger(b.expired)||b.expired<0||
      b.items.length+b.expired!==b.original_count||
      b.verified_d1!==false))
  throw Error("OSINT_SPOOL_REPLAY_PLAN_INVALID");
 const byId=new Map();let originals=0,expired=0;
 for(const batch of decoded){
  originals+=batch.original_count;
  expired+=batch.expired;
  for(const item of batch.items){
   if(!item||typeof item.id!=="string"||!/^[a-f0-9]{64}$/u.test(item.id.slice(5))||
       !item.id.startsWith("news-"))
    throw Error("OSINT_SPOOL_REPLAY_ITEM_INVALID");
   if(!byId.has(item.id))byId.set(item.id,item);
   else if(JSON.stringify(byId.get(item.id))!==JSON.stringify(item))
    throw Error("OSINT_SPOOL_REPLAY_ID_COLLISION");
  }
 }
 return Object.freeze({items:[...byId.values()],originals,expired,
   duplicates_removed:originals-expired-byId.size,
   d1_verified:false,commercially_verified:false});
}
export function canDeletePrivateOsintSpoolArtifacts(receipt,planned){
 if(!planned||!Array.isArray(planned.items))return false;
 if(planned.items.length===0)return planned.expired===planned.originals;
 return receipt?.d1_write_exact_readback_verified===true&&
   receipt?.separate_private_d1_readback_verified===true&&
   receipt?.private_three_category_bundle_readback_verified===true&&
   receipt?.excluded_by_d1_capacity===0&&
   receipt?.news_rows_verified_in_d1===planned.items.length;
}
