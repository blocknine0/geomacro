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
