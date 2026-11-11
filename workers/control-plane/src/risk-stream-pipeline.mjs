/**
 * GeoMacro event-driven Risk Gate stream. Private, proof-gated lane.
 * Index-only/GDELT hints are NEVER independent original source evidence.
 * Workers Queues provide durable 10-message/2s pacing; no process timers.
 * All signing claims require independently trusted machine fact/rights keys.
 * Signed stream GROs are internal delivery candidates, NOT certified GRIs
 * and NOT authority to charge a customer or to remove a release hold.
 */
const HEX=/^[a-f0-9]{64}$/u,ISO3=/^[A-Z]{3}$/u,NAME=/^[A-Z][A-Z0-9_]{2,47}$/u;
const SOURCE=/^[a-z0-9][a-z0-9_.:-]{2,119}$/u;
const DOMAIN=/^[a-z0-9.-]{3,253}$/u;
const FEEDS=new Set(["GDELT_INDEX","RSS","WEBSITE_INTELLIGENCE","OFFICIAL_API"]);
const ROLES=new Set(["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL",
 "OFFICIAL_STATISTICS","MARKET_PRICE","TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]);
const POLICIES=Object.freeze({
 GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]
});
const HOURS48=48*3600_000,HOURS72=72*3600_000;
const text=new TextEncoder();
const encode=value=>text.encode(value);
const bytesHex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
const sha=async x=>bytesHex(await crypto.subtle.digest("SHA-256",typeof x==="string"?encode(x):x));
const fail=x=>{throw Error("RISK_STREAM_"+x)};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const exact=(object,keys)=>object&&typeof object==="object"&&!Array.isArray(object)&&
 Object.keys(object).sort().join("|")===keys.slice().sort().join("|");
const b64bytes=value=>{
 if(typeof value!=="string"||value.length>4096||!/^[A-Za-z0-9+/]+={0,2}$/u.test(value))
  fail("SIGNATURE_ENCODING_INVALID");
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 if(btoa(String.fromCharCode(...bytes))!==value)fail("SIGNATURE_ENCODING_INVALID");
 return bytes;
};
const archiveB64bytes=value=>{
 if(typeof value!=="string"||value.length>280000||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))fail("ARCHIVE_BASE64_INVALID");
 return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
};
const archiveB64Encode=bytes=>{
 let result="";
 for(let i=0;i<bytes.length;i+=8192)
  result+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(result);
};
const trustedKey=async value=>{
 const b=b64bytes(value);
 if(b.byteLength!==44)fail("TRUST_KEY_INVALID");
 return crypto.subtle.importKey("spki",b,{name:"Ed25519"},false,["verify"]);
};
const signKey=async value=>{
 const b=b64bytes(value);
 return crypto.subtle.importKey("pkcs8",b,{name:"Ed25519"},false,["sign"]);
};
export const riskStreamOriginalClaims=e=>JSON.stringify({
 schema:"geomacro.risk-stream-original-claims.v1",country_iso3:e.country_iso3,
 category:e.category,feed_origin:e.feed_origin,event_key:e.event_key,
 event_fingerprint:e.event_fingerprint,entities:e.entities,
 source_id:e.source_id,source_url:e.source_url,publisher_root_domain:e.publisher_root_domain,
 parent_media_entity:e.parent_media_entity,source_role:e.source_role,
 published_at:e.published_at,original_page_sha256:e.original_page_sha256,
 derived:e.derived
});
function validateCandidate(e,now){
 if(!e||e.schema!=="geomacro.risk-stream-candidate.v1"||
  !ISO3.test(e.country_iso3??"")||!NAME.test(e.category??"")||
  !FEEDS.has(e.feed_origin)||
  typeof e.event_key!=="string"||
  !/^[A-Z0-9][A-Z0-9:_-]{6,119}$/u.test(e.event_key)||
  !HEX.test(e.event_fingerprint??"")||!SOURCE.test(e.source_id??"")||
  !DOMAIN.test(e.publisher_root_domain??"")||
  typeof e.parent_media_entity!=="string"||e.parent_media_entity.length>100||
  !/^[a-z0-9_.:-]+$/u.test(e.parent_media_entity)||
  !ROLES.has(e.source_role)||!HEX.test(e.original_page_sha256??"")||
  !Array.isArray(e.entities)||e.entities.length<1||e.entities.length>12||
  e.entities.some(x=>typeof x!=="string"||!/^[A-Z0-9:_-]{2,64}$/u.test(x))||
  new Set(e.entities).size!==e.entities.length||
  e.entities.join("|")!==[...e.entities].sort().join("|")||
  !exact(e.derived,["what","why","market","watch"])||
  Object.values(e.derived).some(x=>typeof x!=="string"||x.length<6||x.length>360||
   /https?:\/\/|<[^>]+>|[\r\n]/iu.test(x))||
  typeof e.source_url!=="string"||e.source_url.length>2048)
  fail("CANDIDATE_INVALID");
 let u;try{u=new URL(e.source_url)}catch{fail("SOURCE_URL_INVALID")}
 if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash||
    !(u.hostname===e.publisher_root_domain||u.hostname.endsWith("."+e.publisher_root_domain)))
  fail("SOURCE_HOST_MISMATCH");
 const published=Date.parse(e.published_at);
 if(!Number.isFinite(published)||published>now+60000||now-published>HOURS72)
  fail("ORIGINAL_CLOCK_INVALID");
 if(e.kind!=="INDEX_ONLY"&&e.kind!=="VERIFIED_ORIGINAL")
  fail("CANDIDATE_KIND_INVALID");
 if(e.feed_origin==="GDELT_INDEX"&&e.kind!=="INDEX_ONLY")
  fail("INDEX_ONLY_DISCOVERY_NOT_ORIGINAL");
 if(e.kind==="VERIFIED_ORIGINAL"){
  if(!exact(e.proof,["facts_signature_b64","rights_signature_b64"])||
     typeof e.raw_payload!=="string"||e.raw_payload.length<16||
     e.raw_payload.length>8000||encode(e.raw_payload).byteLength>8000)
   fail("ORIGINAL_PROOF_OR_ARCHIVE_MISSING");
 }else if(e.proof!==null||e.raw_payload!==null)
  fail("INDEX_CANNOT_CLAIM_ORIGINAL");
 return e;
}
async function checkMachineProof(e,env,factsKey,rightsKey){
 if(e.kind==="INDEX_ONLY")return false;
 const claim=encode(riskStreamOriginalClaims(e));
 const facts=await crypto.subtle.verify("Ed25519",factsKey,
  b64bytes(e.proof.facts_signature_b64),
  encode("geomacro.machine-original-facts.v1\n"+new TextDecoder().decode(claim)));
 const rights=await crypto.subtle.verify("Ed25519",rightsKey,
  b64bytes(e.proof.rights_signature_b64),
  encode("geomacro.machine-commercial-rights.v1\n"+new TextDecoder().decode(claim)));
 return facts&&rights;
}
async function boundedD1(action,{tries=4,sleeper=sleep,random=Math.random}={}){
 for(let n=0;n<tries;n++){
  try{return await action()}
  catch(e){
   const transient=/(503|429|D1_ERROR|SQLITE_BUSY|OVERLOADED|TIMEOUT|UNAVAILABLE)/iu.test(String(e?.message??""));
   if(!transient||n===tries-1)throw e;
   await sleeper(Math.min(4000,100*2**n)+Math.floor(random()*80));
  }
 }
 fail("D1_RETRY_EXHAUSTED");
}
function originalSources(group,policy){
 const candidates=[...group].sort((a,b)=>a.published_at.localeCompare(b.published_at));
 for(let i=0;i<candidates.length;i++){
  const a=candidates[i];if(a.original_verified!==1)continue;
  for(let j=i+1;j<candidates.length;j++){
   const b=candidates[j];
   if(Date.parse(b.published_at)-Date.parse(a.published_at)>HOURS48)break;
   if(b.original_verified!==1||a.source_id===b.source_id||
      a.publisher_root_domain===b.publisher_root_domain||
      a.parent_media_entity===b.parent_media_entity||
      !a.entities.some(x=>b.entities.includes(x)))continue;
   if(!policy.every(role=>[a.source_role,b.source_role].includes(role)))continue;
   return [a,b];
  }
 }
 return null;
}
export async function inspectRiskStreamCandidates(items,now=Date.now()){
 if(!Array.isArray(items)||items.length<1||items.length>10)fail("QUEUE_BATCH_INVALID");
 const out=[];for(const item of items){
  const e=validateCandidate(item,now);
  // The fingerprint is a canonical entity+event identity, not merely the
  // headline/GDELT article ID. Attesters sign this identity independently.
  if(await sha(JSON.stringify([e.country_iso3,e.category,e.event_key,e.entities]))!==
     e.event_fingerprint)fail("EVENT_FINGERPRINT_MISMATCH");
  out.push(e);
 }
 return out;
}
async function sourceRegistry(db,items){
 const ids=[...new Set(items.map(x=>x.source_id))];
 const r=await db.prepare("SELECT source_id,publisher_root_domain,parent_media_entity,"+
  "source_role,commercial_rights_approved,enabled,rights_expire_at FROM risk_stream_sources "+
  "WHERE source_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all();
 const rows=r?.results??[];
 if(!Array.isArray(rows)||rows.length!==ids.length)fail("SOURCE_REGISTRY_INCOMPLETE");
 const source=new Map(rows.map(x=>[x.source_id,x]));
 for(const e of items){
  const s=source.get(e.source_id);
  if(!s||s.enabled!==1||s.publisher_root_domain!==e.publisher_root_domain||
     s.parent_media_entity!==e.parent_media_entity||s.source_role!==e.source_role||
     (e.kind==="VERIFIED_ORIGINAL"&&(s.commercial_rights_approved!==1||
       (s.rights_expire_at!==null&&s.rights_expire_at!==undefined&&
        Date.parse(s.rights_expire_at)<=Date.now()))))
   fail("SOURCE_TRUST_OR_RIGHTS_UNVERIFIED");
 }
 return source;
}
async function privateArchiveR2(items,env){
 const originals=items.filter(x=>x.kind==="VERIFIED_ORIGINAL");
 if(!originals.length)return null;
 if(typeof env.RISK_STREAM_AES256_KEY_B64!=="string"||
    !env.RISK_STREAM_PRIVATE_R2?.put||!env.RISK_STREAM_PRIVATE_R2?.get)
  fail("ARCHIVE_BINDING_MISSING");
 const keyBytes=b64bytes(env.RISK_STREAM_AES256_KEY_B64);
 if(keyBytes.length!==32)fail("ARCHIVE_AES_KEY_INVALID");
 const key=await crypto.subtle.importKey("raw",keyBytes,
  {name:"AES-GCM"},false,["encrypt","decrypt"]);
 // No plaintext, original source prose or private object URL in D1/logs.
 const plaintext=encode(JSON.stringify(originals.map(e=>({
  schema:"geomacro.risk-stream-archived-original-proof.v1",
  original_page_sha256:e.original_page_sha256,source_id:e.source_id,
  original_claims:riskStreamOriginalClaims(e),
  fact_attester_signature_b64:e.proof.facts_signature_b64,
  rights_attester_signature_b64:e.proof.rights_signature_b64,
  raw_payload:e.raw_payload
 }))));
 const identity=await sha(plaintext);
 // Keyed HKDF nonce prevents an interrupted retry from overwriting one
 // immutable R2 key with different ciphertext. Same bytes => same nonce;
 // different bytes => distinct unpredictable nonce with SHA-256 security.
 const hkdf=await crypto.subtle.importKey("raw",keyBytes,"HKDF",false,["deriveBits"]);
 const iv=new Uint8Array(await crypto.subtle.deriveBits({
  name:"HKDF",hash:"SHA-256",
  salt:encode("geomacro-risk-stream-archive-iv-v1"),
  info:encode(identity)
 },hkdf,96));
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,plaintext));
 const packed=JSON.stringify({v:1,alg:"AES-256-GCM",iv:archiveB64Encode(iv),
  ciphertext:archiveB64Encode(cipher),sha256:identity});
 const bytes=encode(packed),archiveSha=await sha(bytes);
 const objectKey="risk-stream/private/v1/"+identity.slice(0,2)+"/"+identity+".json";
 await env.RISK_STREAM_PRIVATE_R2.put(objectKey,bytes);
 const remote=await env.RISK_STREAM_PRIVATE_R2.get(objectKey);
 if(!remote)fail("ARCHIVE_R2_READBACK_MISSING");
 const remoteBytes=new Uint8Array(await remote.arrayBuffer());
 if(remoteBytes.byteLength!==bytes.byteLength||await sha(remoteBytes)!==archiveSha)
  fail("ARCHIVE_R2_READBACK_MISMATCH");
 // Verify the independently fetched ciphertext can actually be decrypted.
 const restored=JSON.parse(new TextDecoder().decode(remoteBytes));
 const decrypted=await crypto.subtle.decrypt(
  {name:"AES-GCM",iv:archiveB64bytes(restored.iv)},key,archiveB64bytes(restored.ciphertext));
 if(await sha(decrypted)!==identity)fail("ARCHIVE_DECRYPTED_READBACK_MISMATCH");
 return {objectKey,archiveSha};
}
async function appendCanonical(db,rows,archive,now,options){
 const placeholders=rows.map(()=>"(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
 const values=rows.flatMap(e=>[
  e.observation_id,e.country_iso3,e.category,e.event_fingerprint,
  e.source_id,e.publisher_root_domain,e.parent_media_entity,e.source_role,
  e.published_at,JSON.stringify(e.entities),JSON.stringify(e.derived),
  e.original_page_sha256,e.original_verified?1:0,e.source_url_sha256,
  e.kind==="VERIFIED_ORIGINAL"?archive?.objectKey:null,
  new Date(now).toISOString()
 ]);
 await boundedD1(()=>db.prepare("INSERT OR IGNORE INTO risk_stream_evidence ("+
  "observation_id,country_iso3,category,event_fingerprint,source_id,"+
  "publisher_root_domain,parent_media_entity,source_role,published_at,"+
  "entities_json,derived_json,original_page_sha256,original_verified,"+
  "source_url_sha256,private_r2_object_key,received_at) VALUES "+placeholders)
  .bind(...values).run(),options);
 const r=await boundedD1(()=>db.prepare(
  "SELECT observation_id,original_page_sha256,original_verified FROM risk_stream_evidence "+
  "WHERE observation_id IN (SELECT value FROM json_each(?))")
  .bind(JSON.stringify(rows.map(x=>x.observation_id))).all(),options);
 if(!Array.isArray(r?.results)||r.results.length!==rows.length)
  fail("CANONICAL_READBACK_INCOMPLETE");
 const actual=new Map(r.results.map(x=>[x.observation_id,x]));
 if(rows.some(x=>actual.get(x.observation_id)?.original_page_sha256!==x.original_page_sha256||
    actual.get(x.observation_id)?.original_verified!==(x.original_verified?1:0)))
  fail("CANONICAL_READBACK_DIVERGED");
}
async function loadCorroborated(db,items,now,options){
 const fingerprints=[...new Set(items.map(x=>x.event_fingerprint))];
 const r=await boundedD1(()=>db.prepare(
  "SELECT e.observation_id,e.country_iso3,e.category,e.event_fingerprint,e.source_id,"+
  "e.publisher_root_domain,e.parent_media_entity,e.source_role,e.published_at,e.entities_json,"+
  "e.derived_json,e.original_page_sha256,e.original_verified,e.private_r2_object_key "+
  "FROM risk_stream_evidence e JOIN risk_stream_sources s "+
  "ON s.source_id=e.source_id AND s.enabled=1 AND s.commercial_rights_approved=1 "+
  "AND s.publisher_root_domain=e.publisher_root_domain "+
  "AND s.parent_media_entity=e.parent_media_entity "+
  "AND s.source_role=e.source_role "+
  "AND (s.rights_expire_at IS NULL OR s.rights_expire_at>?) "+
  "WHERE e.event_fingerprint IN (SELECT value FROM json_each(?)) "+
  "AND e.published_at>=? ORDER BY e.event_fingerprint,e.published_at LIMIT 501")
  .bind(new Date(now).toISOString(),JSON.stringify(fingerprints),
    new Date(now-HOURS72).toISOString()).all(),options);
 if(!Array.isArray(r?.results)||r.results.length>500)fail("CORROBORATION_READBACK_LIMIT");
 const grouped=new Map();
 for(const x of r.results){
  let entities,derived;
  try{entities=JSON.parse(x.entities_json);derived=JSON.parse(x.derived_json)}
  catch{fail("CORROBORATION_CANONICAL_JSON_INVALID")}
  const row={...x,entities,derived};
  const k=x.country_iso3+"|"+x.category+"|"+x.event_fingerprint;
  if(!grouped.has(k))grouped.set(k,[]);
  grouped.get(k).push(row);
 }
 return grouped;
}
// Read the EXISTING cached secondary news discovery index in one bounded
// batch query. Its publisher and CLOCK_BASIS metadata remain unverified;
// neither GDELT nor indexed syndicated copies may satisfy the signing quorum.
async function cachedSecondaryHints(db,items,now,options){
 const legacy=Object.freeze({
  GEOPOLITICS:"geopolitics",MACRO_FX:"macro",
  CRITICAL_MINERALS:"rare_earth"
 });
 const eligible=items.filter(x=>Object.hasOwn(legacy,x.category));
 if(!eligible.length)return {same_entity_hints:0,distinct_domains_hint_only:0,
  inspected:0,truncated:false};
 const countries=[...new Set(eligible.map(x=>x.country_iso3))];
 const resp=await boundedD1(()=>db.prepare(
  "SELECT country_iso3,category,event_fingerprint,publisher_domain,"+
  "clock_basis,extracted_entities_json FROM progressive_risk_gate_facts "+
  "WHERE country_iso3 IN (SELECT value FROM json_each(?)) "+
  "AND event_clock>=? AND event_clock<=? "+
  "ORDER BY event_clock DESC LIMIT 121")
  .bind(JSON.stringify(countries),new Date(now-HOURS48).toISOString(),
   new Date(now).toISOString()).all(),options);
 const rows=resp?.results;
 if(!Array.isArray(rows)||rows.length>121)fail("SECONDARY_INDEX_INVALID");
 const matchedDomains=new Set();let hints=0;
 for(const row of rows.slice(0,120)){
  if(!Object.values(legacy).includes(row.category))continue;
  let entities;try{entities=JSON.parse(row.extracted_entities_json)}
  catch{continue}
  if(!Array.isArray(entities))continue;
  for(const item of eligible){
   if(item.country_iso3!==row.country_iso3||
      legacy[item.category]!==row.category||
      !item.entities.some(id=>entities.includes(id)))continue;
   hints++;if(DOMAIN.test(row.publisher_domain??""))
    matchedDomains.add(row.publisher_domain);
   break;
  }
 }
 return {same_entity_hints:hints,
  distinct_domains_hint_only:matchedDomains.size,
  inspected:Math.min(rows.length,120),truncated:rows.length>120};
}
async function categoryPolicies(db,items){
 const keys=[...new Set(items.map(x=>x.category))];
 const q=await db.prepare("SELECT category,required_role_a,required_role_b,enabled "+
  "FROM risk_stream_category_policy WHERE category IN "+
  "(SELECT value FROM json_each(?))").bind(JSON.stringify(keys)).all();
 const policies=new Map();
 for(const row of q?.results??[]){
  if(row.enabled!==1||!ROLES.has(row.required_role_a)||
     !ROLES.has(row.required_role_b)||row.required_role_a===row.required_role_b)
   continue;
  if(POLICIES[row.category]&&
     JSON.stringify([row.required_role_a,row.required_role_b])!==
      JSON.stringify(POLICIES[row.category]))continue;
  policies.set(row.category,[row.required_role_a,row.required_role_b]);
 }
 for(const e of items)if(!policies.has(e.category))fail("CATEGORY_NOT_ACTIVATED");
 return policies;
}
async function signGro(pair,env,now){
 const [a,b]=pair;
 const key=await signKey(env.RISK_STREAM_GRO_SIGN_PKCS8_B64);
 const verifyKey=await trustedKey(env.RISK_STREAM_GRO_VERIFY_SPKI_B64);
 const ids=[a.observation_id,b.observation_id].sort();
 const payload={
  schema:"geomacro.event-stream-gro.v1",subject:{type:"COUNTRY",id:a.country_iso3},
  category:a.category,event_fingerprint:a.event_fingerprint,
  source_originals:ids,
  what_happened:a.derived.what,why_it_matters:a.derived.why,
  market_relevance:a.derived.market,what_to_watch:a.derived.watch,
  evidence_and_confidence:{corroborated_originals:2,
   independent_parent_entities:2,source_rights_and_origins:"DUAL_MACHINE_ATTESTED",
   factual_confidence:"CORROBORATED_ORIGINALS",
   risk_score_not_inferred:true,
   raw_sources_not_republished:true},
  generated_at:new Date(now).toISOString(),expires_at:new Date(now+3*3600000).toISOString(),
  execution_authorized:false,charged:false,
  certified_risk_index:false,customer_delivery_authorized:false
 };
 const canonical=JSON.stringify(payload);
 const signature=new Uint8Array(await crypto.subtle.sign("Ed25519",key,encode(canonical)));
 if(!await crypto.subtle.verify("Ed25519",verifyKey,signature,encode(canonical)))
  fail("SIGNER_PUBLIC_PRIVATE_MISMATCH");
 return {id:await sha(JSON.stringify(ids)),payload,canonical,signature_b64:
  btoa(String.fromCharCode(...signature)),hash:await sha(canonical)};
}
async function persistSignedGro(db,gro,options){
 const at=gro.payload.generated_at;
 const existing=await db.prepare("SELECT payload_json,payload_sha256,signature_b64,expires_at "+
  "FROM risk_stream_signed_gro WHERE gro_id=? LIMIT 1").bind(gro.id).first();
 if(existing){
  // A retry reuses the immutable signed GRO; no duplicate invoice, delivery,
  // state mutation, or a different issued-at timestamp for the same pair.
  let previous;
  try{previous=JSON.parse(existing.payload_json)}catch{fail("SIGNED_GRO_STORED_INVALID")}
  if(await sha(existing.payload_json)!==existing.payload_sha256||
     JSON.stringify(previous.source_originals)!==JSON.stringify(gro.payload.source_originals)||
     previous.event_fingerprint!==gro.payload.event_fingerprint||
     previous.category!==gro.payload.category||
     previous.subject?.id!==gro.payload.subject.id)
   fail("SIGNED_GRO_STORED_INVALID");
  const verifier=await trustedKey(options.verifyKey);
  if(!await crypto.subtle.verify("Ed25519",verifier,
      b64bytes(existing.signature_b64),encode(existing.payload_json)))
   fail("SIGNED_GRO_STORED_SIGNATURE_INVALID");
  return;
 }
 const stmt1=db.prepare("INSERT OR IGNORE INTO risk_stream_signed_gro "+
  "(gro_id,country_iso3,category,event_fingerprint,payload_json,payload_sha256,"+
  "signature_b64,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?)")
  .bind(gro.id,gro.payload.subject.id,gro.payload.category,gro.payload.event_fingerprint,
   gro.canonical,gro.hash,gro.signature_b64,at,gro.payload.expires_at);
 const stmt2=db.prepare("INSERT OR IGNORE INTO risk_stream_delivery_outbox "+
  "(gro_id,state,created_at) VALUES (?,'PENDING',?)").bind(gro.id,at);
 await boundedD1(async()=>{
  const results=await db.batch([stmt1,stmt2]);
  if(!Array.isArray(results)||results.length!==2||results.some(x=>x?.success===false))
   fail("SIGNED_GRO_TRANSACTION_UNVERIFIED");
 },options);
 const read=await db.prepare("SELECT payload_sha256,signature_b64 FROM "+
  "risk_stream_signed_gro WHERE gro_id=? LIMIT 1").bind(gro.id).first();
 if(read?.payload_sha256!==gro.hash||read?.signature_b64!==gro.signature_b64)
  fail("SIGNED_GRO_READBACK_DIVERGED");
}
/**
 * A single Queue delivery (<=10 items) is a single multi-row D1 INSERT.
 * Post-write verification and signing are independent; failures retry the
 * durable queue and idempotent keys, never return a fictitious PASS.
 */
export async function processRiskStreamBatch(env,items,{
 now=Date.now(),sleeper=sleep,random=Math.random
}={}){
 if(env?.RISK_STREAM_ACTIVE!=="1"||env?.STREAM_INGESTION_ENABLED!=="true"||
    !env?.DB?.prepare||!env?.DB?.batch)
  fail("NOT_DEPLOYED_OR_DB_UNAVAILABLE");
 const candidates=await inspectRiskStreamCandidates(items,now);
 await sourceRegistry(env.DB,candidates);
 const policy=await categoryPolicies(env.DB,candidates);
 const factsKey=await trustedKey(env.RISK_STREAM_MACHINE_FACTS_SPKI_B64);
 const rightsKey=await trustedKey(env.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64);
 if(env.RISK_STREAM_MACHINE_FACTS_SPKI_B64===env.RISK_STREAM_MACHINE_RIGHTS_SPKI_B64)
  fail("INDEPENDENT_ATTESTERS_REQUIRED");
 const opts={sleeper,random};
 const secondary=await cachedSecondaryHints(env.DB,candidates,now,opts);
 const rows=[];
 for(const e of candidates){
  const original_verified=await checkMachineProof(e,env,factsKey,rightsKey);
  if(e.kind==="VERIFIED_ORIGINAL"&&
     (!original_verified||await sha(e.raw_payload)!==e.original_page_sha256))
   fail("ORIGINAL_OR_RIGHTS_SIGNATURE_UNVERIFIED");
  rows.push({...e,original_verified,
   source_url_sha256:await sha(e.source_url),
   observation_id:await sha(riskStreamOriginalClaims(e))});
 }
 const distinct=[...new Map(rows.map(r=>[r.observation_id,r])).values()];
 const archive=await privateArchiveR2(distinct,env);
 await appendCanonical(env.DB,distinct,archive,now,opts);
 const grouped=await loadCorroborated(env.DB,distinct,now,opts);
 const signed=[];
 for(const [key,group] of grouped){
  const [country,category]=key.split("|");
  if(!distinct.some(x=>x.country_iso3===country&&x.category===category&&
     key.endsWith("|"+x.event_fingerprint)))continue;
  const pair=originalSources(group,policy.get(category));
  if(!pair)continue;
  const gro=await signGro(pair,env,now);
  await persistSignedGro(env.DB,gro,{...opts,verifyKey:env.RISK_STREAM_GRO_VERIFY_SPKI_B64});
  signed.push(gro.id);
 }
 return {status:"PASS",schema:"geomacro.risk-stream-consumer.v1",
  accepted:distinct.length,index_only:distinct.filter(x=>!x.original_verified).length,
  corroborated_and_signed:[...new Set(signed)].length,
  archived_private_originals:distinct.filter(x=>x.original_verified).length,
  delivery_outbox_durable:true,client_debit_enabled:false,
  secondary_index_same_entity_hint_count:secondary.same_entity_hints,
  secondary_index_publisher_hints_never_certification:true,
  secondary_index_truncated:secondary.truncated,
  country_scope_hardcoded:false};
}
export async function enqueueRiskStreamEvents(env,body,now=Date.now()){
 if(env?.RISK_STREAM_ACTIVE!=="1"||env?.STREAM_INGESTION_ENABLED!=="true"||
    !env?.RISK_STREAM_QUEUE?.sendBatch)
  return Response.json({ok:false,error:"RISK_STREAM_DISABLED"},{status:503});
 if(body?.schema!=="geomacro.risk-stream-ingest-batch.v1"||
    !Array.isArray(body.items)||body.items.length<1||body.items.length>100)
  return Response.json({ok:false,error:"RISK_STREAM_INGEST_INVALID"},{status:400});
 try{
  for(let i=0;i<body.items.length;i+=10)
   await inspectRiskStreamCandidates(body.items.slice(i,i+10),now);
  await env.RISK_STREAM_QUEUE.sendBatch(body.items.map(item=>({body:item,contentType:"json"})));
  return Response.json({ok:true,status:"DURABLY_QUEUED_NOT_YET_VERIFIED",
   accepted:body.items.length,commercial_delivery:false},{status:202});
 }catch(e){return Response.json({ok:false,error:
   String(e.message??"RISK_STREAM_INGEST_UNAVAILABLE").startsWith("RISK_STREAM_")?
    e.message:"RISK_STREAM_QUEUE_UNAVAILABLE"},{status:503})}
}
export async function consumeRiskStreamQueue(batch,env,ctx){
 if(!Array.isArray(batch?.messages)||batch.messages.length<1||
    batch.messages.length>10)fail("QUEUE_MESSAGES_INVALID");
 try{
  const receipt=await processRiskStreamBatch(env,batch.messages.map(x=>x.body));
  for(const m of batch.messages)m.ack();
  // Actual delivery remains a separately authorized outbox consumer;
  // queue processing never grants commercial entitlement or removes HOLD.
  return receipt;
 }catch(error){
  for(const m of batch.messages)m.retry({delaySeconds:Math.min(300,5*2**Math.min(6,m.attempts??0))});
  throw error;
 }
}
