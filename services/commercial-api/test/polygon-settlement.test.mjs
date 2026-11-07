import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {privateKeyToAccount} from 'viem/accounts';
import {PolygonX402Engine,MultiChainX402Router} from '../src/payments/multichain.mjs';
import {X402Engine} from '../src/payments/x402.mjs';
import {PolygonVerifier,polygonTypedAuthorization,polygonRequirements,
 POLYGON_NETWORK,POLYGON_NATIVE_USDC,DexterPolygonFacilitator} from '../src/payments/polygon.mjs';
import {BaseVerifier,requirements as baseRequirements} from '../src/payments/base.mjs';
import {rpc} from '../src/payments/common.mjs';
const require=createRequire(import.meta.url),{prepareValue}=require('pg/lib/utils');
const db=new PGlite();
const pool={query:(sql,args)=>db.query(sql,args?.map(prepareValue))};
const query=async(sql,args=[])=> (await pool.query(sql,args)).rows;
const payee='0x95ba71d21c41bda8bba9533f96d25f793e4137b5';
const account=privateKeyToAccount('0x'+'0c'.repeat(32));
const keys=generateKeyPairSync('ed25519');
const origin='https://merchant.example';
const evidence='a'.repeat(64);
const resolver=async()=>({availableTiers:['basic','standard'],riskByTier:{
 basic:{decision:'review',risk_score:25,risk_score_kind:'INDICATIVE_UNVERIFIED_ACTIVITY_PROXY',
  factors:[{category:'MACRO_FX',observed_count:1}],confidence:'LOW',evidence_receipt_hash:evidence},
 standard:{decision:'review',risk_score:35,risk_score_kind:'CORROBORATED_RISK_SCORE',
  factors:[{category:'MACRO_FX',score:35}],confidence:'MEDIUM',evidence_receipt_hash:evidence}
}});
const input=()=>({request_id:randomUUID(),subject:'USA',tier:'standard'});
const encode=p=>Buffer.from(JSON.stringify(p),'utf8').toString('base64');
const observed=new Map();
let settlementCount=0,simulationCount=0,settlementTimeout=false;
const fakePolygon={
 async blockNumber(){return 105n},
 async findAuthorization(intent){return observed.get(intent.nonce)??null},
 async checkUnusedAndSimulate(auth){simulationCount++;assert.equal(auth.to.toLowerCase(),payee)},
 async confirm(hash,intent){
  assert.equal(hash,observed.get(intent.nonce));
  assert.equal(intent.chain_id,137);
  assert.equal(intent.token_address,POLYGON_NATIVE_USDC);
  return 8;
 },
};
const fakeDexter={
 async verify(p,expected){assert.equal(expected.network,POLYGON_NETWORK);return {isValid:true}},
 async settle(p,expected){settlementCount++;
  const nonce=p.payload.authorization.nonce;
  const hash='0x'+nonce.slice(2);
  observed.set(nonce,hash);
  if(settlementTimeout)throw Error('DEXTER_UNCERTAIN_ACK');
  return {success:true,network:POLYGON_NETWORK,transaction:hash,payer:p.payload.authorization.from.toLowerCase()};
 }
};
const polygon=new PolygonX402Engine({
 pool,payee,siteOrigin:origin,polygon:fakePolygon,facilitator:fakeDexter,
 resolveRisk:resolver,privateKey:keys.privateKey,publicKeyId:'fixture',
 publicKeys:{fixture:keys.publicKey},
});
const fakeBase={
 async blockNumber(){return 100n},async findAuthorization(){return null},
 async checkUnusedAndSimulate(){},async confirm(){throw Error('NO_BASE_FUNDS')}
};
const base=new X402Engine({pool,payee,siteOrigin:origin,base:fakeBase,
 facilitator:{async verify(){throw Error('NO_BASE_MONEY')},async settle(){throw Error('NO_BASE_MONEY')}},
 resolveRisk:resolver,privateKey:keys.privateKey,publicKeyId:'fixture',
 publicKeys:{fixture:keys.publicKey}});
const router=new MultiChainX402Router({pool,base,polygon});
async function paymentFor(i,amount=150000,override={}){
 const now=Math.floor(Date.now()/1000);
 const auth={from:account.address,to:payee,value:String(amount),validAfter:String(now-2),
  validBefore:String(now+110),nonce:'0x'+randomUUID().replaceAll('-','').repeat(2),...override};
 const signature=await account.signTypedData(polygonTypedAuthorization(auth));
 return {x402Version:2,resource:polygon.resource(i),
  accepted:polygonRequirements(amount,payee),payload:{signature,authorization:auth}};
}
before(async()=>{
 for(const file of ['schema.sql','functions.sql','payments.sql','replay-ownership.sql','polygon-settlement-ready.sql']){
  await db.exec(await readFile(new URL('../sql/'+file,import.meta.url),'utf8'));
 }
});
after(()=>db.close());

