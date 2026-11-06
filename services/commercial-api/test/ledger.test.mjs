import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { prepareValue } = require('pg/lib/utils');
import { PGlite } from '@electric-sql/pglite';
import { hash, mintApiKey, settleVerifiedSuccess, verifyReceipt } from '../src/metering.mjs';

// PGlite executes real PostgreSQL SQL/PLpgSQL in WASM. It is single-connection:
// use concurrency.test.mjs against a real PostgreSQL server for lock races.
const db = new PGlite();
const pool = { async connect() { return { query: (sql,args) => db.query(sql,args?.map(prepareValue)), release() {} }; } };
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeys = { 'test-ed25519': publicKey };
const user = randomUUID(), api = mintApiKey();
let apiId;
const riskByTier = {
 basic: { decision:'review', risk_score:42, factors:[{label:'TEST FIXTURE ONLY'}] },
 standard: { decision:'review', risk_score:43, factors:[{label:'TEST FIXTURE ONLY'}] },
 complex: { decision:'deny', risk_score:75, factors:[{label:'TEST FIXTURE ONLY'}] },
};
const args = (changes={}) => ({ apiKey:api.secret, requestId:randomUUID(), subject:'USA', requestedTier:'basic', availableTiers:['basic'], riskByTier, privateKey, publicKeyId:'test-ed25519', publicKeys, ...changes });
const query = async (sql,args=[]) => (await db.query(sql,args)).rows;
const balance = async () => Number((await query('SELECT balance_units FROM geomacro.users WHERE id=$1',[user]))[0].balance_units);
async function grant(units=100000000) { return query("SELECT geomacro.top_up($1,'paypal_capture',$2,$3)",[user,randomUUID(),units]); }

before(async () => {
 await db.exec(await readFile(new URL('../sql/schema.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../sql/functions.sql',import.meta.url),'utf8'));
 await query('SELECT geomacro.provision_user($1,$2)',[user,'fixture@example.test']);
 apiId=(await query('SELECT geomacro.create_api_key($1,$2,$3,$4) AS id',[user,api.hash,api.prefix,'fixture']))[0].id;
});
after(() => db.close());

