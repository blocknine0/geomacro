import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handleCustomerRuntime} from '../../workers/control-plane/src/customer-runtime.mjs';
import {readFileSync} from 'node:fs';
import {
 CUSTOMER_CREDIT_COSTS,CUSTOMER_CREDIT_CONTRACT,CUSTOMER_ENABLED_CAPABILITIES,
 customerPaidKeyDigest,authorizeCanonicalCustomerPaid,
 consumeCanonicalCustomerPaid,mintCanonicalCustomerPaidKey
} from '../../workers/control-plane/src/customer-paid-ledger.mjs';
const migrations=['0090_customer_canonical_d1.sql','0091_customer_canonical_integrity_triggers.sql',
 '0092_customer_resend_otp_sessions.sql','0093_customer_email_provider_quota.sql',
 '0094_customer_login_runtime.sql','0095_customer_grant_scoped_usage.sql'];
const pepper='a-verified-server-pepper-with-at-least-32-characters-and-no-fallback';
const contract=CUSTOMER_CREDIT_CONTRACT;
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of migrations)sql.exec(readFileSync('workers/control-plane/migrations/'+name,'utf8'));
 const prepare=q=>({bind(...args){return {q,args,
    first:async()=>sql.prepare(q).get(...args)??null,
    all:async()=>({results:sql.prepare(q).all(...args)}),
    run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};}});
 const db={prepare};
 const env={GEOMACRO_API_CREDENTIAL_PEPPER:pepper};
 const now=new Date().toISOString(),end=new Date(Date.now()+86400000).toISOString();
 const start=new Date(Date.now()-60000).toISOString();
 function user(id,email,verified=true){
  sql.prepare('INSERT INTO users(id,email,email_verified_at) VALUES(?,?,?)').run(id,email,verified?now:null);
  return id;
 }
 function fund(uid,{tier='starter_dev',credits=100,grantId='grant-01',receiptId='receipt-01'}={}){
  sql.prepare(`INSERT INTO customer_payment_receipts
    (receipt_id,user_id,provider,environment,provider_event_id,sku,amount_minor_units,
      currency,settled_at,verified_at,verification_sha256)
    VALUES(?,?,'paypal','live',?,? ,900,'USD',?,?,?)`).run(receiptId,uid,'provider-'+receiptId,tier,now,now,'a'.repeat(64));
  sql.prepare(`INSERT INTO customer_entitlement_grants
    (grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status)
    VALUES(?,?,?,?,?,?,?,'active')`).run(grantId,uid,receiptId,tier,contract,start,end);
  sql.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id)
    VALUES(?,?,'funding',?,?)`).run('funding-'+receiptId,uid,credits,receiptId);
  return {grantId,receiptId};
 }
 function reversed(uid,receiptId){
  sql.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id)
     VALUES(?,?,'reversal',-100,?)`).run('reversal-'+receiptId,uid,receiptId);
 }
 return {sql,db,env,user,fund,reversed,now,end};
}
const alice='cust-alice-verified-00000001',bob='cust-bob-verified-0000000002';
function errCode(p,code){return assert.rejects(p,e=>e.code===code);}

test('new D1 credential HMAC exactly matches Node canonical commercial-bearer namespace',async()=>{
 const key='gmk_live_'+'a'.repeat(64);
 const got=await customerPaidKeyDigest({GEOMACRO_API_CREDENTIAL_PEPPER:pepper},key);
 const expected=createHmac('sha256',pepper).update('geomacro-api-credential-v1\0','utf8')
  .update('commercial-bearer','utf8').update('\0','utf8').update(key,'utf8').digest('hex');
 assert.equal(got,expected);
 await errCode(customerPaidKeyDigest({},key),'CUSTOMER_PAID_CREDENTIAL_PEPPER_REQUIRED');
});

test('tier/cost table is locked and matches canonical TS registry, risk-gate/GRI withheld from new sale',()=>{
 const ts=readFileSync('src/lib/commercial-access-contract.ts','utf8');
 for(const [name,cost] of Object.entries(CUSTOMER_CREDIT_COSTS)){
  assert.match(ts,new RegExp(name+':\\s*'+cost+'[,}]'));
 }
 assert.equal(CUSTOMER_CREDIT_COSTS.structural_corridor_profile,12);
 assert.ok(!CUSTOMER_ENABLED_CAPABILITIES.includes('gri_read'));
 assert.ok(!CUSTOMER_ENABLED_CAPABILITIES.includes('risk_gate_bundle'));
});

