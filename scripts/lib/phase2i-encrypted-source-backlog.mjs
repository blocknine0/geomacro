/**
 * Private 72h original-metadata queue for the already admitted Phase2I source
 * sweep. AES-256-GCM over gzip; GitHub Actions artifacts are ciphertext ONLY.
 * This is a best-effort transient queue, NOT canonical D1, verified publisher
 * content, a paid licence, or a guarantee that Free D1 quota can drain 100%.
 */
import {createCipheriv,createDecipheriv,createHmac,randomBytes} from "node:crypto";
import {gzipSync,gunzipSync} from "node:zlib";
export const PHASE2I_BACKLOG_ARTIFACT="geomacro-private-phase2i-72h-ciphertext";
export const PHASE2I_BACKLOG_SCHEMA="geomacro.private-phase2i-source-queue-aead.v1";
const SCOPE="geomacro.phase2i-72h-candidate-queue.aes256gcm.v1";
const TTL=72*3600_000,MAX_CANDIDATES=8000,MAX_PLAIN=8_000_000,MAX_CIPHER=4_500_000;
const HEX=/^[A-Za-z0-9+/]+={0,2}$/u;
const CATS=new Set(["geopolitics","macro","rare_earth"]);
const isTime=t=>typeof t==="string"&&Number.isFinite(Date.parse(t))&&
 Date.parse(t)>0;
function secretKey(root){
 if(typeof root!=="string"||root.length<32||root.length>4096)
  throw Error("PHASE2I_BACKLOG_KEY_REQUIRED");
 return createHmac("sha256",root).update(SCOPE).digest();
}
function candidateOk(c,now){
 if(!c||!CATS.has(c.category)||
   typeof c.title!=="string"||!c.title.trim()||c.title.length>260||
   /[<>]/u.test(c.title)||
   typeof c.sourceId!=="string"||c.sourceId.length<3||c.sourceId.length>110||
   c.credit!==null&&c.credit!==undefined&&
     (typeof c.credit!=="string"||c.credit.length>250)||
   c.issuerContextCountryIso3!==null&&c.issuerContextCountryIso3!==undefined&&
     !/^[A-Z]{3}$/u.test(c.issuerContextCountryIso3)||
   c.sourceUrl!==null&&c.sourceUrl!==undefined&&
     (typeof c.sourceUrl!=="string"||!c.sourceUrl.startsWith("https://"))||
   !isTime(c.publishedAt)||
   (c.d1Acknowledged!==undefined&&typeof c.d1Acknowledged!=="boolean"))return false;
 const age=now-Date.parse(c.publishedAt);
 if(age < -60_000 || age>TTL)return false;
 try{
  const url=new URL(c.articleUrl);
  if(url.protocol!=="https:"||url.username||url.password||url.port||
     url.hash||!url.hostname.includes(".")||url.href.length>1800)return false;
  if(c.sourceUrl!==null&&c.sourceUrl!==undefined){
   const feed=new URL(c.sourceUrl);
   if(feed.protocol!=="https:"||feed.username||feed.password||feed.port||
      !feed.hostname.includes("."))return false;
  }
 }catch{return false;}
 return true;
}
const id=c=>JSON.stringify([c.category,c.articleUrl,c.publishedAt]);
/** Drop old candidates and quarantine inconsistent immutables across runs.
 * A D1 acknowledgement is sealed ONLY after authenticated per-original
 * readback. Re-observation cannot erase it or renew the native clock.
 */
