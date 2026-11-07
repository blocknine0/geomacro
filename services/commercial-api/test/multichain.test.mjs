import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';

const database=process.env.GEOMACRO_CONCURRENCY_DATABASE_URL;
const baseAsset='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const polygonAsset='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const payee='0x95ba71d21c41bda8bba9533f96d25f793e4137b5';
const payer='0x'+'11'.repeat(20);
const nonce='0x'+'ce'.repeat(32);
const now=new Date();
const params=[
 'request_id','request_hash','subject','billed_tier','chain_id','network',
 'token_address','facilitator','payment_rail','payer_address','payee_address',
 'authorization_nonce','amount_atomic','quote_sha256','evidence_receipt_sha256',
 'canonical_delivery_sha256','issued_at','expires_at'
];
function proof(chain=8453,override={}){
 return {
  request_id:randomUUID(),request_hash:'a'.repeat(64),subject:'USA',
  billed_tier:'standard',chain_id:chain,
  network:chain===8453?'eip155:8453':'eip155:137',
  token_address:chain===8453?baseAsset:polygonAsset,
  facilitator:chain===8453?'xpay':'dexter',
  payment_rail:chain===8453?'base_usdc':'polygon_usdc',
  payer_address:payer,payee_address:payee,authorization_nonce:nonce,
  amount_atomic:150000,quote_sha256:'b'.repeat(64),
  evidence_receipt_sha256:'c'.repeat(64),
  canonical_delivery_sha256:'d'.repeat(64),
  issued_at:now,expires_at:new Date(now.getTime()+2*3600*1000),...override
 };
}
async function insert(pool,datum){
 const sql=`INSERT INTO geomacro.x402_chain_no_funds_proofs (${params.join(',')})
  VALUES(${params.map((_,i)=>'$'+(i+1)).join(',')})`;
 return pool.query(sql,params.map(k=>datum[k]));
}

test('real PostgreSQL: immutable, chain-locked no-funds proof table isolates Base and Polygon',{skip:!database},async()=>{
 const pool=new pg.Pool({connectionString:database,ssl:process.env.PG_LOCAL==='true'?false:{rejectUnauthorized:true},max:10});
 try{
  const b=proof(8453),p=proof(137);
  await insert(pool,b);await insert(pool,p); // same nonce on DIFFERENT networks is legal
  const {rows}=await pool.query(`SELECT chain_id,network,facilitator,payment_rail,proof_state
   FROM geomacro.x402_chain_no_funds_proofs WHERE request_id=ANY($1::uuid[]) ORDER BY chain_id`,
   [[b.request_id,p.request_id]]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.chain_id),['137','8453'].map(Number).sort((a,b)=>a-b).map(String).map(Number));
  assert.deepEqual(rows.map(r=>r.proof_state),['NO_FUNDS_ONLY','NO_FUNDS_ONLY']);
  assert.equal(rows[0].facilitator,'dexter');assert.equal(rows[1].facilitator,'xpay');
  await assert.rejects(insert(pool,proof(137)),e=>e.code==='23505'); // nonce replay on Polygon
  await assert.rejects(insert(pool,proof(8453)),e=>e.code==='23505'); // nonce replay on Base
  await assert.rejects(insert(pool,{...proof(8453,{authorization_nonce:'0x'+'df'.repeat(32)}),request_id:p.request_id}),e=>e.code==='23505');
  await assert.rejects(pool.query(`UPDATE geomacro.x402_chain_no_funds_proofs
    SET quote_sha256=$1 WHERE request_id=$2`,['f'.repeat(64),b.request_id]),
    e=>e.message.includes('APPEND_ONLY_RECORD'));
  await assert.rejects(pool.query('DELETE FROM geomacro.x402_chain_no_funds_proofs WHERE request_id=$1',[p.request_id]),
    e=>e.message.includes('APPEND_ONLY_RECORD'));
 }finally{await pool.end()}
});

test('real PostgreSQL: cross-chain token/provider, price, recipient and 3h quote window fail closed',{skip:!database},async()=>{
 const pool=new pg.Pool({connectionString:database,ssl:process.env.PG_LOCAL==='true'?false:{rejectUnauthorized:true}});
 const cases=[
  [137,{token_address:baseAsset}],
  [8453,{token_address:polygonAsset}],
  [137,{network:'eip155:8453'}],
  [8453,{network:'eip155:137'}],
  [137,{facilitator:'xpay'}],
  [8453,{facilitator:'dexter'}],
  [137,{payment_rail:'base_usdc'}],
  [8453,{payment_rail:'polygon_usdc'}],
  [137,{payee_address:'0x'+'22'.repeat(20)}],
  [137,{amount_atomic:100000}],
  [8453,{billed_tier:'basic'}],
  [137,{expires_at:new Date(now.getTime()+4*3600*1000)}],
  [137,{expires_at:new Date(now.getTime()-10)}],
  [137,{quote_sha256:'not_hash'}],
  [137,{evidence_receipt_sha256:'not_hash'}],
  [137,{canonical_delivery_sha256:'not_hash'}],
  [137,{proof_state:'confirmed'}],
 ];
 try{
  for(let i=0;i<cases.length;i++){
   const [chain,override]=cases[i];
   const row=proof(chain,{authorization_nonce:'0x'+i.toString(16).padStart(64,'0'),...override});
   await assert.rejects(insert(pool,row),e=>e.code==='23514',JSON.stringify({chain,override}));
  }
 }finally{await pool.end()}
});

test('real PostgreSQL: protected proof relation has RLS, no public or billing privileges and no settlement RPC',{skip:!database},async()=>{
 const pool=new pg.Pool({connectionString:database,ssl:process.env.PG_LOCAL==='true'?false:{rejectUnauthorized:true}});
 try{
  const {rows:[r]}=await pool.query(`SELECT
    (SELECT relrowsecurity FROM pg_class WHERE oid='geomacro.x402_chain_no_funds_proofs'::regclass) as rls,
    has_table_privilege('anon','geomacro.x402_chain_no_funds_proofs','SELECT') as anon_read,
    has_table_privilege('authenticated','geomacro.x402_chain_no_funds_proofs','INSERT') as authenticated_write,
    has_table_privilege('service_role','geomacro.x402_chain_no_funds_proofs','SELECT') as service_read,
    has_table_privilege('geomacro_billing','geomacro.x402_chain_no_funds_proofs','INSERT') as billing_write,
    to_regprocedure('geomacro.x402_chain_settle(uuid)') IS NOT NULL as settle_callable`);
  assert.equal(r.rls,true);
  for(const key of ['anon_read','authenticated_write','service_read','billing_write','settle_callable'])
   assert.equal(r[key],false,key);
  const {rows:[locked]}=await pool.query(`SELECT count(*)::int count FROM geomacro.x402_chain_no_funds_proofs
   WHERE proof_state<>'NO_FUNDS_ONLY'`);
  assert.equal(locked.count,0);
 }finally{await pool.end()}
});
