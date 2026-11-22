/* Governed Evidence Qualification Engine / R2 immutable readback / D1 hot pointers. */
import {normalizeUnqualifiedEvidence,analyzeDeficits,sha256,canonicalJcs,
 signEvidence,verifyEvidence,simhashDistance,DEFICITS} from './evidence-qualification-core.mjs';
import {authorizeCanonicalCustomerEvidenceKey,CustomerPaidError} from './customer-paid-ledger.mjs';
const HEX=/^[a-f0-9]{64}$/u,enc=new TextEncoder();
const H={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const json=(x,status=200)=>Response.json(x,{status,headers:H}),iso=n=>new Date(n).toISOString();
class Failure extends Error{constructor(code,status=503){super(code);this.code=code;this.status=status;}}
const fail=(code,status)=>{throw new Failure(code,status);};
function registry(env){
 let v;try{v=JSON.parse(env.GEOMACRO_EVIDENCE_ORIGINS_JSON??'');}catch{fail('EQE_ORIGIN_REGISTRY_REQUIRED');}
 if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).length>1000)
  fail('EQE_ORIGIN_REGISTRY_INVALID');
 for(const [host,o] of Object.entries(v))
  if(!/^[a-z0-9.-]+\.[a-z]{2,24}$/u.test(host)||
     !/^[a-z][a-z0-9_-]{2,95}$/u.test(o?.organization_id??''))
   fail('EQE_ORIGIN_REGISTRY_INVALID');
 return v;
}
function configured(env){
 if(!env.DB?.prepare||!env.EVIDENCE_PRIVATE_R2?.get||!env.EVIDENCE_PRIVATE_R2?.put)
  fail('EQE_R2_D1_BINDING_MISSING');
 if(!env.GEOMACRO_EVIDENCE_REVIEW_PUBLIC_SPKI_B64||
    !env.GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64)
  fail('EQE_TRUST_REGISTRY_MISSING');
 if(env.GEOMACRO_EVIDENCE_REVIEW_PUBLIC_SPKI_B64===env.GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64)
  fail('EQE_REVIEW_SIGNER_KEY_SEPARATION_REQUIRED');
 return registry(env);
}
async function readbackPut(store,key,text){
 const bytes=enc.encode(text);
 if(bytes.length>131072)fail('EQE_OBJECT_TOO_LARGE',413);
 await store.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
 const back=await store.get(key);
 if(!back)fail('EQE_ARCHIVE_READBACK_MISSING');
 const result=new Uint8Array(await back.arrayBuffer());
 if(result.length!==bytes.length||await sha256(result)!==await sha256(bytes))
  fail('EQE_ARCHIVE_READBACK_HASH_MISMATCH');
 return {bytes:result,sha:await sha256(result),length:result.length};
}
async function readbackGet(store,key,hash,length){
 const o=await store.get(key);
 if(!o)fail('EQE_ARCHIVE_READ_UNAVAILABLE');
 const bytes=new Uint8Array(await o.arrayBuffer());
 if(bytes.length!==length||await sha256(bytes)!==hash)
  fail('EQE_ARCHIVE_READBACK_HASH_MISMATCH');
 return bytes;
}
async function bodyOf(req,limit=65536){
 if(req.method!=='POST')fail('EQE_POST_REQUIRED',405);
 if(!(req.headers.get('content-type')??'').toLowerCase().startsWith('application/json'))
  fail('EQE_JSON_REQUIRED',415);
 if(Number(req.headers.get('content-length')??0)>limit)fail('EQE_BODY_TOO_LARGE',413);
 const bytes=await req.arrayBuffer();if(bytes.byteLength>limit)fail('EQE_BODY_TOO_LARGE',413);
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{fail('EQE_BODY_INVALID',400);}
 if(!value||Array.isArray(value)||typeof value!=='object')fail('EQE_BODY_INVALID',400);
 return value;
}
async function serviceAuth(req,env){
 const token=env.GEOMACRO_EVIDENCE_PRODUCER_TOKEN;
 if(typeof token!=='string'||token.length<48||
    [env.CONTROL_PLANE_TOKEN,env.GEOMACRO_CUSTOMER_SSR_TOKEN].includes(token))
  fail('EQE_PRODUCER_TOKEN_NOT_ISOLATED');
 const input=req.headers.get('authorization')??'';
 if(!input.startsWith('Bearer ')||input.length>256)fail('EQE_PRODUCER_DENIED',401);
 const a=enc.encode(input.slice(7)),b=enc.encode(token);
 const [da,db]=await Promise.all([crypto.subtle.digest('SHA-256',a),crypto.subtle.digest('SHA-256',b)]);
 const x=new Uint8Array(da),y=new Uint8Array(db);
 let diff=a.length===b.length?0:1;for(let i=0;i<32;i++)diff|=x[i]^y[i];
 if(diff)fail('EQE_PRODUCER_DENIED',401);
}
async function pending(env,id){
 if(!HEX.test(id))fail('EQE_ITEM_ID_INVALID',400);
 const r=await env.DB.prepare('SELECT * FROM eqe_pending WHERE item_id=?').bind(id).first();
 if(!r)return null;
 const obj=await env.EVIDENCE_PRIVATE_R2.get(r.r2_private_key);
 if(!obj)fail('EQE_PENDING_PRIVATE_OBJECT_MISSING');
 const data=new Uint8Array(await obj.arrayBuffer());
 if(data.length>65536)fail('EQE_PENDING_CORRUPT');
 let saved;try{saved=JSON.parse(new TextDecoder().decode(data));}catch{fail('EQE_PENDING_CORRUPT');}
 if(saved?.item?.id!==id)fail('EQE_PENDING_ID_MISMATCH');
 return {row:r,saved};
}
async function defer(env,id,codes,attempts=0){
 if(!Array.isArray(codes)||!codes.length)fail('EQE_DEFICIT_REQUIRED');
 const until=iso(Date.now()+Math.min(3600000,60000*2**Math.min(8,attempts)));
 const result=await env.DB.prepare("UPDATE eqe_pending SET status='QUARANTINED',deficit_codes=?,next_retry_at=?,attempts=MIN(20,attempts+1),updated_at=? WHERE item_id=?")
  .bind(codes.join(','),until,iso(Date.now()),id).run();
 if(result.meta?.changes!==1)fail('EQE_DEFICIT_STATE_NOT_COMMITTED');
}
export async function ingestEvidence(env,raw){
 configured(env);
 const item=await normalizeUnqualifiedEvidence(raw);
 if(await env.DB.prepare('SELECT item_id FROM eqe_qualified WHERE item_id=?').bind(item.id).first())
  return {state:'QUALIFIED_ALREADY',item_id:item.id};
 const old=await env.DB.prepare('SELECT item_id FROM eqe_pending WHERE item_id=?')
  .bind(item.id).first();
 if(!old){
  const key='evidence/pending/v1/'+item.id+'.json';
  await readbackPut(env.EVIDENCE_PRIVATE_R2,key,canonicalJcs({item,observation:null}));
  const now=iso(Date.now());
  await env.DB.prepare("INSERT OR IGNORE INTO eqe_pending(item_id,r2_private_key,status,deficit_codes,next_retry_at,updated_at) VALUES(?,?,'QUARANTINED',?,?,?)")
   .bind(item.id,key,DEFICITS.REVIEW,now,now).run();
  const row=await env.DB.prepare('SELECT r2_private_key FROM eqe_pending WHERE item_id=?')
   .bind(item.id).first();
  if(row?.r2_private_key!==key)fail('EQE_PENDING_POINTER_NOT_VERIFIED');
 }
 return {state:'QUARANTINED',item_id:item.id,deficits:[DEFICITS.REVIEW]};
}
function allowedOrigin(raw,approved){
 try{const u=new URL(raw);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&!u.hash&&
    u.toString()===raw&&Object.hasOwn(approved,u.hostname);}
 catch{return false;}
}
async function recoveryObservation(item,approved,fetchImpl){
 const url=item.suggested_origin_url??item.article_url;
 if(!allowedOrigin(url,approved))return {state:'ORIGIN_NOT_APPROVED'};
 const r=await fetchImpl(url,{method:'GET',redirect:'manual',
  headers:{Accept:'text/html'},signal:AbortSignal.timeout(8000)});
 if(!r.ok||r.redirected||!(r.headers.get('content-type')??'').startsWith('text/html'))
  return {state:'ORIGIN_FETCH_UNAVAILABLE'};
 if(Number(r.headers.get('content-length')??0)>65536)return {state:'ORIGIN_BODY_TOO_LARGE'};
 const reader=r.body?.getReader();let size=0,parts=[];
 if(reader)while(true){const {done,value}=await reader.read();if(done)break;
   size+=value.length;if(size>65536){await reader.cancel();return {state:'ORIGIN_BODY_TOO_LARGE'};}
   parts.push(value);}
 const body=new TextDecoder().decode(Uint8Array.from(parts.flatMap(p=>Array.from(p))));
 const candidate=body.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished)["'][^>]*content=["']([^"']+)/iu)?.[1]??null;
 return {state:'UNVERIFIED_NATIVE_METADATA_CANDIDATE',candidate_published_at:candidate,
  inspected_at:iso(Date.now())};
}
export async function recoverDueEvidence(env,{fetchImpl=fetch,limit=5}={}){
 const approved=configured(env);
 if(!Number.isInteger(limit)||limit<1||limit>5)fail('EQE_RECOVERY_LIMIT',400);
 const due=(await env.DB.prepare("SELECT item_id FROM eqe_pending WHERE status='QUARANTINED' AND next_retry_at<=? ORDER BY next_retry_at,item_id LIMIT ?")
  .bind(iso(Date.now()),limit).all()).results??[];
 const results=[];
 for(const entry of due){
  try{
   const p=await pending(env,entry.item_id);
   const observation=await recoveryObservation(p.saved.item,approved,fetchImpl);
   await readbackPut(env.EVIDENCE_PRIVATE_R2,p.row.r2_private_key,
     canonicalJcs({...p.saved,observation}));
   await defer(env,entry.item_id,[DEFICITS.REVIEW],p.row.attempts);
   results.push({item_id:entry.item_id,state:'QUARANTINED',observation:observation.state});
  }catch{
   try{await defer(env,entry.item_id,['PROOF_RECOVERY_UNAVAILABLE']);}catch{}
   results.push({item_id:entry.item_id,state:'QUARANTINED',observation:'PROOF_RECOVERY_UNAVAILABLE'});
  }
 }
 return {processed:results.length,results};
}
export async function qualifyAndPublishEvidence(env,{item_id,attestation}){
 const approved=configured(env),p=await pending(env,item_id);
 if(!p)fail('EQE_PENDING_NOT_FOUND',404);
 if(!attestation?.proof||!attestation?.signature_base64)
  fail('EQE_SIGNED_REVIEW_REQUIRED',400);
 const gate=await analyzeDeficits(p.saved.item,attestation,{
  reviewerPublicSpkiB64:env.GEOMACRO_EVIDENCE_REVIEW_PUBLIC_SPKI_B64,approvedOrigins:approved,
 });
 if(!gate.qualified){await defer(env,item_id,gate.deficits,p.row.attempts);
  return {state:'QUARANTINED',item_id,deficits:gate.deficits};}
 const now=iso(Date.now()-6*3600000);
 const prior=(await env.DB.prepare('SELECT item_id,simhash,claim_sha256 FROM eqe_qualified WHERE qualified_at>=? ORDER BY qualified_at DESC LIMIT 33')
  .bind(now).all()).results??[];
 if(prior.length>=33){await defer(env,item_id,['DEDUPE_WINDOW_CAPACITY_UNVERIFIED'],p.row.attempts);
  return {state:'QUARANTINED',item_id,deficits:['DEDUPE_WINDOW_CAPACITY_UNVERIFIED']};}
 if(prior.some(r=>r.claim_sha256===attestation.proof.same_event_claim_sha256||
    simhashDistance(r.simhash,p.saved.item.narrative_simhash)<=3)){
  await defer(env,item_id,[DEFICITS.DUPLICATE],p.row.attempts);
  return {state:'QUARANTINED',item_id,deficits:[DEFICITS.DUPLICATE]};}
 if(!env.GEOMACRO_EVIDENCE_ED25519_PRIVATE_PKCS8_B64||
    !env.GEOMACRO_EVIDENCE_ED25519_KEY_ID)fail('EQE_SIGNER_NOT_CONFIGURED');
 const envelope=await signEvidence(p.saved.item,attestation,{
  privatePkcs8B64:env.GEOMACRO_EVIDENCE_ED25519_PRIVATE_PKCS8_B64,
  publicSpkiB64:env.GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64,
  keyId:env.GEOMACRO_EVIDENCE_ED25519_KEY_ID,
  reviewerPublicSpkiB64:env.GEOMACRO_EVIDENCE_REVIEW_PUBLIC_SPKI_B64,
  approvedOrigins:approved,
 });
 const serialized=canonicalJcs(envelope),envelopeHash=await sha256(serialized);
 const key='evidence/v1/'+envelope.integrity.signed_at.slice(0,4)+'/'+
  envelope.integrity.signed_at.slice(5,7)+'/'+envelopeHash+'.json';
 const rec=await readbackPut(env.EVIDENCE_PRIVATE_R2,key,serialized);
 const restored=JSON.parse(new TextDecoder().decode(rec.bytes));
 if(!(await verifyEvidence(restored,{
   [envelope.integrity.key_id]:env.GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64
 })))fail('EQE_ARCHIVE_SIGNATURE_READBACK_FAILED');
 const reviewHash=await sha256(canonicalJcs(attestation.proof)),stamp=iso(Date.now());
 await env.DB.prepare('INSERT OR IGNORE INTO eqe_qualified(item_id,payload_sha256,envelope_sha256,envelope_length,b2_key,signature_ref,signing_key_id,review_sha256,claim_sha256,simhash,qualified_at,expires_at,tags) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(item_id,envelope.integrity.sha256_checksum,envelopeHash,rec.length,key,key+'#integrity',
   envelope.integrity.key_id,reviewHash,attestation.proof.same_event_claim_sha256,
   p.saved.item.narrative_simhash,stamp,envelope.integrity.expires_at,
   canonicalJcs([p.saved.item.country_iso3,p.saved.item.category])).run();
 const hot=await env.DB.prepare('SELECT envelope_sha256,payload_sha256,b2_key FROM eqe_qualified WHERE item_id=?')
  .bind(item_id).first();
 if(hot?.envelope_sha256!==envelopeHash||hot?.payload_sha256!==envelope.integrity.sha256_checksum||
    hot?.b2_key!==key)fail('EQE_HOT_POINTER_READBACK_FAILED');
 await env.DB.prepare('DELETE FROM eqe_pending WHERE item_id=?').bind(item_id).run();
 return {state:'QUALIFIED',item_id,envelope_sha256:envelopeHash,b2_key:key,
  signature_verified:true,archive_byte_readback_verified:true};
}
async function verifiedHot(env,itemId){
 if(!HEX.test(itemId))fail('EQE_ITEM_ID_INVALID',400);
 const hot=await env.DB.prepare('SELECT * FROM eqe_qualified WHERE item_id=? AND expires_at>?')
  .bind(itemId,iso(Date.now())).first();
 if(!hot)fail('EQE_QUALIFIED_ITEM_NOT_AVAILABLE',404);
 const bytes=await readbackGet(env.EVIDENCE_PRIVATE_R2,hot.b2_key,hot.envelope_sha256,hot.envelope_length);
 let envelope;try{envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch{fail('EQE_SIGNED_ENVELOPE_INVALID');}
 if(envelope.payload?.item?.id!==itemId||envelope.integrity?.sha256_checksum!==hot.payload_sha256||
    envelope.integrity?.key_id!==hot.signing_key_id||
    !(await verifyEvidence(envelope,{
      [hot.signing_key_id]:env.GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64
    })))fail('EQE_SIGNATURE_OR_HASH_READBACK_FAILED');
 const gate=await analyzeDeficits(envelope.payload.item,{
  proof:envelope.payload.review,signature_base64:envelope.payload.review_signature_base64
 },{reviewerPublicSpkiB64:env.GEOMACRO_EVIDENCE_REVIEW_PUBLIC_SPKI_B64,
    approvedOrigins:registry(env)});
 if(!gate.qualified)fail('EQE_DELIVERY_REVIEW_NO_LONGER_QUALIFIED');
 return {hot,envelope};
}
export async function deliverVerifiedEvidence(env,{apiKey,itemId,now=Date.now()}){
 configured(env);
 if(env.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE!=='ACCEPTED_CANONICAL_D1_PAID_RUNTIME'||
    env.GEOMACRO_EVIDENCE_PAID_DELIVERY_ACCEPTANCE!=='ACCEPTED_VERIFIED_EQE_DELIVERY')
  fail('EQE_PAID_DELIVERY_NOT_ACCEPTED');
 const capability=env.GEOMACRO_EVIDENCE_DELIVERY_CAPABILITY;
 if(!['intelligence_query','signed_risk_object'].includes(capability))
  fail('EQE_CANONICAL_PRICE_MAPPING_REQUIRED');
 const seconds=Number(env.GEOMACRO_EVIDENCE_DELIVERY_WINDOW_SECONDS);
 if(!Number.isSafeInteger(seconds)||seconds<60||seconds>10800)
  fail('EQE_CONTRACT_WINDOW_REQUIRED');
 const customer=await authorizeCanonicalCustomerEvidenceKey(env.DB,env,apiKey,capability,iso(now));
 const {hot,envelope}=await verifiedHot(env,itemId);
 const window='window-'+String(Math.floor(now/(seconds*1000))).padStart(12,'0');
 const idem=await sha256(customer.principal_id+'\0'+itemId+'\0'+window);
 const requestId='eqe-'+idem;
 const bytes=canonicalJcs({schema:'geomacro.evidence-delivery.v1',
  item_id:itemId,delivery_window:window,evidence:envelope});
 const responseHash=await sha256(bytes);
 const lookup=()=>env.DB.prepare('SELECT item_id,envelope_sha256,response_sha256,key_id,grant_id,capability,credit_cost FROM eqe_delivery_receipts WHERE user_id=? AND idempotency_key=?')
  .bind(customer.principal_id,idem).first();
 let rec=await lookup(),replay=Boolean(rec);
 if(!rec){
  const grant=customer.grants.find(g=>Number(g.remaining)>=customer.credit_cost);
  if(!grant)fail('EQE_INSUFFICIENT_CREDITS',402);
  try{await env.DB.prepare('INSERT INTO eqe_delivery_receipts(user_id,item_id,delivery_window,idempotency_key,request_id,response_sha256,envelope_sha256,key_id,grant_id,capability,credit_cost,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(customer.principal_id,itemId,window,idem,requestId,responseHash,hot.envelope_sha256,
      customer.key_id,grant.grant_id,capability,customer.credit_cost,iso(now)).run();}
  catch{rec=await lookup();if(!rec)fail('EQE_LEDGER_ATOMIC_INSERT_DENIED');replay=true;}
  rec??=await lookup();
 }
 if(!rec||rec.item_id!==itemId||rec.envelope_sha256!==hot.envelope_sha256||
    rec.response_sha256!==responseHash||
    rec.capability!==capability||rec.credit_cost!==customer.credit_cost||
    !customer.grants.some(g=>g.grant_id===rec.grant_id))
  fail('EQE_IDEMPOTENT_REPLAY_MISMATCH',409);
 const debit=await env.DB.prepare('SELECT event_id FROM customer_usage_receipts WHERE user_id=? AND request_id=? AND key_id=? AND capability=?')
  .bind(customer.principal_id,requestId,rec.key_id,capability).first();
 if(!debit)fail('EQE_CANONICAL_DEBIT_READBACK_MISSING');
 return new Response(bytes,{headers:{...H,'Content-Type':'application/json',
  'X-GeoMacro-Ed25519-Key-Id':hot.signing_key_id,
  'X-GeoMacro-Payload-SHA256':hot.payload_sha256,
  'X-GeoMacro-Envelope-SHA256':hot.envelope_sha256,
  'X-GeoMacro-Idempotent-Replay':replay?'true':'false',
  'X-GeoMacro-Credits-Charged':replay?'0':String(customer.credit_cost)}});
}
export async function handleEvidenceRuntime(request,env){
 try{
  const path=new URL(request.url);if(path.search)fail('EQE_QUERY_FORBIDDEN',400);
  if(path.pathname==='/v1/evidence/keys'){
   if(request.method!=='GET')fail('EQE_KEYS_GET_REQUIRED',405);
   if(!/^[A-Za-z0-9_.:-]{3,128}$/u.test(env.GEOMACRO_EVIDENCE_ED25519_KEY_ID??'')||
      typeof env.GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64!=='string')
    fail('EQE_ACTIVE_PUBLIC_KEY_UNAVAILABLE');
   return json({schema:'geomacro.evidence-verification-keys.v1',
    canonicalization:'RFC8785-JCS',algorithm:'Ed25519',
    keys:[{key_id:env.GEOMACRO_EVIDENCE_ED25519_KEY_ID,
      public_key_spki_b64:env.GEOMACRO_EVIDENCE_ED25519_PUBLIC_SPKI_B64,status:'active'}]});
  }
  if(path.pathname==='/v1/evidence/deliver'){
   const data=await bodyOf(request,2048);
   if(Object.keys(data).join(',')!=='item_id')fail('EQE_DELIVERY_BODY_INVALID',400);
   const a=request.headers.get('authorization')??'';
   if(!a.startsWith('Bearer ')||a.length>256)fail('EQE_API_KEY_REQUIRED',401);
   return await deliverVerifiedEvidence(env,{apiKey:a.slice(7),itemId:data.item_id});
  }
  await serviceAuth(request,env);
  const data=await bodyOf(request);
  if(path.pathname==='/v1/internal/evidence/ingest')return json(await ingestEvidence(env,data));
  if(path.pathname==='/v1/internal/evidence/qualify'){
   if(Object.keys(data).sort().join(',')!=='attestation,item_id')
    fail('EQE_QUALIFY_BODY_INVALID',400);
   return json(await qualifyAndPublishEvidence(env,data));}
  if(path.pathname==='/v1/internal/evidence/recover'){
   if(Object.keys(data).length)fail('EQE_RECOVER_BODY_INVALID',400);
   return json(await recoverDueEvidence(env));}
  fail('EQE_NOT_FOUND',404);
 }catch(e){
  if(e instanceof Failure||e instanceof CustomerPaidError)
   return json({ok:false,code:e.code},e.status);
  return json({ok:false,code:'EQE_UNVERIFIED_OR_UNAVAILABLE'},503);
 }
}