test('dual rail challenge is v2 and immutable network/token tuple before signing',async()=>{
 const response=await router.handle(input(),null);
 assert.equal(response.status,402);
 const header=JSON.parse(Buffer.from(response.headers.get('PAYMENT-REQUIRED'),'base64').toString());
 assert.equal(header.accepts.length,2);
 assert.deepEqual(header.accepts.map(x=>x.network),['eip155:8453','eip155:137']);
 assert.equal(header.accepts[1].asset,POLYGON_NATIVE_USDC);
 assert.equal(header.accepts[1].payTo,payee);
 assert.equal(settlementCount,0);
});
test('Polygon signed authorization, prepared lease, confirmed receipt and exact replay',async()=>{
 const i=input(),p=await paymentFor(i),start=settlementCount;
 const response=await router.handle(i,encode(p));
 assert.equal(response.status,200);
 assert.equal(settlementCount,start+1);
 const signed=await response.json();
 assert.equal(signed.payment_network,POLYGON_NETWORK);
 assert.equal(signed.payment_facilitator,'dexter');
 assert.equal(signed.payment_token_address,POLYGON_NATIVE_USDC);
 assert.equal(signed.payment_rail,'polygon_usdc');
 assert.equal(signed.execution_authorized,false);
 assert.equal(signed.metadata.evidence_receipt_hash,evidence);
 assert.equal(new Date(signed.verdict_expires_at).getTime()-new Date(signed.generated_at).getTime(),3*3600000);
 const persisted=await rpc(pool,'polygon_x402_get',[i.request_id]);
 assert.equal(persisted.facilitator,'dexter');assert.equal(persisted.state,'confirmed');
 assert.equal(persisted.tx_hash,p.payload.authorization.nonce);
 assert.equal((await query('SELECT rail FROM geomacro.usage_logs WHERE request_id=$1',[i.request_id]))[0].rail,'polygon_usdc');
 const chain=(await query('SELECT chain_id,token_address,log_index FROM geomacro.web3_txs WHERE request_id=$1',[i.request_id]))[0];
 assert.equal(Number(chain.chain_id),137);assert.equal(chain.token_address,POLYGON_NATIVE_USDC);
 assert.equal(chain.log_index,8);
 const retry=await router.handle(i,encode(p));
 assert.equal(retry.status,200);
 assert.deepEqual(await retry.json(),signed);
 assert.equal(settlementCount,start+1);
});
test('crossrail replay, same-chain nonce reuse, wrong asset and user changes cannot charge',async()=>{
 const i=input(),p=await paymentFor(i),beforeSettles=settlementCount;
 const bridge=structuredClone(p);bridge.accepted.asset='0x2791bca1f2de4661ed88a30c99a7a9449aa84174';
 await assert.rejects(router.handle(i,encode(bridge)),/POLYGON_PAYMENT_TERMS_MISMATCH/);
 assert.equal(await rpc(pool,'polygon_x402_get',[i.request_id]),null);
 assert.equal(settlementCount,beforeSettles);
 const exact=await router.handle(i,encode(p));assert.equal(exact.status,200);
 const other=input();const copy=structuredClone(p);copy.resource=polygon.resource(other);
 await assert.rejects(router.handle(other,encode(copy)),/unique constraint|duplicate key/i);
 const baseAttempt=structuredClone(p);baseAttempt.accepted=baseRequirements(150000,payee);
 await assert.rejects(router.handle(i,encode(baseAttempt)),/PAYMENT_REPLAY_CONFLICT/);
 assert.equal(settlementCount,beforeSettles+1);
});
test('after facilitator lost ACK, only same nonce is recovered; no second settlement',async()=>{
 const i=input(),p=await paymentFor(i),beforeSettles=settlementCount;
 settlementTimeout=true;
 try{await assert.rejects(router.handle(i,encode(p)),/DEXTER_UNCERTAIN_ACK/)}
 finally{settlementTimeout=false;}
 const state=await rpc(pool,'polygon_x402_get',[i.request_id]);
 assert.equal(state.state,'settling');
 await query("UPDATE geomacro.polygon_x402_intents SET lease_until=now()-interval '1 second' WHERE request_id=$1",[i.request_id]);
 const done=await router.handle(i,encode(p));
 assert.equal(done.status,200);
 assert.equal(settlementCount,beforeSettles+1);
});
test('no charge with unavailable qualified evidence on either rail',async()=>{
 const deny=async()=>({availableTiers:[],riskByTier:{}});
 const e=new PolygonX402Engine({...polygon,polygon:fakePolygon,resolveRisk:deny});
 const beforeSettles=settlementCount;
 await assert.rejects(e.handle(input(),null),/INCONCLUSIVE_NO_CHARGE/);
 assert.equal(settlementCount,beforeSettles);
});
test('Dexter fail closed for unsupported settle and contradictory results with no tx accepted',async()=>{
 const i=input(),p=await paymentFor(i);
 const cases=[
  {success:false,network:POLYGON_NETWORK,payer:account.address,transaction:'0x'+'66'.repeat(32)},
  {success:true,network:'eip155:8453',payer:account.address,transaction:'0x'+'66'.repeat(32)},
  {success:true,network:POLYGON_NETWORK,payer:payee,transaction:'0x'+'66'.repeat(32)},
  {success:true,network:POLYGON_NETWORK,payer:account.address,transaction:'not-hash'},
  {success:true,errorReason:'mismatch',network:POLYGON_NETWORK,payer:account.address,transaction:'0x'+'66'.repeat(32)}
 ];
 for(const result of cases){
  const d=new DexterPolygonFacilitator({fetchImpl:async()=>Response.json(result)});
  await assert.rejects(d.settle(p,polygonRequirements(150000,payee)),/DEXTER_SETTLEMENT_NOT_PROVEN/);
 }
});
