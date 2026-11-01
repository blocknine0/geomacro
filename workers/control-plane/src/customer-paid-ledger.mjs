// Canonical customer D1 paid-ledger primitives; no payment/checkout activation.
// All public commerce routes continue to use their existing locked flow until
// individually reviewed and switched; never silently fall back across ledgers.
export const CUSTOMER_CREDIT_CONTRACT='credits-v1.1.0';
export const CUSTOMER_CREDIT_COSTS=Object.freeze({
  intelligence_query:1,gri_read:1,structural_country_digest:3,
  structural_corridor_digest:5,structural_country_profile:8,
  structural_corridor_profile:12,signed_risk_object:10,risk_gate_bundle:15,
});
// GRI retired for new sales; Risk Gate is not public launch eligible.
// Grant policy and evidence readiness are independent: this code does not
// authorize any priced response or bypass product availability checks.
export const CUSTOMER_ENABLED_CAPABILITIES=Object.freeze([
  'intelligence_query','structural_country_digest','structural_corridor_digest',
  'structural_country_profile','structural_corridor_profile','signed_risk_object',
]);
const PERMITTED=Object.freeze({
  starter_dev:['intelligence_query','structural_country_digest','structural_country_profile'],
  pro_analyst:['intelligence_query','structural_country_digest','structural_corridor_digest','structural_country_profile','structural_corridor_profile'],
  business_pilot:CUSTOMER_ENABLED_CAPABILITIES,
});
const tokenPattern=/^gmk_live_[0-9a-f]{64}$/;
const requestPattern=/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,159}$/;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const nowIso=()=>new Date().toISOString();
export class CustomerPaidError extends Error {
  constructor(status,code){super(code);this.status=status;this.code=code;}
}
function fail(status,code){throw new CustomerPaidError(status,code);}
function requirePepper(env){
  const p=String(env?.GEOMACRO_API_CREDENTIAL_PEPPER??'');
  if(p.length<32)fail(503,'CUSTOMER_PAID_CREDENTIAL_PEPPER_REQUIRED');
  return p;
}
/** Exactly mirrors src/lib/api-credential-hash.server.ts commercial-bearer. */
export async function customerPaidKeyDigest(env,key){
  const pepper=requirePepper(env);
  if(typeof key!=='string'||key.length>512||key.length<24)fail(401,'CUSTOMER_PAID_API_KEY_REQUIRED');
  const k=await crypto.subtle.importKey('raw',encoder.encode(pepper),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',k,
    encoder.encode('geomacro-api-credential-v1\0commercial-bearer\0'+key)));
}
function randHex(n){
  const bytes=new Uint8Array(n);crypto.getRandomValues(bytes);return hex(bytes);
}
export function customerPaidCapabilityPolicy(tier,capability){
  return CUSTOMER_ENABLED_CAPABILITIES.includes(capability)&&
    Object.hasOwn(PERMITTED,tier)&&PERMITTED[tier].includes(capability);
}
function scopeFor(capability){
  if(capability==='intelligence_query')return 'intelligence:read';
  if(capability.startsWith('structural_'))return 'structural:read';
  if(capability==='signed_risk_object')return 'signed:read';
  if(capability==='risk_gate_bundle')return 'risk-gate:read';
  return 'gri:read';
}
function validCapability(c){
  if(!Object.hasOwn(CUSTOMER_CREDIT_COSTS,c)||!CUSTOMER_ENABLED_CAPABILITIES.includes(c))
    fail(403,'CUSTOMER_PAID_CAPABILITY_NOT_LIVE');
  return c;
}
function queryGrants(db,userId,now){
  return db.prepare(`SELECT g.grant_id,g.tier,g.contract_version,g.expires_at,
      (SELECT COALESCE(SUM(delta_credits),0) FROM credit_ledger
       WHERE receipt_id=g.receipt_id AND event_type IN ('funding','reversal'))
       - (SELECT COALESCE(SUM(credit_cost),0) FROM customer_usage_receipts
          WHERE grant_id=g.grant_id) AS remaining
    FROM customer_entitlement_grants g
    JOIN customer_payment_receipts p ON p.receipt_id=g.receipt_id
    WHERE g.user_id=? AND p.user_id=? AND g.status='active'
      AND g.contract_version=? AND g.starts_at<=? AND g.expires_at>?
      AND p.verified_at<=?
      AND NOT EXISTS(SELECT 1 FROM credit_ledger l WHERE l.receipt_id=p.receipt_id AND l.event_type='reversal')
    ORDER BY g.expires_at ASC,g.grant_id ASC LIMIT 25`).bind(
      userId,userId,CUSTOMER_CREDIT_CONTRACT,now,now,now).all();
}
async function scopedKey(db,env,raw,now){
  if(!tokenPattern.test(raw))fail(401,'CUSTOMER_PAID_API_KEY_DENIED');
  const digest=await customerPaidKeyDigest(env,raw);
  const key=await db.prepare(`SELECT k.key_id,k.user_id,k.scopes_json,k.expires_at,u.email
    FROM api_keys k JOIN users u ON u.id=k.user_id
    WHERE k.hmac_sha256=? AND k.revoked_at IS NULL AND k.expires_at>?
      AND u.status='active' AND u.email_verified_at IS NOT NULL`).bind(digest,now).first();
  if(!key)fail(401,'CUSTOMER_PAID_API_KEY_DENIED');
  let scopes;try{scopes=JSON.parse(key.scopes_json);}catch{fail(503,'CUSTOMER_PAID_KEY_SCOPE_INVALID');}
  if(!Array.isArray(scopes)||scopes.some(s=>typeof s!=='string'))
    fail(503,'CUSTOMER_PAID_KEY_SCOPE_INVALID');
  return {...key,scopes};
}
async function chooseGrant(db,key,capability,now){
  if(!key.scopes.includes(scopeFor(capability)))
    fail(403,'CUSTOMER_PAID_SCOPE_DENIED');
  const rows=(await queryGrants(db,key.user_id,now)).results??[];
  const eligible=rows.filter(g=>customerPaidCapabilityPolicy(g.tier,capability));
  if(!eligible.length)fail(403,'CUSTOMER_PAID_ACTIVE_GRANT_REQUIRED');
  const grant=eligible.find(g=>Number.isInteger(g.remaining)&&g.remaining>=CUSTOMER_CREDIT_COSTS[capability]);
  if(!grant)fail(402,'CUSTOMER_PAID_INSUFFICIENT_CREDITS');
  return grant;
}
/** Read-only verified grant/account proof; no credits are allocated here. */
export async function authorizeCanonicalCustomerPaid(db,env,apiKey,capability,now=nowIso()){
  capability=validCapability(capability);
  const key=await scopedKey(db,env,apiKey,now);
  const grant=await chooseGrant(db,key,capability,now);
  return {ok:true,principal_id:key.user_id,principal_type:'api_client',
    principal_external_id:'d1:'+key.user_id,key_id:key.key_id,
    scopes:key.scopes,grant_id:grant.grant_id,tier:grant.tier,
    contract_version:grant.contract_version,period_ends_at:grant.expires_at,
    credits_remaining:grant.remaining,credit_cost:CUSTOMER_CREDIT_COSTS[capability]};
}
/** Single-statement mutation. SQLite AFTER INSERT trigger appends debit and
 * fails atomically if any of the grant/active-key/credit checks fails.
 * Never trust client-supplied price, tier, grant, user ID or remaining balance.
 */