export function mergePrivatePhase2iSourceBacklog(prior,observed,now=Date.now()){
 if(!Number.isFinite(now)||!Array.isArray(prior)||!Array.isArray(observed)||
    prior.length>MAX_CANDIDATES||observed.length>MAX_CANDIDATES)
  throw Error("PHASE2I_BACKLOG_MERGE_INVALID");
 const seen=new Map(),conflicts=new Set();
 let expired_or_invalid=0,duplicate=0;
 for(const c of [...prior,...observed]){
  if(!candidateOk(c,now)){expired_or_invalid++;continue;}
  const key=id(c);
  if(conflicts.has(key)){duplicate++;continue;}
  const previous=seen.get(key);
  if(previous){
   if(previous.title!==c.title){
    seen.delete(key);conflicts.add(key);continue;
   }
   duplicate++;
   const metadataConflict=previous.sourceUrl!==c.sourceUrl||
      previous.issuerContextCountryIso3!==c.issuerContextCountryIso3;
   if(metadataConflict||c.d1Acknowledged===true)
    seen.set(key,{...previous,
      ...(metadataConflict?{sourceUrl:null,issuerContextCountryIso3:null}:{}),
      d1Acknowledged:previous.d1Acknowledged===true||c.d1Acknowledged===true});
  }else seen.set(key,{category:c.category,articleUrl:c.articleUrl,
    publishedAt:c.publishedAt,title:c.title,sourceId:c.sourceId,
    sourceUrl:c.sourceUrl??null,
    issuerContextCountryIso3:c.issuerContextCountryIso3??null,
    credit:c.credit??null,d1Acknowledged:c.d1Acknowledged===true});
 }
 if(seen.size>MAX_CANDIDATES)
  throw Error("PHASE2I_BACKLOG_CAPACITY_NOT_DURABLE");
 return Object.freeze({candidates:[...seen.values()].sort((a,b)=>
   Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||id(a).localeCompare(id(b))),
  available:seen.size,expired_or_invalid,
  duplicate_suppressed:duplicate,immutable_conflicts_quarantined:conflicts.size,
  earliest_native_at:Math.min(...[...seen.values()].map(c=>Date.parse(c.publishedAt)),now),
  rights_verified:false,canonical_d1_proven:false});
}
export function sealPrivatePhase2iSourceBacklog({candidates,root,now=Date.now(),nonce=randomBytes(12)}={}){
 if(!Number.isFinite(now)||!Buffer.isBuffer(nonce)||nonce.length!==12)
  throw Error("PHASE2I_BACKLOG_SEAL_ARGUMENT_INVALID");
 const checked=mergePrivatePhase2iSourceBacklog([],candidates,now);
 const created_at=new Date(now).toISOString();
 const plain=Buffer.from(JSON.stringify({schema:"geomacro.private-phase2i-source-queue-payload.v1",
  created_at,candidates:checked.candidates}),"utf8");
 if(plain.length>MAX_PLAIN)throw Error("PHASE2I_BACKLOG_INPUT_TOO_LARGE");
 const zipped=gzipSync(plain,{level:6}),cipher=createCipheriv("aes-256-gcm",secretKey(root),nonce);
 cipher.setAAD(Buffer.from(SCOPE+"|"+created_at));
 const payload=Buffer.concat([cipher.update(zipped),cipher.final()]);
 if(payload.length>MAX_CIPHER)throw Error("PHASE2I_BACKLOG_CIPHERTEXT_TOO_LARGE");
 return {schema:PHASE2I_BACKLOG_SCHEMA,created_at,algorithm:"aes-256-gcm+gzip",
  nonce:nonce.toString("base64"),tag:cipher.getAuthTag().toString("base64"),
  ciphertext:payload.toString("base64"),unverified_candidates:checked.available,
  canonical_d1_verified:false,commercial_reuse_verified:false};
}
export function unsealPrivatePhase2iSourceBacklog(envelope,root,now=Date.now()){
 if(!envelope||Object.keys(envelope).sort().join(",")!==
     ["schema","created_at","algorithm","nonce","tag","ciphertext",
      "unverified_candidates","canonical_d1_verified","commercial_reuse_verified"].sort().join(",")||
    envelope.schema!==PHASE2I_BACKLOG_SCHEMA||
    envelope.algorithm!=="aes-256-gcm+gzip"||
    envelope.canonical_d1_verified!==false||envelope.commercial_reuse_verified!==false||
    !isTime(envelope.created_at)||!Number.isFinite(now)||
    now-Date.parse(envelope.created_at)<0||
    now-Date.parse(envelope.created_at)>TTL||
    !Number.isSafeInteger(envelope.unverified_candidates)||
    envelope.unverified_candidates<0||envelope.unverified_candidates>MAX_CANDIDATES||
    typeof envelope.nonce!=="string"||!HEX.test(envelope.nonce)||
    Buffer.from(envelope.nonce,"base64").length!==12||
    typeof envelope.tag!=="string"||!HEX.test(envelope.tag)||
    Buffer.from(envelope.tag,"base64").length!==16||
    typeof envelope.ciphertext!=="string"||!HEX.test(envelope.ciphertext)||
    envelope.ciphertext.length>MAX_CIPHER*2)
  throw Error("PHASE2I_BACKLOG_ENVELOPE_INVALID");
 let plain;
 try{
  const decipher=createDecipheriv("aes-256-gcm",secretKey(root),
    Buffer.from(envelope.nonce,"base64"));
  decipher.setAAD(Buffer.from(SCOPE+"|"+envelope.created_at));
  decipher.setAuthTag(Buffer.from(envelope.tag,"base64"));
  const zipped=Buffer.concat([
   decipher.update(Buffer.from(envelope.ciphertext,"base64")),decipher.final()
  ]);
  plain=JSON.parse(gunzipSync(zipped,{maxOutputLength:MAX_PLAIN}).toString("utf8"));
 }catch{throw Error("PHASE2I_BACKLOG_AUTHENTICATION_FAILED");}
 if(plain?.schema!=="geomacro.private-phase2i-source-queue-payload.v1"||
    plain.created_at!==envelope.created_at||
    !Array.isArray(plain.candidates)||
    plain.candidates.length!==envelope.unverified_candidates)
  throw Error("PHASE2I_BACKLOG_CONTENT_INVALID");
 // No clock extension: revalidate each captured original against NOW.
 const result=mergePrivatePhase2iSourceBacklog([],plain.candidates,now);
 return Object.freeze({candidates:result.candidates,
  expired_since_capture:result.expired_or_invalid,
  restored_authentic_originals:result.available,canonical_d1_proven:false});
}
export function selectPrivatePhase2iBacklogArtifact(artifacts,now=Date.now()){
 if(!Array.isArray(artifacts)||artifacts.length>100||!Number.isFinite(now))
  throw Error("PHASE2I_BACKLOG_ARTIFACT_LIST_INVALID");
 return artifacts.filter(a=>a?.name===PHASE2I_BACKLOG_ARTIFACT&&a.expired===false&&
   Number.isSafeInteger(a.id)&&a.id>0&&
   Number.isSafeInteger(a.workflow_run?.id)&&a.workflow_run.id>0&&
   a.workflow_run?.head_branch==="main"&&isTime(a.created_at)&&
   now-Date.parse(a.created_at)>=0&&now-Date.parse(a.created_at)<=TTL)
  .sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]??null;
}
