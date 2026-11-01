import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleCustomerRuntime,customerHmac,CUSTOMER_KEY_GATE} from '../../workers/control-plane/src/customer-runtime.mjs';

function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0090_customer_canonical_d1.sql','0091_customer_canonical_integrity_triggers.sql','0092_customer_resend_otp_sessions.sql','0093_customer_email_provider_quota.sql','0094_customer_login_runtime.sql','0095_customer_grant_scoped_usage.sql'])
  sql.exec(readFileSync('workers/control-plane/migrations/'+name,'utf8'));
 const prepare=q=>({bind(...args){return {q,args,first:async()=>sql.prepare(q).get(...args)??null,
  all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};}});
 const db={prepare,async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>({meta:{changes:Number(sql.prepare(s.q).run(...s.args).changes)}}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const env={DB:db,GEOMACRO_CUSTOMER_SSR_TOKEN:'test-bridge-'.repeat(8),GEOMACRO_CUSTOMER_AUTH_PEPPER:'test-pepper-'.repeat(8),
  GEOMACRO_CUSTOMER_ALLOWED_ORIGINS:'https://geomacro.live',EMAIL_PROVIDER_API_KEY:'fake-provider-only',EMAIL_FROM_ADDRESS:'auth@geomacro.live',
  GEOMACRO_API_CREDENTIAL_PEPPER:'local-fixture-credential-pepper-that-is-long-and-not-production'};
 let clock=Date.now(),otp;let calls=0;
 const options={now:()=>clock,fetchImpl:async(_url,init)=>{calls++;otp=JSON.parse(init.body).text.match(/code is (\d{6})/)[1];return Response.json({id:'fake-accepted-id'});}};
 const post=async(action,body={},extra={})=>{
  const response=await handleCustomerRuntime(new Request('https://control.invalid/v1/internal/customer/'+action,{method:'POST',headers:{authorization:'Bearer '+env.GEOMACRO_CUSTOMER_SSR_TOKEN,origin:'https://geomacro.live','content-type':'application/json','x-gm-customer-ip':'192.0.2.1',...extra},body:JSON.stringify(body)}),env,options);
  return {status:response.status,...await response.json()};
 };
 const start=email=>post('otp-start',{email});
 const verify=(email,code=otp)=>post('otp-verify',{email,otp:code});
 return {sql,db,env,options,post,start,verify,get otp(){return otp;},get calls(){return calls;},advance:ms=>{clock+=ms;}};
}

test('private routes require isolated token, pinned origin and bounded body before D1',async()=>{
 const f=fixture();assert.equal((await f.post('otp-start',{email:'a@example.com'},{authorization:'Bearer wrong'})).status,401);
 assert.equal((await f.post('otp-start',{email:'a@example.com'},{origin:'https://attacker.invalid'})).status,403);
 assert.equal((await f.post('otp-start',{email:'x'.repeat(3000)})).status,413);
 assert.equal(f.calls,0);f.env.CONTROL_PLANE_TOKEN=f.env.GEOMACRO_CUSTOMER_SSR_TOKEN;
 assert.equal((await f.start('a@example.com')).code,'CUSTOMER_TOKEN_ISOLATION_REQUIRED');f.sql.close();
});
test('accepted OTP creates one HMAC-only session under concurrent verification and rejects replay',async()=>{
 const f=fixture();assert.equal((await f.start('a@example.com')).status,200);
 const results=await Promise.all([f.verify('a@example.com'),f.verify('a@example.com')]);
 assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>x.status===401).length,1);
 const good=results.find(x=>x.ok);const row=f.sql.prepare('SELECT * FROM sessions').get();
 assert.equal(row.token_hmac_sha256,await customerHmac(f.env.GEOMACRO_CUSTOMER_AUTH_PEPPER,'session',good.session_token));
 assert.notEqual(row.token_hmac_sha256,good.session_token);
 assert.equal((await f.verify('a@example.com')).status,401);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM sessions').get().n,1);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM credit_ledger').get().n,0);f.sql.close();
});
test('five wrong codes exhaust challenge and correct code cannot rescue it',async()=>{
 const f=fixture();await f.start('a@example.com');const wrong=f.otp==='000000'?'000001':'000000';
 for(let i=0;i<5;i++)assert.equal((await f.verify('a@example.com',wrong)).status,401);
 assert.equal((await f.verify('a@example.com')).status,401);
 assert.equal(f.sql.prepare('SELECT attempts FROM customer_login_challenges').get().attempts,5);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,0);f.sql.close();
});
test('expired OTP and expired sessions fail closed; repeat login uses a new generation',async()=>{
 const f=fixture();await f.start('a@example.com');f.advance(600001);assert.equal((await f.verify('a@example.com')).status,401);
 await f.start('a@example.com');const signed=await f.verify('a@example.com');assert.equal(signed.status,200);
 f.advance(61000);await f.start('a@example.com');assert.equal((await f.verify('a@example.com')).status,200);
 f.advance(3600001);assert.equal((await f.post('session',{session_token:signed.session_token})).status,401);f.sql.close();
});
test('identity cooldown, three sends/15min and ten IP sends/15min are atomic',async()=>{
 const f=fixture();assert.equal((await f.start('a@example.com')).status,200);
 assert.equal((await f.start('a@example.com')).status,429);
 f.advance(61000);await f.start('a@example.com');f.advance(61000);await f.start('a@example.com');f.advance(61000);
 assert.equal((await f.start('a@example.com')).status,429);
 for(let i=0;i<7;i++)assert.equal((await f.start(`b${i}@example.com`)).status,200);
 assert.equal((await f.start('blocked@example.com')).status,429);assert.equal(f.calls,10);f.sql.close();
});
test('verify abuse is limited even for nonexistent challenges',async()=>{
 const f=fixture();for(let i=0;i<10;i++)assert.equal((await f.verify('a@example.com','123456')).status,401);
 assert.equal((await f.verify('a@example.com','123456')).status,429);
 for(let i=0;i<20;i++)assert.equal((await f.verify(`x${i}@example.com`,'123456')).status,401);
 assert.equal((await f.verify('next@example.com','123456')).status,429);f.sql.close();
});
test('rejected, ambiguous and false-success provider responses never create a session or user',async()=>{
 for(const result of [()=>new Response('',{status:401}),()=>new Response('',{status:500}),()=>Response.json({}),()=>{throw Error('fake timeout');}]){
  const f=fixture();let captured;f.options.fetchImpl=async(_url,init)=>{captured=JSON.parse(init.body).text.match(/code is (\d{6})/)[1];return result();};
  assert.equal((await f.start('a@example.com')).code,'CUSTOMER_OTP_DELIVERY_NOT_ACCEPTED');
  assert.equal((await f.verify('a@example.com',captured)).status,401);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM sessions').get().n,0);assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,0);f.sql.close();
 }
});
test('session-derived ownership, nonpayable account, disabled concurrent key mint, logout revoke',async()=>{
 const f=fixture();await f.start('a@example.com');const a=await f.verify('a@example.com');await f.start('b@example.com');const b=await f.verify('b@example.com');
 const account=await f.post('account',{session_token:a.session_token,user_id:b.user.id});
 assert.equal(account.user.email,'a@example.com');assert.equal(account.checkout_enabled,false);assert.equal(account.verified_balance,0);
 const minted=await Promise.all([f.post('key-create',{session_token:a.session_token}),f.post('key-create',{session_token:a.session_token})]);
 assert.ok(minted.every(x=>x.status===503&&x.code===CUSTOMER_KEY_GATE));
 // Offline row fixture only; temporarily remove funding trigger to create a
 // revocation target, not a runtime bypass or simulated production allocation.
 f.sql.exec('DROP TRIGGER trg_customer_keys_funded_only');
 f.sql.prepare('INSERT INTO api_keys(key_id,user_id,hmac_sha256,expires_at) VALUES(?,?,?,?)').run('test-owner-key-0001',a.user.id,'f'.repeat(64),new Date(Date.now()+3600000).toISOString());
 assert.equal((await f.post('key-revoke',{session_token:b.session_token,key_id:'test-owner-key-0001'})).status,404);
 assert.equal((await f.post('key-revoke',{session_token:a.session_token,key_id:'test-owner-key-0001'})).revoked,true);
 assert.throws(()=>f.sql.prepare('UPDATE api_keys SET revoked_at=NULL').run(),/IMMUTABLE_OR_REVOKED/);
 assert.equal((await f.post('logout',{session_token:a.session_token})).status,200);
 assert.equal((await f.post('account',{session_token:a.session_token})).status,401);
 assert.equal((await f.post('session',{session_token:b.session_token})).status,200);f.sql.close();
});
test('canonical release gate: funded D1 receipt, account view, one-time key, ownership and revoke',async()=>{
 const f=fixture();
 await f.start('a@example.com');const a=await f.verify('a@example.com');
 await f.start('b@example.com');const b=await f.verify('b@example.com');
 const locked=await f.post('key-create',{session_token:a.session_token});
 assert.equal(locked.status,503);assert.equal(locked.code,CUSTOMER_KEY_GATE);
 f.env.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE='ACCEPTED_CANONICAL_D1_PAID_RUNTIME';
 const noFunds=await f.post('key-create',{session_token:a.session_token});
 assert.equal(noFunds.status,403);assert.equal(noFunds.code,'CUSTOMER_PAID_VERIFIED_FUNDED_GRANT_REQUIRED');
 const now=new Date().toISOString(),start=new Date(Date.now()-60000).toISOString();
 const end=new Date(Date.now()+86400000).toISOString();
 // Synthetic provider evidence exists only in this isolated in-memory SQLite.
 f.sql.prepare(`INSERT INTO customer_payment_receipts
   (receipt_id,user_id,provider,environment,provider_event_id,sku,amount_minor_units,
   currency,settled_at,verified_at,verification_sha256)
   VALUES('test-receipt-a',?,'paypal','live','test-provider-event-a','starter_dev',900,'USD',?,?,?)`)
   .run(a.user.id,now,now,'f'.repeat(64));
 f.sql.prepare(`INSERT INTO customer_entitlement_grants
   (grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status)
   VALUES('test-grant-a',?,'test-receipt-a','starter_dev','credits-v1.1.0',?,?,'active')`)
   .run(a.user.id,start,end);
 f.sql.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id)
   VALUES('test-funding-event-a',?,'funding',1000,'test-receipt-a')`).run(a.user.id);
 const funded=await f.post('account',{session_token:a.session_token});
 assert.equal(funded.status,200);assert.equal(funded.credits.remaining,1000);
 assert.equal(funded.credits.status,'active');assert.equal(funded.key_issuance_enabled,true);
 const other=await f.post('account',{session_token:b.session_token});
 assert.equal(other.credits,null);assert.equal(other.key_issuance_enabled,false);
 const bad=await f.post('key-create',{session_token:a.session_token,user_id:b.user.id});
 assert.equal(bad.status,400);assert.equal(bad.code,'CUSTOMER_KEY_CREATE_FIELDS_INVALID');
 const issued=await f.post('key-create',{session_token:a.session_token});
 assert.equal(issued.status,200);assert.match(issued.api_key,/^gmk_live_[0-9a-f]{64}$/);
 assert.equal(issued.reveal_once,true);
 const saved=f.sql.prepare('SELECT user_id,hmac_sha256 FROM api_keys WHERE key_id=?').get(issued.key_id);
 assert.equal(saved.user_id,a.user.id);assert.notEqual(saved.hmac_sha256,issued.api_key);
 const repeat=await f.post('key-create',{session_token:a.session_token});
 assert.equal(repeat.status,403,'SQLite cooldown protects repeated requests');
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM api_keys').get().n,1);
 const cross=await f.post('key-revoke',{session_token:b.session_token,key_id:issued.key_id});
 assert.equal(cross.status,404);
 const revoked=await f.post('key-revoke',{session_token:a.session_token,key_id:issued.key_id});
 assert.equal(revoked.revoked,true);
 const after=await f.post('account',{session_token:a.session_token});
 assert.equal(after.keys[0].enabled,false);
 f.sql.close();
});
test('existing D1 key triggers enforce unverified, zero funds, 60s cooldown and max three',async()=>{
 const f=fixture(),sql=f.sql,user='offline-funded-user-001',now=new Date().toISOString(),end=new Date(Date.now()+86400000).toISOString();
 sql.prepare('INSERT INTO users(id,email) VALUES(?,?)').run(user,'offline@example.com');
 const insert=(id,hash,created=now)=>sql.prepare('INSERT INTO api_keys(key_id,user_id,hmac_sha256,expires_at,created_at) VALUES(?,?,?,?,?)').run(id,user,hash.repeat(64),end,created);
 assert.throws(()=>insert('offline-key-unverified','a'),/VERIFIED_ACTIVE_CUSTOMER_REQUIRED/);
 sql.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(now,user);
 assert.throws(()=>insert('offline-key-no-grant','a'),/VERIFIED_PAYMENT_ENTITLEMENT_REQUIRED/);
 // Synthetic receipts exist solely in in-memory test DB; no merchant calls.
 sql.prepare(`INSERT INTO customer_payment_receipts(receipt_id,user_id,provider,environment,provider_event_id,sku,amount_minor_units,currency,settled_at,verified_at,verification_sha256) VALUES(?,?,'paypal','live','offline-event','starter_dev',1,'USD',?,?,?)`).run('offline-receipt',user,now,now,'c'.repeat(64));
 sql.prepare(`INSERT INTO customer_entitlement_grants(grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status) VALUES('offline-grant',?,'offline-receipt','starter_dev','fixture',?,?,'active')`).run(user,new Date(Date.now()-10000).toISOString(),end);
 assert.throws(()=>insert('offline-key-zero-funds','a'),/POSITIVE_PAID_BALANCE_REQUIRED/);
 sql.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id) VALUES('offline-funding',?,'funding',1,'offline-receipt')`).run(user);
 insert('offline-key-first-01','a');assert.throws(()=>insert('offline-key-cooldown','b'),/KEY_CREATION_COOLDOWN/);
 sql.prepare('UPDATE api_keys SET created_at=?').run(new Date(Date.now()-61000).toISOString());insert('offline-key-second-02','b');
 sql.prepare('UPDATE api_keys SET created_at=?').run(new Date(Date.now()-61000).toISOString());insert('offline-key-third-003','c');
 assert.throws(()=>insert('offline-key-fourth-04','d'),/MAX_THREE_ACTIVE_KEYS/);sql.close();
});