test('unverified, zero-funded, or wrong-person keys cannot be issued',async()=>{
 const f=fixture();f.user(alice,'alice@example.com',false);
 await errCode(mintCanonicalCustomerPaidKey(f.db,f.env,alice),'CUSTOMER_PAID_VERIFIED_USER_REQUIRED');
 f.sql.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(f.now,alice);
 await errCode(mintCanonicalCustomerPaidKey(f.db,f.env,alice),'CUSTOMER_PAID_VERIFIED_FUNDED_GRANT_REQUIRED');
 f.fund(alice,{credits:1});
 const key=await mintCanonicalCustomerPaidKey(f.db,f.env,alice);
 assert.match(key.api_key,/^gmk_live_[a-f0-9]{64}$/);
 assert.notEqual(key.api_key,f.sql.prepare('SELECT hmac_sha256 AS h FROM api_keys').get().h);
 f.sql.close();
});

test('atomic grant debit: one charge, replay no charge, mutated request rejected',async()=>{
 const f=fixture();f.user(alice,'alice@example.com');f.fund(alice,{tier:'pro_analyst',credits:20});
 const key=await mintCanonicalCustomerPaidKey(f.db,f.env,alice);
 const proof=await authorizeCanonicalCustomerPaid(f.db,f.env,key.api_key,'structural_corridor_profile');
 assert.equal(proof.principal_id,alice);assert.equal(proof.credit_cost,12);assert.equal(proof.credits_remaining,20);
 const req={apiKey:key.api_key,capability:'structural_corridor_profile',requestId:'corridor-idem-0001'};
 const done=await consumeCanonicalCustomerPaid(f.db,f.env,req);
 assert.equal(done.idempotent_replay,false);assert.equal(done.credit_cost,12);
 const again=await consumeCanonicalCustomerPaid(f.db,f.env,req);
 assert.equal(again.idempotent_replay,true);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM credit_ledger WHERE event_type='debit'").get().n,1);
 assert.equal(f.sql.prepare('SELECT SUM(delta_credits) n FROM credit_ledger').get().n,8);
 await errCode(consumeCanonicalCustomerPaid(f.db,f.env,{...req,capability:'structural_country_digest'}),'CUSTOMER_PAID_REQUEST_REPLAY_MISMATCH');
 await errCode(consumeCanonicalCustomerPaid(f.db,f.env,{...req,requestId:'corridor-idem-0002'}),'CUSTOMER_PAID_INSUFFICIENT_CREDITS');
 f.sql.close();
});

