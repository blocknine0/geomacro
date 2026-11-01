import {sendOtpWithProviderFailover} from './customer-email-provider-failover.mjs';
import {authorizeCanonicalCustomerPaid,consumeCanonicalCustomerPaid,mintCanonicalCustomerPaidKey,readCanonicalCustomerPaidAccount,CustomerPaidError} from './customer-paid-ledger.mjs';

export const CUSTOMER_KEY_GATE='CUSTOMER_D1_COMMERCIAL_AUTH_NOT_MIGRATED';
const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
class Failure extends Error { constructor(status,code){super(code);this.status=status;this.code=code;} }
const fail=(status,code)=>{throw new Failure(status,code);};
const reply=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
const iso=n=>new Date(n).toISOString();
const validToken=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const randomHex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
function code(){const a=new Uint32Array(1);do{crypto.getRandomValues(a);}while(a[0]>=4294000000);return String(a[0]%1000000).padStart(6,'0');}
export async function customerHmac(pepper,domain,value){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('geomacro-customer-v1\0'+domain+'\0'+value));
 return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
}
async function equalSecret(a,b){return (await customerHmac(a,'bridge',b))===(await customerHmac(a,'bridge',a));}
export async function boundedCustomerBody(request){
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'CUSTOMER_JSON_REQUIRED');
 if(Number(request.headers.get('content-length')??0)>2048)fail(413,'CUSTOMER_BODY_TOO_LARGE');
 const reader=request.body?.getReader();let size=0;const chunks=[];
 if(reader){while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();fail(413,'CUSTOMER_BODY_TOO_LARGE');}chunks.push(value);}}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'CUSTOMER_JSON_REQUIRED');}
 if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'CUSTOMER_JSON_REQUIRED');return body;
}
function emailOf(body){const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))fail(400,'CUSTOMER_EMAIL_INVALID');return email;}
async function session(db,pepper,token,now){
 if(!validToken(token))fail(401,'CUSTOMER_SESSION_REQUIRED');
 const hash=await customerHmac(pepper,'session',token);
 const row=await db.prepare(`SELECT u.id,u.email,s.id AS session_id FROM sessions s JOIN users u ON u.id=s.user_id
 WHERE s.token_hmac_sha256=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='active' AND u.email_verified_at IS NOT NULL`).bind(hash,now).first();
 if(!row)fail(401,'CUSTOMER_SESSION_INVALID');return row;
}
async function reserve(db,kind,emailHash,ipHash,now){
 const since=iso(Date.parse(now)-900000),id=crypto.randomUUID();
 const query=kind==='send'?`INSERT INTO customer_otp_send_events(event_id,email_hmac_sha256,ip_hmac_sha256,sent_at)
 SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM customer_otp_send_events WHERE email_hmac_sha256=? AND sent_at>?)<3
 AND NOT EXISTS(SELECT 1 FROM customer_otp_send_events WHERE email_hmac_sha256=? AND sent_at>?)
 AND (SELECT COUNT(*) FROM customer_otp_send_events WHERE ip_hmac_sha256=? AND sent_at>?)<10`:
 `INSERT INTO customer_login_verify_events(event_id,email_hmac_sha256,ip_hmac_sha256,attempted_at)
 SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM customer_login_verify_events WHERE email_hmac_sha256=? AND attempted_at>?)<10
 AND (SELECT COUNT(*) FROM customer_login_verify_events WHERE ip_hmac_sha256=? AND attempted_at>?)<30`;
 const args=kind==='send'?[id,emailHash,ipHash,now,emailHash,since,emailHash,iso(Date.parse(now)-60000),ipHash,since]:[id,emailHash,ipHash,now,emailHash,since,ipHash,since];
 const row=await db.prepare(query).bind(...args).run();if(row.meta?.changes!==1)fail(429,'CUSTOMER_RATE_LIMITED');
}
export async function handleCustomerRuntime(request,env,{now=()=>Date.now(),fetchImpl=fetch}={}){
 try{
  const url=new URL(request.url),action=url.pathname.slice('/v1/internal/customer/'.length);
  if(url.search||!['otp-start','otp-verify','session','account','key-create','key-revoke','logout','paid-authorize','paid-debit'].includes(action))fail(404,'CUSTOMER_ROUTE_NOT_FOUND');
  if(request.method!=='POST')fail(405,'CUSTOMER_METHOD_NOT_ALLOWED');
  const token=String(env.GEOMACRO_CUSTOMER_SSR_TOKEN??''),pepper=String(env.GEOMACRO_CUSTOMER_AUTH_PEPPER??'');
  if(token.length<64||pepper.length<64||!env.DB?.batch)fail(503,'CUSTOMER_D1_NOT_CONFIGURED');
  // A dedicated token is mandatory; never accept a browser/general operator token.
  if([env.CONTROL_PLANE_TOKEN,env.GEOMACRO_CONTROL_PLANE_TOKEN,env.GEOMACRO_COMMERCE_LEDGER_TOKEN].some(x=>x&&x===token))fail(503,'CUSTOMER_TOKEN_ISOLATION_REQUIRED');
  const supplied=request.headers.get('authorization')??'';
  if(supplied.length>256||!supplied.startsWith('Bearer ')||!(await equalSecret(token,supplied.slice(7))))fail(401,'CUSTOMER_INTERNAL_AUTH_REQUIRED');
  const origins=String(env.GEOMACRO_CUSTOMER_ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(x=>/^https:\/\/[^/]+$/.test(x));
  if(!origins.includes(request.headers.get('origin')))fail(403,'CUSTOMER_ORIGIN_REQUIRED');
  const body=await boundedCustomerBody(request),at=iso(now()),db=env.DB;
  if(action==='paid-authorize'||action==='paid-debit'){
   // Deliberate acceptance lock: OFF by default, does not enable checkout,
   // funding, key issuance, or any legacy paid API route.
   if(env.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE!=='ACCEPTED_CANONICAL_D1_PAID_RUNTIME')
     fail(503,'CUSTOMER_PAID_RUNTIME_NOT_ACCEPTED');
   const fields=Object.keys(body);
   const allowed=action==='paid-authorize'?['api_key','capability']:
     ['api_key','capability','request_id'];
   if(fields.some(k=>!allowed.includes(k))||
      allowed.some(k=>typeof body[k]!=='string'))
     fail(400,'CUSTOMER_PAID_BODY_INVALID');
   try {
     const result=action==='paid-authorize'
       ?await authorizeCanonicalCustomerPaid(db,env,body.api_key,body.capability,at)
       :await consumeCanonicalCustomerPaid(db,env,{
          apiKey:body.api_key,capability:body.capability,requestId:body.request_id},at);
     return reply(result);
   } catch(error) {
     if(error instanceof CustomerPaidError)fail(error.status,error.code);
     throw error;
   }
  }
  if(action==='otp-start'||action==='otp-verify'){
   const email=emailOf(body),ip=request.headers.get('x-gm-customer-ip');
   // IP is asserted only by the strongly authenticated SSR bridge, never by browser JSON.
   if(!ip||ip.length>64||!/^[0-9a-fA-F:.]+$/.test(ip))fail(503,'CUSTOMER_TRUSTED_IP_REQUIRED');
   const [emailHash,ipHash]=await Promise.all([customerHmac(pepper,'email',email),customerHmac(pepper,'ip',ip)]);
   await reserve(db,action==='otp-start'?'send':'verify',emailHash,ipHash,at);
   if(action==='otp-start'){
    const challengeId=crypto.randomUUID(),otp=code(),hash=await customerHmac(pepper,'otp',challengeId+'\0'+email+'\0'+otp);
    await db.prepare(`INSERT INTO customer_login_challenges(challenge_id,email,otp_hmac_sha256,requested_at,expires_at) VALUES(?,?,?,?,?)`).bind(challengeId,email,hash,at,iso(now()+600000)).run();
    const outcome=await sendOtpWithProviderFailover({db,env,challengeId,email,otp,fetchImpl,now:at});
    const accepted=outcome.ok===true;
    await db.prepare(`UPDATE customer_login_challenges SET delivery_status=? WHERE challenge_id=? AND delivery_status='pending'`).bind(accepted?'accepted':'failed',challengeId).run();
    if(!accepted)fail(503,'CUSTOMER_OTP_DELIVERY_NOT_ACCEPTED');
    return reply({ok:true,code:'CUSTOMER_EMAIL_SENT_IF_ELIGIBLE'});
   }
   if(typeof body.otp!=='string'||!/^[0-9]{6}$/.test(body.otp))fail(400,'CUSTOMER_OTP_INVALID');
   const challenge=await db.prepare(`SELECT challenge_id FROM customer_login_challenges WHERE email=? ORDER BY requested_at DESC,rowid DESC LIMIT 1`).bind(email).first();
   if(!challenge)fail(401,'CUSTOMER_OTP_NOT_VERIFIED');
   const hash=await customerHmac(pepper,'otp',challenge.challenge_id+'\0'+email+'\0'+body.otp);
   const sid=crypto.randomUUID(),uid=crypto.randomUUID(),opaque=randomHex(),sessionHash=await customerHmac(pepper,'session',opaque);
   const expires=iso(now()+3600000);
   // D1 batch is a transaction. Losing concurrent requests cannot insert a user
   // or session: each statement is conditioned on this request's consumed ID.
   await db.batch([
    db.prepare(`UPDATE customer_login_challenges SET attempts=attempts+1,
     consumed_session_id=CASE WHEN otp_hmac_sha256=? THEN ? ELSE NULL END
     WHERE challenge_id=? AND consumed_session_id IS NULL AND attempts<5 AND expires_at>? AND delivery_status='accepted'`).bind(hash,sid,challenge.challenge_id,at),
    db.prepare(`INSERT INTO users(id,email,email_verified_at,created_at,updated_at)
     SELECT ?,email,?,?,? FROM customer_login_challenges WHERE challenge_id=? AND consumed_session_id=?
     ON CONFLICT(email) DO UPDATE SET email_verified_at=excluded.email_verified_at,updated_at=excluded.updated_at WHERE users.status='active'`).bind(uid,at,at,at,challenge.challenge_id,sid),
    db.prepare(`INSERT INTO sessions(id,user_id,token_hmac_sha256,expires_at,created_at,login_challenge_id)
     SELECT ?,u.id,?,?,?,c.challenge_id FROM customer_login_challenges c JOIN users u ON u.email=c.email
     WHERE c.challenge_id=? AND c.consumed_session_id=? AND u.status='active' AND u.email_verified_at IS NOT NULL`).bind(sid,sessionHash,expires,at,challenge.challenge_id,sid),
   ]);
   const created=await db.prepare(`SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.token_hmac_sha256=?`).bind(sid,sessionHash).first();
   if(!created)fail(401,'CUSTOMER_OTP_NOT_VERIFIED');
   return reply({ok:true,user:created,session_token:opaque,max_age:3600});
  }
  const user=await session(db,pepper,body.session_token,at);
  if(action==='session')return reply({ok:true,user:{id:user.id,email:user.email}});
  if(action==='logout'){
   await db.prepare(`UPDATE sessions SET revoked_at=? WHERE id=? AND user_id=? AND revoked_at IS NULL`).bind(at,user.session_id,user.id).run();return reply({ok:true});
  }
  if(action==='key-create'){
   // Permanent funded-only cutover; paid runtime acceptance protects issuance and consumption.
   if(env.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE!=='ACCEPTED_CANONICAL_D1_PAID_RUNTIME')
    fail(503,CUSTOMER_KEY_GATE);
   if(Object.keys(body).some(k=>k!=='session_token'))
    fail(400,'CUSTOMER_KEY_CREATE_FIELDS_INVALID');
   try{
    const minted=await mintCanonicalCustomerPaidKey(db,env,user.id,at);
    return reply({ok:true,...minted});
   }catch(error){
    if(error instanceof CustomerPaidError)fail(error.status,error.code);
    throw error;
   }
  }
  if(action==='key-revoke'){
   if(typeof body.key_id!=='string'||!/^[-_a-zA-Z0-9]{16,128}$/.test(body.key_id))fail(400,'INVALID_KEY_ID');
   const result=await db.prepare(`UPDATE api_keys SET revoked_at=? WHERE key_id=? AND user_id=? AND revoked_at IS NULL`).bind(at,body.key_id,user.id).run();
   if(result.meta?.changes!==1)fail(404,'CUSTOMER_KEY_NOT_FOUND');return reply({ok:true,revoked:true});
  }
  const [funded,keys]=await Promise.all([
   readCanonicalCustomerPaidAccount(db,user.id,at),
   db.prepare(`SELECT key_id,scopes_json,created_at,expires_at,revoked_at,last_used_at FROM api_keys WHERE user_id=? ORDER BY created_at DESC LIMIT 25`).bind(user.id).all(),
  ]);
  const paidAccepted=env.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE==='ACCEPTED_CANONICAL_D1_PAID_RUNTIME';
  const credentialReady=String(env.GEOMACRO_API_CREDENTIAL_PEPPER??'').length>=32;
  const canIssue=paidAccepted&&credentialReady&&funded.key_issuance_eligible;
  // A verified grant can be displayed while activation is pending, but it
  // cannot silently enable a dashboard key that the Worker would refuse.
  const credits=funded.credits?{...funded.credits,
   status:paidAccepted&&credentialReady?funded.credits.status:'pending_activation'}:null;
  return reply({ok:true,user:{email:user.email},principal_ready:true,credits,
   verified_balance:credits?.remaining??0,keys:(keys.results??[]).map(k=>({...k,enabled:!k.revoked_at&&k.expires_at>at,scopes:JSON.parse(k.scopes_json)})),
   checkout_enabled:false,key_issuance_enabled:canIssue,
   key_issuance_code:canIssue?null:!paidAccepted?CUSTOMER_KEY_GATE:
    !credentialReady?'CUSTOMER_PAID_CREDENTIAL_PEPPER_REQUIRED':'CUSTOMER_PAID_VERIFIED_FUNDED_GRANT_REQUIRED'});
 }catch(error){return reply({ok:false,code:error instanceof Failure?error.code:'CUSTOMER_D1_UNAVAILABLE'},error instanceof Failure?error.status:503);}
}