test('signup is exactly 10 credits and idempotent', async () => {
 assert.equal(await balance(),10000000);
 await query('SELECT geomacro.provision_user($1,$2)',[user,'fixture@example.test']);
 assert.equal(await balance(),10000000);
});
test('verified success deducts once, binds receipt and replays exact payload', async () => {
 const input=args(), before=await balance();
 const first=await settleVerifiedSuccess(pool,input);
 assert.equal(first.status,200); assert.equal(await balance(),before-10000000);
 const body=JSON.parse(first.responseBody);
 assert.equal(body.execution_authorized,false);
 assert.equal(body.credits_deducted,10);
 assert(verifyReceipt(first.canonicalPayload,body.audit_receipt,publicKey));
 const second=await settleVerifiedSuccess(pool,input);
 assert.equal(second.replayed,true); assert.equal(first.responseBody,second.responseBody);
 assert.equal(await balance(),before-10000000);
 await assert.rejects(settleVerifiedSuccess(pool,{...input,subject:'IND'}),/IDEMPOTENCY_CONFLICT/);
});
test('insufficient credits cannot create a usage debit', async () => {
 const start=await balance();
 await assert.rejects(settleVerifiedSuccess(pool,args()),/INSUFFICIENT_CREDITS/);
 assert.equal(await balance(),start);
});
test('payment resource idempotency and conflicting topup', async () => {
 const start=await balance(), external=randomUUID();
 await query("SELECT geomacro.top_up($1,'paypal_capture',$2,100000000)",[user,external]);
 await query("SELECT geomacro.top_up($1,'paypal_capture',$2,100000000)",[user,external]);
 assert.equal(await balance(),start+100000000);
 await assert.rejects(query("SELECT geomacro.top_up($1,'paypal_capture',$2,200000000)",[user,external]),/IDEMPOTENCY_CONFLICT/);
});
test('complex automatically downgrades to standard and charges 15 credits', async () => {
 const start=await balance();
 const result=await settleVerifiedSuccess(pool,args({requestedTier:'complex',availableTiers:['basic','standard']}));
 const body=JSON.parse(result.responseBody);
 assert.equal(body.billed_tier,'standard'); assert.equal(body.credits_deducted,15);
 assert.equal(body.risk_score,43); assert.equal(await balance(),start-15000000);
});
test('basic never upgrades even if complex exists', async () => {
 const result=await settleVerifiedSuccess(pool,args({availableTiers:['basic','standard','complex']}));
 assert.equal(JSON.parse(result.responseBody).billed_tier,'basic');
});
test('no qualifying tier and inconclusive output both charge zero', async () => {
 const start=await balance();
 await assert.rejects(settleVerifiedSuccess(pool,args({availableTiers:[]})),/INCONCLUSIVE_NO_CHARGE/);
 await assert.rejects(settleVerifiedSuccess(pool,args({riskByTier:{basic:{...riskByTier.basic,decision:'inconclusive'}}})),/INCONCLUSIVE_NO_CHARGE/);
 assert.equal(await balance(),start);
});
test('bad signature verification rolls back everything', async () => {
 const start=await balance(), requestId=randomUUID();
 const wrong=generateKeyPairSync('ed25519').publicKey;
 await assert.rejects(settleVerifiedSuccess(pool,args({requestId,publicKeys:{'test-ed25519':wrong}})),/SIGNATURE_VERIFICATION_FAILED/);
 assert.equal(await balance(),start);
 assert.equal((await query('SELECT * FROM geomacro.usage_logs WHERE request_id=$1',[requestId])).length,0);
});
test('aborted request before transaction charges zero', async () => {
 const start=await balance(), controller=new AbortController(); controller.abort();
 await assert.rejects(settleVerifiedSuccess(pool,args({signal:controller.signal})),/abort/i);
 assert.equal(await balance(),start);
});
test('database failure AFTER debit insertion rolls back receipt, usage and balance', async () => {
 await grant(); const start=await balance(), requestId=randomUUID();
 await db.exec(`CREATE FUNCTION geomacro.test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN IF NEW.kind='usage' THEN RAISE EXCEPTION 'TEST_INJECTED_FAILURE'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER test_fail AFTER INSERT ON geomacro.credit_ledger FOR EACH ROW EXECUTE FUNCTION geomacro.test_fail();`);
 try { await assert.rejects(settleVerifiedSuccess(pool,args({requestId})),/TEST_INJECTED_FAILURE/); }
 finally { await db.exec('DROP TRIGGER test_fail ON geomacro.credit_ledger; DROP FUNCTION geomacro.test_fail();'); }
 assert.equal(await balance(),start);
 assert.equal((await query('SELECT * FROM geomacro.audit_receipts WHERE request_id=$1',[requestId])).length,0);
 assert.equal((await query('SELECT * FROM geomacro.usage_logs WHERE request_id=$1',[requestId])).length,0);
});
test('5xx and timeout logs create no ledger debit', async () => {
 const start=await balance();
 for(const status of [500,503,504]) await query('SELECT geomacro.record_failure($1,$2,$3,$4,$5,$6,$7)',[api.hash,randomUUID(),hash('fixture'), 'USA','basic',status,'UPSTREAM_ERROR']);
 assert.equal(await balance(),start);
});
test('refund is full, atomic, idempotent; refunded request cannot be billed or replayed', async () => {
 const input=args(), start=await balance();
 await settleVerifiedSuccess(pool,input);
 await query('SELECT geomacro.refund_usage($1)',[input.requestId]);
 await query('SELECT geomacro.refund_usage($1)',[input.requestId]);
 assert.equal(await balance(),start);
 await assert.rejects(settleVerifiedSuccess(pool,input),/REQUEST_NOT_REPLAYABLE/);
});
test('ledger and audit receipt mutation is blocked', async () => {
 await assert.rejects(query('UPDATE geomacro.credit_ledger SET delta_units=1'),/APPEND_ONLY_RECORD/);
 await assert.rejects(query('DELETE FROM geomacro.audit_receipts'),/APPEND_ONLY_RECORD/);
});
test('private billing role cannot directly mutate tables or fabricate balance', async () => {
 await db.exec('SET ROLE geomacro_billing');
 try {
  await assert.rejects(query('UPDATE geomacro.users SET balance_units=999999999'),/permission denied/);
  const result=await query("SELECT geomacro.quote('complex',ARRAY['standard']::geomacro.tier[]) AS q");
  assert.equal(result.length,1);
 } finally { await db.exec('RESET ROLE'); }
});
test('different account cannot replay another account request', async () => {
 const input=args(); await settleVerifiedSuccess(pool,input);
 const other=randomUUID(), key=mintApiKey();
 await query('SELECT geomacro.provision_user($1,$2)',[other,'other@example.test']);
 await query('SELECT geomacro.create_api_key($1,$2,$3,$4)',[other,key.hash,key.prefix,'other']);
 await assert.rejects(settleVerifiedSuccess(pool,{...input,apiKey:key.secret}),/IDEMPOTENCY_CONFLICT/);
});
test('revoked API key is rejected with zero deduction', async () => {
 const start=await balance();
 await query('SELECT geomacro.revoke_api_key($1,$2)',[user,apiId]);
 await assert.rejects(settleVerifiedSuccess(pool,args()),/KEY_UNAVAILABLE/);
 assert.equal(await balance(),start);
});
test('ledger totals reconcile exactly to cached balances for all users', async () => {
 const rows=await query(`SELECT u.id FROM geomacro.users u LEFT JOIN geomacro.credit_ledger l ON l.user_id=u.id
 GROUP BY u.id HAVING u.balance_units<>coalesce(sum(l.delta_units),0)`);
 assert.equal(rows.length,0);
});
