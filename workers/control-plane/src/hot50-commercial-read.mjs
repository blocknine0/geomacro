/**
 * Separate, strictly opt-in Hot 50 commercial read model. Does not replace
 * existing canonical D1 funding, customer keys, grant-scoped usage or PREDGE.
 * There is no public publisher route. An independently B2-readback-verified,
 * qualified signed snapshot must be published by the protected pipeline first.
 */
import {RISK_GATE_HOT50} from './risk-gate-hot50-scope.mjs';
import {
 authorizeCanonicalCustomerPaid,customerPaidKeyDigest,CustomerPaidError
} from './customer-paid-ledger.mjs';

export const HOT50_SIGNED_SCHEMA='geomacro.hot50-commercial-view.v1';
export const HOT50_CATEGORIES=Object.freeze(['geopolitics','macro_financial','trade_minerals_supplychain']);
const HOT50_SET=new Set(RISK_GATE_HOT50);
const KEY_RE=/^Bearer (gmk_live_[a-f0-9]{64}|gm_live_[a-f0-9]{32})$/;
const REQUEST_RE=/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/;
const SHA_RE=/^[a-f0-9]{64}$/;
const VIEW_RE=/^(hot50|country:[A-Z]{3}|category:(geopolitics|macro_financial|trade_minerals_supplychain))$/;
const utf8=new TextEncoder();
const reply=(value,status=200)=>Response.json(value,{status,headers:{
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',
 'Vary':'Authorization','X-Robots-Tag':'noindex,nofollow'
}});
function fault(code,status=503){const err=new Error(code);err.status=status;throw err;}
function bytesOfBase64(value){
 if(typeof value!=='string'||!/^[-A-Za-z0-9+/=]{80,128}$/.test(value))fault('HOT50_SIGNATURE_FORMAT_INVALID');
 try{return Uint8Array.from(atob(value),x=>x.charCodeAt(0));}catch{fault('HOT50_SIGNATURE_FORMAT_INVALID');}
}
async function sha256(bytes){
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function viewOf(path){
 if(path==='/v1/risk/hot50')return 'hot50';
 const country=/^\/v1\/risk\/country\/([a-zA-Z]{2})$/.exec(path);
 if(country){
  const code=country[1].toUpperCase();
  const iso2={
   US:'USA',CN:'CHN',IN:'IND',RU:'RUS',GB:'GBR',DE:'DEU',FR:'FRA',JP:'JPN',
   KR:'KOR',BE:'BEL',CA:'CAN',AU:'AUS',BR:'BRA',MX:'MEX',IT:'ITA',ES:'ESP',
   NL:'NLD',CH:'CHE',NO:'NOR',SE:'SWE',PL:'POL',UA:'UKR',TR:'TUR',SA:'SAU',
   AE:'ARE',IR:'IRN',IL:'ISR',EG:'EGY',QA:'QAT',OM:'OMN',IQ:'IRQ',ZA:'ZAF',
   NG:'NGA',CD:'COD',ZM:'ZMB',CL:'CHL',PE:'PER',AR:'ARG',BO:'BOL',ID:'IDN',
   VN:'VNM',TH:'THA',MY:'MYS',SG:'SGP',PH:'PHL',PK:'PAK',BD:'BGD',KZ:'KAZ',
   MN:'MNG',MM:'MMR',
  }[code];
  return iso2&&HOT50_SET.has(iso2)?'country:'+iso2:null;
 }
 const category=/^\/v1\/risk\/category\/(geopolitics|macro_financial|trade_minerals_supplychain)$/.exec(path);
 return category?'category:'+category[1]:null;
}
function validRating(r){
 return r&&typeof r==='object'&&!Array.isArray(r)&&
  Number.isFinite(r.score)&&r.score>=0&&r.score<=100&&
  Number.isFinite(r.confidence_low)&&Number.isFinite(r.confidence_high)&&
  0<=r.confidence_low&&r.confidence_low<=r.score&&r.score<=r.confidence_high&&r.confidence_high<=100&&
  Number.isFinite(r.confidence)&&r.confidence>=0&&r.confidence<=1&&
  Number.isSafeInteger(r.qualified_evidence_count)&&r.qualified_evidence_count>=1&&
  typeof r.b2_evidence_pointer==='string'&&/^b2:\/\/[a-z0-9_-]+\/[A-Za-z0-9_./-]{1,400}$/.test(r.b2_evidence_pointer)&&
  SHA_RE.test(r.b2_evidence_sha256);
}
function validCountry(item){
 return item&&HOT50_SET.has(item.iso3)&&item.ratings&&
  HOT50_CATEGORIES.every(c=>validRating(item.ratings[c]))&&
  Object.keys(item.ratings).length===3&&
  Number.isFinite(item.composite_score)&&
  Math.abs(item.composite_score-Math.round(
   HOT50_CATEGORIES.reduce((s,c)=>s+item.ratings[c].score,0)/3*100)/100)<0.001;
}
function validDocuments(payload,key){
 const countries=payload.countries;
 if(!Array.isArray(countries)||!countries.every(x=>x&&HOT50_SET.has(x.iso3)))return false;
 if(new Set(countries.map(x=>x.iso3)).size!==countries.length)return false;
 if(key==='hot50')return countries.length===50&&countries.every(validCountry);
 if(key.startsWith('country:')){
  return countries.length===1&&countries[0].iso3===key.slice(8)&&
   validCountry(countries[0])&&Array.isArray(payload.historical_trend)&&
   payload.historical_trend.length>=2&&
   payload.historical_trend.every(x=>typeof x.as_of==='string'&&
     HOT50_CATEGORIES.every(c=>Number.isFinite(x.scores?.[c])&&
     x.scores[c]>=0&&x.scores[c]<=100));
 }
 const category=key.slice(9);
 return countries.length===50&&countries.every(x=>validRating(x.ratings?.[category]))&&
  countries.every((x,i)=>Object.keys(x.ratings).length===1&&x.rank===i+1&&
    (i===0||countries[i-1].ratings[category].score>x.ratings[category].score||
      (countries[i-1].ratings[category].score===x.ratings[category].score&&
       countries[i-1].iso3.localeCompare(x.iso3)<=0)));
}
export async function verifyHot50CommercialSnapshot(row,viewKey,env,now=Date.now()){
 if(!row||!VIEW_RE.test(viewKey)||!SHA_RE.test(row.snapshot_sha256)||
    !SHA_RE.test(row.b2_sha256)||!SHA_RE.test(row.verifier_proof_sha256)||
    row.verifier_state!=='CRYPTO_AND_B2_READBACK_VERIFIED'||
    row.view_key!==viewKey||
    typeof row.signed_json!=='string'||
    utf8.encode(row.signed_json).byteLength>1200000||
    !/^b2:\/\/[a-z0-9_-]+\/[A-Za-z0-9_./-]{1,400}$/.test(row.b2_pointer))
  fault('HOT50_SIGNED_SNAPSHOT_PROOF_INVALID');
 const expectedId=env.GEOMACRO_HOT50_PUBLIC_KEY_ID;
 if(!expectedId||expectedId!==row.public_key_id)
  fault('HOT50_SIGNER_NOT_PINNED');
 const bytes=utf8.encode(row.signed_json);
 if(await sha256(bytes)!==row.snapshot_sha256)fault('HOT50_SNAPSHOT_SHA256_MISMATCH');
 let data,key;
 try{
  data=JSON.parse(row.signed_json);
  const jwk=JSON.parse(env.GEOMACRO_HOT50_PUBLIC_JWK_JSON??'null');
  if(jwk.kty!=='OKP'||jwk.crv!=='Ed25519'||!jwk.x||jwk.d)
   fault('HOT50_VERIFIER_PUBLIC_JWK_INVALID');
  key=await crypto.subtle.importKey('jwk',jwk,{name:'Ed25519'},false,['verify']);
 }catch{fault('HOT50_VERIFIER_PUBLIC_JWK_INVALID');}
 const signature=bytesOfBase64(row.signature_b64);
 if(!await crypto.subtle.verify({name:'Ed25519'},key,signature,bytes))
  fault('HOT50_ED25519_SIGNATURE_INVALID');
 const issued=Date.parse(data.published_at),expires=Date.parse(data.expires_at);
 if(data.schema!==HOT50_SIGNED_SCHEMA||data.view_key!==viewKey||
    data.public_key_id!==expectedId||data.execution_authorized!==false||
    data.evidence_qualification!=='QUALIFIED'||
    data.b2_readback_status!=='VERIFIED'||
    data.b2_pointer!==row.b2_pointer||data.b2_sha256!==row.b2_sha256||
    data.verifier_proof_sha256!==row.verifier_proof_sha256||
    !Number.isFinite(issued)||!Number.isFinite(expires)||
    data.published_at!==row.published_at||data.expires_at!==row.expires_at||
    issued>now+300000||issued>expires||now>=expires||
    !validDocuments(data,viewKey))
  fault('HOT50_SIGNED_CONTENT_UNQUALIFIED_STALE_OR_INCOMPLETE');
 return data;
}
/** Public responses must never cache auth decisions or balances at edge.
 * Signed snapshots can use a shared read cache in the publisher, but EVERY
 * distinct paid delivery still needs a canonical D1 auth/usage transaction.
 * D1 batch reduces round trips, not total provider rows-read/written.
 */
async function cachedSignedSnapshot(db,viewKey,at,env){
 // Only an immutable SHARED signed view is cached; no bearer, tenant,
 // balance, request ID or billable response ever enters the edge cache.
 const edge=typeof caches!=='undefined'?caches.default:null;
 const keyId=String(env.GEOMACRO_HOT50_PUBLIC_KEY_ID??'');
 const cacheKey=new Request('https://geomacro-internal-cache.invalid/v1/hot50/'+
   encodeURIComponent(keyId)+'/'+encodeURIComponent(viewKey));
 if(edge){
  try{
   const hit=await edge.match(cacheKey);
   if(hit){
    const row=await hit.json();
    if(row?.view_key===viewKey&&Date.parse(row.expires_at)>Date.parse(at)&&
       row.verifier_state==='CRYPTO_AND_B2_READBACK_VERIFIED')return row;
   }
  }catch{/* Serve from canonical D1 on cache failure. */}
 }
 const row=await db.prepare(
  "SELECT * FROM commercial_hot50_signed_snapshots WHERE view_key=? AND expires_at>? "+
  "AND verifier_state='CRYPTO_AND_B2_READBACK_VERIFIED' ORDER BY published_at DESC LIMIT 1"
 ).bind(viewKey,at).first();
 if(edge&&row){
  // Respect issuer proof expiry; never cache beyond 5 minutes.
  const ttl=Math.min(300,Math.floor((Date.parse(row.expires_at)-Date.parse(at))/1000));
  if(ttl>0)try{await edge.put(cacheKey,new Response(JSON.stringify(row),{
   headers:{'Cache-Control':'public, max-age='+ttl}
  }));}catch{/* Cache is optional. */}
 }
 return row;
}
export async function handleHot50CommercialRead(request,env,{now=()=>Date.now()}={}){
 const url=new URL(request.url),viewKey=viewOf(url.pathname);
 if(!viewKey)return null;
 if(request.method!=='GET')return reply({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 if(url.search)return reply({ok:false,error:'QUERY_NOT_SUPPORTED'},400);
 if(env.GEOMACRO_HOT50_COMMERCIAL_ACCEPTANCE!=='ACCEPTED_SIGNED_B2_VERIFIED_150_CELLS')
  return reply({ok:false,error:'HOT50_COMMERCIAL_NOT_YET_VERIFIED'},503);
 if(!env.DB?.batch)return reply({ok:false,error:'HOT50_D1_UNAVAILABLE'},503);
 const bearer=request.headers.get('Authorization')?.match(KEY_RE)?.[1];
 if(!bearer)return reply({ok:false,error:'API_KEY_REQUIRED'},401);
 const requestId=request.headers.get('Idempotency-Key');
 if(!REQUEST_RE.test(requestId??''))
  return reply({ok:false,error:'IDEMPOTENCY_KEY_REQUIRED'},400);
 try{
  const at=new Date(now()).toISOString(),db=env.DB;
  const digest=await customerPaidKeyDigest(env,bearer);
  const key=await db.prepare(
   'SELECT k.key_id,k.user_id,k.scopes_json FROM api_keys k JOIN users u ON u.id=k.user_id '+
   'WHERE k.hmac_sha256=? AND k.revoked_at IS NULL AND k.expires_at>? '+
   "AND u.status='active' AND u.email_verified_at IS NOT NULL"
  ).bind(digest,at).first();
  if(!key)return reply({ok:false,error:'API_KEY_INVALID'},401);
  let scopes;
  try{scopes=JSON.parse(key.scopes_json);}catch{fault('HOT50_KEY_SCOPES_CORRUPT');}
  if(!Array.isArray(scopes)||!scopes.includes('risk-gate:read'))
   return reply({ok:false,error:'RISK_GATE_SCOPE_REQUIRED'},403);
  const prior=await db.prepare(
   'SELECT view_key,key_id,snapshot_sha256,credit_cost FROM commercial_hot50_delivery_receipts '+
   'WHERE user_id=? AND request_id=?'
  ).bind(key.user_id,requestId).first();
  if(prior&&(prior.view_key!==viewKey||prior.key_id!==key.key_id||prior.credit_cost!==15))
   return reply({ok:false,error:'REQUEST_REPLAY_MISMATCH'},409);
  const row=prior
   ?await db.prepare('SELECT * FROM commercial_hot50_signed_snapshots WHERE snapshot_sha256=?').bind(prior.snapshot_sha256).first()
   :await cachedSignedSnapshot(db,viewKey,at,env);
  if(!row)return reply({ok:false,error:'QUALIFIED_HOT50_SNAPSHOT_UNAVAILABLE'},503);
  const data=await verifyHot50CommercialSnapshot(row,viewKey,env,now());
  if(!prior){
   // Current canonical tariff is 15 credits for risk_gate_bundle. The
   // existing plan/tier policy remains authoritative (do not silently
   // grant Starter or Pro risk-gate access by changing a route).
   const auth=await authorizeCanonicalCustomerPaid(db,env,bearer,'risk_gate_bundle',at);
   const eventId=crypto.randomUUID();
   try{
    await db.batch([
     db.prepare('INSERT INTO customer_usage_receipts '+
      '(user_id,request_id,event_id,key_id,grant_id,capability,credit_cost,contract_version,occurred_at) '+
      "VALUES(?,?,?,?,?,'risk_gate_bundle',15,?,?)")
      .bind(key.user_id,requestId,eventId,key.key_id,auth.grant_id,auth.contract_version,at),
     db.prepare('INSERT INTO commercial_hot50_delivery_receipts '+
      '(user_id,request_id,key_id,grant_id,view_key,snapshot_sha256,event_id,credit_cost,contract_version,created_at) '+
      'VALUES(?,?,?,?,?,?,?,15,?,?)')
      .bind(key.user_id,requestId,key.key_id,auth.grant_id,viewKey,row.snapshot_sha256,eventId,
        auth.contract_version,at),
    ]);
   }catch{
    // A lost D1 commit ACK is UNKNOWN, never assert rollback or charge again.
    const actual=await db.prepare(
      'SELECT snapshot_sha256,view_key,key_id FROM commercial_hot50_delivery_receipts '+
      'WHERE user_id=? AND request_id=?').bind(key.user_id,requestId).first();
    if(!actual||actual.key_id!==key.key_id||actual.view_key!==viewKey||
       actual.snapshot_sha256!==row.snapshot_sha256)
      return reply({ok:false,error:'SETTLEMENT_OUTCOME_UNKNOWN_RETRY_SAME_ID'},503);
   }
  }
  return reply({ok:true,view:data,
   signature:{algorithm:'Ed25519',public_key_id:row.public_key_id,signature_b64:row.signature_b64,
     signed_payload_sha256:row.snapshot_sha256},
   billing:{request_id:requestId,credit_cost:15,currency:'CREDITS',
     idempotent_replay:!!prior},
   signing_scope:'view',execution_authorized:false});
 }catch(error){
  if(error instanceof CustomerPaidError)
   return reply({ok:false,error:error.code,...(error.status===402?{top_up_url:'https://geomacro.live/pricing'}:{})},error.status);
  const status=error.status===503||error.status===400?error.status:503;
  return reply({ok:false,error:/^HOT50_[A-Z0-9_]+$/.test(error.message)?error.message:'HOT50_DELIVERY_UNAVAILABLE'},status);
 }
}