export async function consumeCanonicalCustomerPaid(db,env,{apiKey,capability,requestId},now=nowIso()){
  capability=validCapability(capability);
  if(typeof requestId!=='string'||!requestPattern.test(requestId))
    fail(400,'CUSTOMER_PAID_REQUEST_ID_INVALID');
  const key=await scopedKey(db,env,apiKey,now);
  const cost=CUSTOMER_CREDIT_COSTS[capability];
  const prior=await db.prepare(`SELECT capability,credit_cost,contract_version,key_id,grant_id
     FROM customer_usage_receipts WHERE user_id=? AND request_id=?`).bind(key.user_id,requestId).first();
  // Replays require a CURRENT active scoped key and current valid grant; a
  // prior receipt alone is never a reusable authorization after revocation.
  if(prior){
    if(prior.capability!==capability||prior.credit_cost!==cost||
       prior.contract_version!==CUSTOMER_CREDIT_CONTRACT||prior.key_id!==key.key_id)
      fail(409,'CUSTOMER_PAID_REQUEST_REPLAY_MISMATCH');
    if(!key.scopes.includes(scopeFor(capability)))
      fail(403,'CUSTOMER_PAID_SCOPE_DENIED');
    const grants=(await queryGrants(db,key.user_id,now)).results??[];
    if(!grants.some(g=>g.grant_id===prior.grant_id&&
      customerPaidCapabilityPolicy(g.tier,capability)))
      fail(403,'CUSTOMER_PAID_GRANT_REVOKED_OR_EXPIRED');
    return {ok:true,idempotent_replay:true,credit_cost:cost,request_id:requestId};
  }
  const grant=await chooseGrant(db,key,capability,now);
  const eventId=crypto.randomUUID();
  try{
    const inserted=await db.prepare(`INSERT INTO customer_usage_receipts
      (user_id,request_id,event_id,key_id,grant_id,capability,credit_cost,contract_version,occurred_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).bind(key.user_id,requestId,eventId,key.key_id,
       grant.grant_id,capability,cost,CUSTOMER_CREDIT_CONTRACT,now).run();
    if(inserted.meta?.changes!==1)fail(503,'CUSTOMER_PAID_USAGE_NOT_INSERTED');
  }catch(err){
    const after=await db.prepare(`SELECT capability,credit_cost,contract_version,key_id
      FROM customer_usage_receipts WHERE user_id=? AND request_id=?`).bind(key.user_id,requestId).first();
    if(after&&after.capability===capability&&after.credit_cost===cost&&
       after.contract_version===CUSTOMER_CREDIT_CONTRACT&&after.key_id===key.key_id)
      return {ok:true,idempotent_replay:true,credit_cost:cost,request_id:requestId};
    if(after)fail(409,'CUSTOMER_PAID_REQUEST_REPLAY_MISMATCH');
    if(err instanceof CustomerPaidError)throw err;
    fail(403,'CUSTOMER_PAID_USAGE_REJECTED');
  }
  const charged=await db.prepare(`SELECT l.event_id FROM credit_ledger l
     JOIN customer_usage_receipts x ON x.event_id=l.event_id
     WHERE x.user_id=? AND x.request_id=? AND l.event_type='debit'
       AND l.delta_credits=?`).bind(key.user_id,requestId,-cost).first();
  if(!charged)fail(503,'CUSTOMER_PAID_DEBIT_READBACK_UNAVAILABLE');
  return {ok:true,idempotent_replay:false,credit_cost:cost,request_id:requestId};
}
/** Code-ready, NOT wired to production key-create. Existing key-create remains
 * unconditionally off until owner-controlled entitlement parity + live
 * consumption acceptance. Token is returned ONCE; only HMAC is persisted.
 */
export async function mintCanonicalCustomerPaidKey(db,env,userId,now=nowIso()){
  requirePepper(env);
  if(typeof userId!=='string'||userId.length<16)fail(401,'CUSTOMER_PAID_USER_INVALID');
  const user=await db.prepare(`SELECT id FROM users WHERE id=? AND status='active' AND email_verified_at IS NOT NULL`).bind(userId).first();
  if(!user)fail(403,'CUSTOMER_PAID_VERIFIED_USER_REQUIRED');
  const grants=(await queryGrants(db,userId,now)).results??[];
  const grant=grants.find(g=>Object.hasOwn(PERMITTED,g.tier)&&g.remaining>0);
  if(!grant)fail(403,'CUSTOMER_PAID_VERIFIED_FUNDED_GRANT_REQUIRED');
  const scopes=['intelligence:read','structural:read'];
  if(grant.tier==='business_pilot')scopes.push('signed:read','risk-gate:read');
  const key='gmk_live_'+randHex(32),keyId='gmk_live_'+randHex(16);
  const hash=await customerPaidKeyDigest(env,key);
  try{
    await db.prepare(`INSERT INTO api_keys
      (key_id,user_id,hmac_sha256,scopes_json,expires_at,created_at)
      VALUES(?,?,?,?,?,?)`).bind(keyId,userId,hash,JSON.stringify(scopes),grant.expires_at,now).run();
  }catch{fail(403,'CUSTOMER_PAID_KEY_CREATION_DENIED');}
  return {key_id:keyId,api_key:key,reveal_once:true,expires_at:grant.expires_at};
}