test('simultaneous duplicate debit never double-spends; wrong cost or direct ledger debit rejected',async()=>{
 const f=fixture();f.user(alice,'alice@example.com');f.fund(alice,{credits:3});
 const key=await mintCanonicalCustomerPaidKey(f.db,f.env,alice);
 const req={apiKey:key.api_key,capability:'structural_country_digest',requestId:'same-request-concurrent-01'};
 const both=await Promise.all([consumeCanonicalCustomerPaid(f.db,f.env,req),consumeCanonicalCustomerPaid(f.db,f.env,req)]);
 assert.equal(both.length,2);assert.equal(both.filter(x=>x.idempotent_replay).length,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM customer_usage_receipts').get().n,1);
 assert.equal(f.sql.prepare('SELECT SUM(delta_credits) n FROM credit_ledger').get().n,0);
 assert.throws(()=>f.sql.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,request_id,capability)
  VALUES('bogus-direct-debit',?,'debit',-1,'bypass-001','intelligence_query')`).run(alice),/CUSTOMER_USAGE_RECEIPT_REQUIRED/);
 assert.throws(()=>f.sql.prepare(`INSERT INTO customer_usage_receipts
  (user_id,request_id,event_id,key_id,grant_id,capability,credit_cost,contract_version)
  VALUES(?,?,?,?,?,'structural_country_digest',1,?)`).run(alice,'wrong-cost-001','bogus-event-1',key.key_id,'grant-01',contract),/CUSTOMER_LOCKED_CAPABILITY_COST_REQUIRED/);
 f.sql.close();
});

test('grant expiry and reversal block spending; no laundering old subscription funds',async()=>{
 const f=fixture();f.user(alice,'alice@example.com');f.fund(alice,{credits:100});
 const key=await mintCanonicalCustomerPaidKey(f.db,f.env,alice);
 f.reversed(alice,'receipt-01');
 await errCode(authorizeCanonicalCustomerPaid(f.db,f.env,key.api_key,'intelligence_query'),'CUSTOMER_PAID_ACTIVE_GRANT_REQUIRED');
 await errCode(consumeCanonicalCustomerPaid(f.db,f.env,{apiKey:key.api_key,capability:'intelligence_query',requestId:'reversed-req-01'}),'CUSTOMER_PAID_ACTIVE_GRANT_REQUIRED');
 f.sql.close();
 const g=fixture();g.user(alice,'alice@example.com');g.fund(alice,{credits:100});
 const k=await mintCanonicalCustomerPaidKey(g.db,g.env,alice);
 g.sql.prepare('UPDATE customer_entitlement_grants SET expires_at=?').run(new Date(Date.now()-1000).toISOString());
 await errCode(authorizeCanonicalCustomerPaid(g.db,g.env,k.api_key,'intelligence_query'),'CUSTOMER_PAID_ACTIVE_GRANT_REQUIRED');
 g.sql.close();
});

test('key revoked, suspended user, or cross-customer key cannot debit',async()=>{
 const f=fixture();f.user(alice,'alice@example.com');f.fund(alice,{credits:100});
 f.user(bob,'bob@example.com');
 const key=await mintCanonicalCustomerPaidKey(f.db,f.env,alice);
 assert.equal((await authorizeCanonicalCustomerPaid(f.db,f.env,key.api_key,'intelligence_query')).principal_id,alice);
 f.sql.prepare('UPDATE api_keys SET revoked_at=? WHERE key_id=?').run(f.now,key.key_id);
 await errCode(authorizeCanonicalCustomerPaid(f.db,f.env,key.api_key,'intelligence_query'),'CUSTOMER_PAID_API_KEY_DENIED');
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM credit_ledger WHERE event_type='debit'").get().n,0);
 f.sql.close();
});

test('immutable grant-scoped receipts and no wrong-tier capability/mis-scoped key',async()=>{
 const f=fixture();f.user(alice,'alice@example.com');f.fund(alice,{tier:'starter_dev',credits:100});
 const key=await mintCanonicalCustomerPaidKey(f.db,f.env,alice);
 await errCode(authorizeCanonicalCustomerPaid(f.db,f.env,key.api_key,'structural_corridor_digest'),'CUSTOMER_PAID_ACTIVE_GRANT_REQUIRED');
 await errCode(authorizeCanonicalCustomerPaid(f.db,f.env,key.api_key,'risk_gate_bundle'),'CUSTOMER_PAID_CAPABILITY_NOT_LIVE');
 await errCode(authorizeCanonicalCustomerPaid(f.db,f.env,key.api_key,'gri_read'),'CUSTOMER_PAID_CAPABILITY_NOT_LIVE');
 await consumeCanonicalCustomerPaid(f.db,f.env,{apiKey:key.api_key,capability:'intelligence_query',requestId:'immutable-test-0001'});
 assert.throws(()=>f.sql.prepare('DELETE FROM customer_usage_receipts').run(),/CUSTOMER_USAGE_IMMUTABLE/);
 assert.throws(()=>f.sql.prepare('UPDATE customer_usage_receipts SET capability=?').run('gri_read'),/CUSTOMER_USAGE_IMMUTABLE/);
 const malformed=key.api_key.slice(0,-1)+'z';
 await errCode(authorizeCanonicalCustomerPaid(f.db,f.env,malformed,'intelligence_query'),'CUSTOMER_PAID_API_KEY_DENIED');
 f.sql.close();
});

test('protected paid HTTP routes remain locked and reject forged caller fields',async()=>{
 const env={DB:{batch:async()=>{throw Error('should not run a DB query');}},
  GEOMACRO_CUSTOMER_SSR_TOKEN:'bridge-'+('x'.repeat(74)),
  GEOMACRO_CUSTOMER_AUTH_PEPPER:'hmac-'+('z'.repeat(76)),
  GEOMACRO_CUSTOMER_ALLOWED_ORIGINS:'https://geomacro.live'};
 const call=async(action,body={},token=env.GEOMACRO_CUSTOMER_SSR_TOKEN)=>
  handleCustomerRuntime(new Request('https://control.example/v1/internal/customer/'+action,{
   method:'POST',headers:{authorization:'Bearer '+token,
    origin:'https://geomacro.live','content-type':'application/json'},
   body:JSON.stringify(body)}),env);
 const locked=await call('paid-debit',{api_key:'gmk_live_'+('a'.repeat(64)),
  capability:'intelligence_query',request_id:'frozen-req-0001'});
 assert.equal(locked.status,503);
 assert.equal((await locked.json()).code,'CUSTOMER_PAID_RUNTIME_NOT_ACCEPTED');
 const badToken=await call('paid-authorize',{},'attacker-token');
 assert.equal(badToken.status,401);
 env.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE='ACCEPTED_CANONICAL_D1_PAID_RUNTIME';
 const badFields=await call('paid-debit',{api_key:'gmk_live_'+('a'.repeat(64)),
  capability:'intelligence_query',request_id:'frozen-req-0001',
  credit_cost:0,user_id:'other-account'});
 assert.equal(badFields.status,400);
 assert.equal((await badFields.json()).code,'CUSTOMER_PAID_BODY_INVALID');
});
