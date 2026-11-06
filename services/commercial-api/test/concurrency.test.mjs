import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mintApiKey, settleVerifiedSuccess } from '../src/metering.mjs';

const connection = process.env.GEOMACRO_CONCURRENCY_DATABASE_URL;
test('real PostgreSQL concurrency: no overspend, no duplicate debit, no duplicate payment', { skip: !connection }, async () => {
  const url = new URL(connection);
  for(const name of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(name);
  const pool = new pg.Pool({ connectionString:url.toString(), max:12,
    ssl:process.env.PG_LOCAL === 'true' ? false : { rejectUnauthorized:true,
      ...(process.env.PG_CA_FILE ? {ca:readFileSync(process.env.PG_CA_FILE,'utf8')} : {}) },
  });
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const key = mintApiKey(), user = randomUUID();
  // Fixtures remain as append-only financial history in this disposable DB.
  // No cleanup disables immutability protections.
  try {
    await pool.query('SELECT geomacro.provision_user($1,$2)',[user,'concurrency-fixture@example.test']);
    await pool.query('SELECT geomacro.create_api_key($1,$2,$3,$4)',[user,key.hash,key.prefix,'concurrency fixture']);
    const input = requestId => ({apiKey:key.secret,requestId,subject:'USA',requestedTier:'basic',
      availableTiers:['basic'],riskByTier:{basic:{decision:'review',risk_score:42,factors:['TEST FIXTURE']}},
      privateKey,publicKeyId:'fixture',publicKeys:{fixture:publicKey}});
    const overspend=await Promise.allSettled(Array.from({length:8},()=>settleVerifiedSuccess(pool,input(randomUUID()))));
    assert.equal(overspend.filter(r=>r.status==='fulfilled').length,1);
    for(const r of overspend.filter(r=>r.status==='rejected')) assert.match(r.reason.message,/INSUFFICIENT_CREDITS/);
    const payment=randomUUID();
    await Promise.all(Array.from({length:8},()=>pool.query(
      "SELECT geomacro.top_up($1,'paypal_capture',$2,10000000)",[user,payment])));
    const retryId=randomUUID();
    const retries=await Promise.all(Array.from({length:8},()=>settleVerifiedSuccess(pool,input(retryId))));
    assert.equal(retries.filter(r=>!r.replayed).length,1);
    assert.equal(new Set(retries.map(r=>r.responseBody)).size,1);
    // Owner-only reconciliation query; use an owner connection for this test.
    const {rows:[row]}=await pool.query(`SELECT u.balance_units,
       (SELECT sum(delta_units) FROM geomacro.credit_ledger WHERE user_id=u.id) AS ledger_units,
       (SELECT count(*) FROM geomacro.credit_ledger WHERE user_id=u.id AND kind='usage') AS debits,
       (SELECT count(*) FROM geomacro.credit_ledger WHERE user_id=u.id AND kind='payment') AS payments
       FROM geomacro.users u WHERE id=$1`,[user]);
    assert.equal(Number(row.balance_units),0); assert.equal(Number(row.ledger_units),0);
    assert.equal(Number(row.debits),2); assert.equal(Number(row.payments),1);
  } finally { await pool.end(); }
});

test('real PostgreSQL API-key rate window cannot race past its limit', {skip:!connection},async()=>{
 const pool=new pg.Pool({connectionString:connection,ssl:process.env.PG_LOCAL==='true'?false:{rejectUnauthorized:true}});
 const user=randomUUID(),key=mintApiKey();
 try{
  await pool.query('SELECT geomacro.provision_user($1,$2)',[user,'rate-concurrency-fixture@example.test']);
  const {rows:[{id}]}=await pool.query('SELECT geomacro.create_api_key($1,$2,$3,$4) AS id',[user,key.hash,key.prefix,'rate fixture']);
  await pool.query('UPDATE geomacro.api_keys SET rate_limit_per_minute=2 WHERE id=$1',[id]);
  const results=await Promise.allSettled(Array.from({length:8},()=>pool.query('SELECT geomacro.authorize_credit_key($1)',[key.hash])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
  for(const r of results)if(r.status==='rejected')assert.match(r.reason.message,/RATE_LIMIT_EXCEEDED/);
  const {rows:[b]}=await pool.query('SELECT balance_units FROM geomacro.users WHERE id=$1',[user]);assert.equal(Number(b.balance_units),10000000);
 }finally{await pool.end();}
});

test('real PostgreSQL accountless payment lease is exclusive across concurrent sessions',{skip:!connection},async()=>{
 const pool=new pg.Pool({connectionString:connection,ssl:process.env.PG_LOCAL==='true'?false:{rejectUnauthorized:true}});
 const id=randomUUID(),payer='0x'+'11'.repeat(20),payee='0x'+'22'.repeat(20),nonce='0x'+randomUUID().replaceAll('-','').repeat(2);
 const payload={request_id:id,subject:'USA',requested_tier:'complex',billed_tier:'standard',
  payment_amount_atomic:'150000',payment_rail:'base_usdc',payer,payee,payment_nonce:nonce,
  credits_deducted:0,execution_authorized:false,public_key_id:'FIXTURE',generated_at:new Date().toISOString()};
 try{
  await pool.query('SELECT geomacro.x402_prepare($1::jsonb)',[JSON.stringify({
   request_id:id,request_hash:'a'.repeat(64),subject:'USA',requested_tier:'complex',billed_tier:'standard',amount_atomic:'150000',
   payer_address:payer,payee_address:payee,nonce,payment_hash:'b'.repeat(64),payment_payload:{fixture:true},
   canonical_payload:JSON.stringify(payload),signature:'TEST_ONLY_NOT_A_PRODUCTION_SIGNATURE',public_key_id:'FIXTURE',scan_from_block:'1000'})]);
  const results=await Promise.allSettled(Array.from({length:8},()=>pool.query('SELECT geomacro.x402_claim($1,$2)',[id,randomUUID()])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  for(const r of results)if(r.status==='rejected')assert.match(r.reason.message,/PAYMENT_PROCESSING/);
  const {rows:[n]}=await pool.query('SELECT count(*) AS count FROM geomacro.usage_logs WHERE request_id=$1',[id]);assert.equal(Number(n.count),0);
 }finally{await pool.end();}
});