test('canonical Worker deployment pins exact production customer origins without publishing auth secrets',async()=>{
 const config=JSON.parse(readFileSync('workers/control-plane/wrangler.example.jsonc','utf8'));
 assert.equal(config.name,'geomacro-control-plane');
 assert.equal(config.d1_databases.length,1);
 assert.equal(config.d1_databases[0].binding,'DB');
 assert.equal(config.vars.GEOMACRO_CUSTOMER_ALLOWED_ORIGINS,
  'https://geomacro.live,https://geomacro.lovable.app');
 assert.equal(config.vars.EMAIL_FROM_ADDRESS,'auth@geomacro.live',
  'canonical production sender must be pinned across the automated Worker deploy');
 assert.match(config.vars.EMAIL_FROM_ADDRESS,/^[^@\s]+@geomacro\.live$/,
  'sender must belong to the independently verified Resend domain');
 assert.ok(!Object.keys(config.vars).some(key=>/TOKEN|PEPPER|SECRET|PRIVATE_KEY/.test(key)));
 assert.deepEqual(config.vars.GEOMACRO_CUSTOMER_ALLOWED_ORIGINS.split(','),[
  'https://geomacro.live','https://geomacro.lovable.app']);
 const workflow=readFileSync('.github/workflows/deploy-d1-control-plane.yml','utf8');
 assert.match(workflow,/readFileSync\('workers\/control-plane\/wrangler\.example\.jsonc'/);
 assert.match(workflow,/config\.vars\s*=\s*\{\s*\.\.\.\(config\.vars/);
 const f=fixture();f.env.GEOMACRO_CUSTOMER_ALLOWED_ORIGINS=config.vars.GEOMACRO_CUSTOMER_ALLOWED_ORIGINS;
 const alias=await f.post('session',{session_token:'invalid'}, {origin:'https://geomacro.lovable.app'});
 assert.equal(alias.status,401,'the exact published alias reaches session validation, not origin denial');
 const attacker=await f.post('session',{session_token:'invalid'},{origin:'https://attacker.invalid'});
 assert.equal(attacker.status,403,'arbitrary origin must fail closed');
 f.sql.close();
});
