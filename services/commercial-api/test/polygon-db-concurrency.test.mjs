import {test} from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {randomUUID} from 'node:crypto';

const connection=process.env.GEOMACRO_CONCURRENCY_DATABASE_URL;
const payee='0x95ba71d21c41bda8bba9533f96d25f793e4137b5';
const token='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const payer='0x'+'11'.repeat(20);
const nonce='0x'+'ab'.repeat(32);
const sha='a'.repeat(64),paymentHash='b'.repeat(64),evidence='c'.repeat(64);
function makeInput(overrides={}){
 const issued=new Date(),expires=new Date(issued.getTime()+2*3600000);
 const req=randomUUID();
 const canonical={
  request_id:req,subject:'USA',requested_tier:'basic',billed_tier:'basic',
  execution_authorized:false,credits_deducted:0,public_key_id:'fixture',
  payment_rail:'polygon_usdc',payment_network:'eip155:137',payment_facilitator:'dexter',
  payment_token_address:token,payment_amount_atomic:'100000',
  payer,payee,payment_nonce:nonce,metadata:{evidence_receipt_hash:evidence},
  generated_at:issued.toISOString(),verdict_expires_at:expires.toISOString()
 };
 const payment={x402Version:2,accepted:{scheme:'exact',network:'eip155:137',asset:token,
  payTo:payee,amount:'100000',maxTimeoutSeconds:120},
  payload:{authorization:{from:payer,to:payee,nonce,value:'100000'},signature:'FIXTURE_ONLY'}};
 return {request_id:req,request_hash:sha,subject:'USA',requested_tier:'basic',
  billed_tier:'basic',amount_atomic:'100000',network:'eip155:137',
  token_address:token,facilitator:'dexter',payer_address:payer,payee_address:payee,
  nonce,payment_hash:paymentHash,payment_payload:payment,
  canonical_payload:JSON.stringify(canonical),signature:'FIXTURE_ONLY',
  public_key_id:'fixture',scan_from_block:'10000',evidence_receipt_hash:evidence,
  verdict_issued_at:issued.toISOString(),verdict_expires_at:expires.toISOString(),...overrides};
}
function pool(){return new pg.Pool({connectionString:connection,max:12,
 ssl:process.env.PG_LOCAL==='true'?false:{rejectUnauthorized:true}})}
async function call(p,name,...args){
 const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');
 return (await p.query('SELECT geomacro.'+name+'('+placeholders+') AS result',args)).rows[0].result;
}
test('Postgres17 Polygon exact prepared intent with exclusive concurrency, idempotent receipt and no base collision',{
 skip:!connection},async()=>{
 const db=pool();
 try{
  const p=makeInput();
  await call(db,'polygon_x402_prepare',JSON.stringify(p));
  const attempts=await Promise.allSettled(Array.from({length:8},()=>call(db,'polygon_x402_claim',p.request_id,randomUUID())));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  for(const f of attempts.filter(x=>x.status==='rejected'))assert.match(f.reason.message,/PAYMENT_PROCESSING/);
  const claimed=attempts.find(x=>x.status==='fulfilled').value;
  assert.equal(claimed.state,'settling');
  const hash='0x'+'dd'.repeat(32);
  await call(db,'polygon_x402_note_tx',p.request_id,claimed.lease_token,hash);
  const result=await call(db,'polygon_x402_confirm',p.request_id,claimed.lease_token,hash,9);
  assert.equal(result.state,'confirmed');
  const duplicate=await call(db,'polygon_x402_confirm',p.request_id,randomUUID(),hash,9);
  assert.equal(duplicate.state,'confirmed');
  await assert.rejects(call(db,'polygon_x402_confirm',p.request_id,randomUUID(),hash,10),
    /TX_RECEIPT_CONFLICT/);
  const {rows:[receipt]}=await db.query(`SELECT u.rail,w.chain_id,w.token_address,w.log_index,
   (SELECT count(*)::integer FROM geomacro.audit_receipts WHERE request_id=$1) AS audit_count
   FROM geomacro.usage_logs u JOIN geomacro.web3_txs w USING (request_id)
   WHERE u.request_id=$1`,[p.request_id]);
  assert.equal(receipt.rail,'polygon_usdc');
  assert.equal(Number(receipt.chain_id),137);assert.equal(receipt.token_address,token);
  assert.equal(receipt.log_index,9);assert.equal(receipt.audit_count,1);
  await assert.rejects(call(db,'polygon_x402_prepare',JSON.stringify(makeInput({nonce}))),
    /duplicate key|unique constraint/);
  await assert.rejects(call(db,'x402_prepare',JSON.stringify({
   request_id:p.request_id,request_hash:'f'.repeat(64)
  })),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(db.query(`UPDATE geomacro.polygon_x402_intents SET payee_address=$1
   WHERE request_id=$2`,['0x'+'44'.repeat(20),p.request_id]),/POLYGON_INTENT_IMMUTABLE/);
 }finally{await db.end()}
});
test('Postgres17 fails closed on wrong Polygon provider, token, quote, or network and no public reads',{
 skip:!connection},async()=>{
 const db=pool();
 try{
  for(const override of [
   {facilitator:'xpay'}, {token_address:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'},
   {network:'eip155:8453'},{payee_address:'0x'+'44'.repeat(20)},
   {amount_atomic:'150000'},
   {verdict_expires_at:new Date(Date.now()-3600000).toISOString()},
  ]){
   const p=makeInput({...override,nonce:'0x'+randomUUID().replaceAll('-','').repeat(2)});
   await assert.rejects(call(db,'polygon_x402_prepare',JSON.stringify(p)));
  }
  const {rows:[rights]}=await db.query(`SELECT
   (SELECT relrowsecurity FROM pg_class WHERE oid='geomacro.polygon_x402_intents'::regclass) AS rls,
   has_table_privilege('anon','geomacro.polygon_x402_intents','SELECT') AS anonymous_read,
   has_table_privilege('authenticated','geomacro.polygon_x402_intents','INSERT') AS client_insert,
   has_table_privilege('service_role','geomacro.polygon_x402_intents','SELECT') AS service_read`);
  assert.equal(rights.rls,true);
  assert.equal(rights.anonymous_read,false);
  assert.equal(rights.client_insert,false);
  assert.equal(rights.service_read,false);
 }finally{await db.end()}
});
