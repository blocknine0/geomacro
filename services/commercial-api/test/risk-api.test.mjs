import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {randomUUID,generateKeyPairSync} from 'node:crypto';
import {SupabaseRpcPool} from '../src/payments/rpc-http.mjs';
import {mintApiKey,verifyReceipt,canonicalize,hash,apiKeyHash} from '../src/metering.mjs';
import {admitQualifiedProduct,createQualifiedRiskResolver} from '../src/qualified-risk.mjs';
import {creditRiskGate,createRiskApi} from '../src/risk-api.mjs';
import {parseRiskRequest,CASH_ATOMIC,TIER_NAMES} from '../src/risk-contract.mjs';
import {PaymentError} from '../src/payments/common.mjs';
const db=new PGlite(),user=randomUUID();const {privateKey,publicKey}=generateKeyPairSync('ed25519');
let rpcCalls=0;
const pool=new SupabaseRpcPool({url:'https://fixture.supabase.co',key:'sb_secret_FIXTURE_ONLY',fetchImpl:async(_u,options)=>{
 rpcCalls++;const {p_operation,p_args}=JSON.parse(options.body);
 try{const result=(await db.query('SELECT public.geomacro_commercial_rpc($1,$2::jsonb) AS result',[p_operation,JSON.stringify(p_args)])).rows[0].result;
 return Response.json(result);}catch(e){return Response.json({message:e.message},{status:400});}
}});
const api=mintApiKey(),publicKeys={'test-key':publicKey};
const input=()=>({request_id:randomUUID(),subject:'USA',tier:'complex'});
let resolutions=0;
const resolveRisk=async()=>{resolutions++;return {availableTiers:['standard'],riskByTier:{standard:{decision:'review',risk_score:43,
 factors:[{category:'MACRO_FX',score:43}],risk_score_kind:'CORROBORATED_RISK_SCORE',confidence:'MEDIUM',
 data_as_of:new Date().toISOString(),evidence_receipt_hash:'a'.repeat(64)}}};};
const baseArgs=i=>({pool,input:i,apiKey:api.secret,resolveRisk,privateKey,publicKeyId:'test-key',publicKeys});
const balance=async()=>Number((await db.query('SELECT balance_units FROM geomacro.users WHERE id=$1',[user])).rows[0].balance_units);
function productFixture(tier='standard'){
 const now=new Date().toISOString();return {ok:true,execution_authorized:false,audit_receipt_hash:'a'.repeat(64),
 client_policy_decision:'GATE_PASS',flash_check_available:true,intraday_override:false,tiered_product:{
 schema:'geomacro.risk-gate-commercial-three-tier.v1',tier:{basic:'BASIC_FOCUSED',standard:'STANDARD',complex:'COMPLEX_FULL'}[tier],risk_score_kind:tier==='complex'?'PROPRIETARY_INSTITUTIONAL_SIGNED_SCORE':'CORROBORATED_RISK_SCORE',subject:{type:'COUNTRY',id:'USA'},evaluated_at:now,
 execution_authorized:false,price:{usdc_atomic_at_1_usdc_per_usd:String(CASH_ATOMIC[tier])},status:'READY',chargeable:true,
 risk_score_0_100:43,independent_corroboration_verified:true,confidence:{level:'MEDIUM',verification:'VERIFIED'},
 category_fact_sheets:['GEOPOLITICS','MACRO_FX','CRITICAL_MINERALS'].map(category=>({category,verified_category_score_0_100:43,evidence_status:'VERIFIED_CORROBORATED'})),
 source_references:[{source_host:'PRIVATE_FIXTURE_NEVER_PUBLIC',article_text:'NOT_FOR_PUBLIC'}]}};
}
before(async()=>{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 for(const f of ['schema.sql','functions.sql','payments.sql','replay-ownership.sql','risk-api.sql','rpc-gateway.sql'])
 await db.exec(await readFile(new URL(`../sql/${f}`,import.meta.url),'utf8'));
 await pool.call('provision_user',[user,'fixture@example.test']);
 await pool.call('create_api_key',[user,api.hash,api.prefix,'fixture']);
 await db.query("SELECT geomacro.top_up($1,'paypal_capture','fixture-payment',1000000000)",[user]);
});
after(()=>db.close());
test('request contract rejects injected pricing/unsupported subjects and accepts registered corridors',()=>{
 assert.throws(()=>parseRiskRequest({...input(),price:0}),/INVALID_RISK_REQUEST/);
 assert.throws(()=>parseRiskRequest({...input(),subject:'TWN'}),/COUNTRY_OUTSIDE_HOT50_SCOPE/);
 assert.equal(parseRiskRequest({...input(),subject:'hormuz'}).subject,'hormuz');
 assert.throws(()=>parseRiskRequest({...input(),tier:'enterprise'}),/INVALID_TIER/);
});
test('prepaid complex request bills only standard; signed hash covers decision, metadata and billing',async()=>{
 const i=input(),start=await balance(),r=await creditRiskGate(baseArgs(i));assert.equal(r.status,200);
 const body=await r.json();assert.equal(body.billed_tier,'standard');assert.equal(body.credits_deducted,15);
 assert.equal(body.execution_authorized,false);assert.equal(body.metadata.certified_risk_index,false);
 assert.equal(await balance(),start-15000000);
 const {audit_receipt,...payload}=body;assert(verifyReceipt(canonicalize(payload),audit_receipt,publicKey));
 assert(!verifyReceipt(canonicalize({...payload,risk_score:0}),audit_receipt,publicKey));
 assert(!verifyReceipt(canonicalize({...payload,credits_deducted:25}),audit_receipt,publicKey));
});
test('receipt replay needs no fresh intelligence and makes no second deduction',async()=>{
 const i=input(),first=await creditRiskGate(baseArgs(i)),original=await first.text(),start=await balance(),count=resolutions;
 const replay=await creditRiskGate({...baseArgs(i),resolveRisk:async()=>{throw Error('MUST_NOT_RESOLVE_REPLAY');}});
 assert.equal(await replay.text(),original);assert.equal(replay.headers.get('Idempotency-Replayed'),'true');
 assert.equal(await balance(),start);assert.equal(resolutions,count);
});
test('inconclusive and signing mismatch failures debit zero',async()=>{
 const start=await balance();await assert.rejects(creditRiskGate({...baseArgs(input()),resolveRisk:async()=>{throw new PaymentError('INCONCLUSIVE_NO_CHARGE');}}));
 const other=generateKeyPairSync('ed25519').publicKey;
 await assert.rejects(creditRiskGate({...baseArgs(input()),publicKeys:{'test-key':other}}),/SIGNATURE_VERIFICATION_FAILED/);
 assert.equal(await balance(),start);
});
test('unknown API key fails before evidence access',async()=>{
 const count=resolutions;await assert.rejects(creditRiskGate({...baseArgs(input()),apiKey:mintApiKey().secret}),/KEY_UNAVAILABLE/);
 assert.equal(resolutions,count);
});
test('basic metadata cannot masquerade as a verified index; source identities are redacted',()=>{
 const data=productFixture('basic'),p=data.tiered_product;
 p.risk_score_kind='INDICATIVE_UNVERIFIED_ACTIVITY_PROXY';p.confidence={level:'LOW',verification:'PROVISIONAL'};
 p.signal_alerts=[{title_sha256:'b'.repeat(64),observed_at:new Date().toISOString()}];
 p.category_observations=[{category:'GEOPOLITICS',observed_count:1}];
 const result=admitQualifiedProduct(data,{subject:'USA',tier:'basic'});
 assert.equal(result.decision,'review');assert.equal(result.risk_score_kind,'INDICATIVE_UNVERIFIED_ACTIVITY_PROXY');
 assert(!JSON.stringify(result).includes('PRIVATE_FIXTURE_NEVER_PUBLIC'));
 p.confidence.verification='CRYPTO_SIGNED';assert.throws(()=>admitQualifiedProduct(data,{subject:'USA',tier:'basic'}),/BASIC_EVIDENCE_INVALID/);
});
test('resolver downgrades using existing qualified products and caches only admitted evidence',async()=>{
 let fetches=0;
 const resolver=createQualifiedRiskResolver({origin:'https://api.geomacro.live',token:'a'.repeat(64),fetchImpl:async(_url,o)=>{
  assert.equal(_url,'https://api.geomacro.live/v1/risk-gate/unified/evaluate');
  fetches++;assert.equal(o.redirect,'manual');const tier=JSON.parse(o.body).product_tier;
  const data=productFixture(tier==='complex_full'?'complex':'standard');
  if(tier==='complex_full'){data.tiered_product.status='SIGNED_GRO_OR_ARCHIVE_NOT_READY';data.tiered_product.chargeable=false;}
  return Response.json(data);
 }});
 const first=await resolver({subject:'USA',tier:'complex'});assert.deepEqual(first.availableTiers,['standard']);assert.equal(fetches,2);
 const next=await resolver({subject:'USA',tier:'complex'});assert.equal(next.riskByTier.standard.cache_status,'HIT');assert.equal(fetches,2);
 assert(!JSON.stringify(next).includes('PRIVATE_FIXTURE_NEVER_PUBLIC'));
});
test('expired, wrong-subject or incomplete complex evidence cannot become billable',()=>{
 const data=productFixture('complex');data.tiered_product.confidence.verification='CRYPTO_SIGNED';assert.throws(()=>admitQualifiedProduct(data,{subject:'USA',tier:'complex'}),/COMPLEX_PROOF_INCOMPLETE/);
 data.tiered_product.subject.id='IND';assert.throws(()=>admitQualifiedProduct(data,{subject:'USA',tier:'complex'}),/CONTRACT_INVALID/);
 const stale=productFixture();stale.tiered_product.evaluated_at='2000-01-01T00:00:00Z';
 assert.throws(()=>admitQualifiedProduct(stale,{subject:'USA',tier:'standard'}),/STALE/);
});
test('HTTP accepts only one rail and always returns execution_authorized false',async()=>{
 const runtime={pool,privateKey,publicKey,publicKeyId:'test-key',publicKeys,resolveRisk,launched:true,
 authenticate:async()=>({id:user,email:'fixture@example.test',email_confirmed_at:new Date().toISOString()})};
 const app=createRiskApi(runtime,{SITE_ORIGIN:'https://geomacro.live',PUBLIC_API_ORIGIN:'https://api.geomacro.live'});
 const r=await app(new Request('https://api.geomacro.live/v1/risk-gate',{method:'POST',headers:{'Content-Type':'application/json',
 Authorization:`Bearer ${api.secret}`,'PAYMENT-SIGNATURE':'anything'},body:JSON.stringify(input())}));
 assert.equal(r.status,400);assert.equal((await r.json()).execution_authorized,false);
 runtime.launched=false;
 const blocked=await app(new Request('https://api.geomacro.live/v1/risk-gate',{method:'POST',headers:{'Content-Type':'application/json',
 Authorization:`Bearer ${api.secret}`},body:JSON.stringify(input())}));assert.equal(blocked.status,423);
});
test('key issuance works through real typed RPC aliases; only masked metadata is listed; revocation is enforced',async()=>{
 const runtime={pool,privateKey,publicKey,publicKeyId:'test-key',publicKeys,resolveRisk,launched:true,
 authenticate:async()=>({id:user,email:'fixture@example.test',email_confirmed_at:new Date().toISOString()})};
 const app=createRiskApi(runtime,{SITE_ORIGIN:'https://geomacro.live'}),url='https://api.geomacro.live/v1/api-keys';
 const r=await app(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:'API fixture'})}));
 assert.equal(r.status,201);const key=await r.json();assert.match(key.api_key,/^gm_live2_[A-Za-z0-9_-]{43}$/);
 const listed=await (await app(new Request(url))).json();assert(listed.keys.some(k=>k.id===key.id));
 assert(!JSON.stringify(listed).includes(key.api_key));assert(!JSON.stringify(listed).includes(apiKeyHash(key.api_key)));
 const revoked=await app(new Request(`${url}/${key.id}/revoke`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
 assert.equal(revoked.status,200);
 await assert.rejects(pool.call('authorize_credit_key',[apiKeyHash(key.api_key)]),/KEY_UNAVAILABLE/);
});
test('database-backed API rate limit denies excess calls without any debit',async()=>{
 const key=mintApiKey();const id=await pool.call('create_api_key',[user,key.hash,key.prefix,'rate test']);
 await db.query('UPDATE geomacro.api_keys SET rate_limit_per_minute=2 WHERE id=$1',[id]);const start=await balance();
 await pool.call('authorize_credit_key',[key.hash]);await pool.call('authorize_credit_key',[key.hash]);
 await assert.rejects(pool.call('authorize_credit_key',[key.hash]),e=>e.code==='RATE_LIMIT_EXCEEDED'&&e.status===429);
 assert.equal(await balance(),start);
});

test('lost settlement acknowledgement reports unknown outcome and same-ID retry replays without another debit',async()=>{
 const i=input(),start=await balance();
 const uncertain={call:async(name,args)=>{const value=await pool.call(name,args);
  if(name==='settle_success')throw new PaymentError('COMMERCIAL_LEDGER_UNAVAILABLE');return value;}};
 await assert.rejects(creditRiskGate({...baseArgs(i),pool:uncertain}),/SETTLEMENT_OUTCOME_UNKNOWN_RETRY_SAME_ID/);
 assert.equal(await balance(),start-15000000);
 const recovered=await creditRiskGate(baseArgs(i));assert.equal(recovered.status,200);
 assert.equal(recovered.headers.get('Idempotency-Replayed'),'true');assert.equal(await balance(),start-15000000);
});

test('prepaid identity cannot replay accountless usage with nullable account fields',async()=>{
 const i=input(),requestHash=hash(canonicalize({method:'POST',path:'/v1/risk-gate',subject:i.subject,tier:i.tier}));
 await db.query(`INSERT INTO geomacro.usage_logs(request_id,request_hash,subject,requested_tier,billed_tier,rail,state,http_status,usd_micros)
 VALUES($1,$2,'USA','complex','standard','base_usdc','succeeded',200,150000)`,[i.request_id,requestHash]);
 await assert.rejects(creditRiskGate(baseArgs(i)),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('accountless intent cannot claim a request already settled using prepaid credits',async()=>{
 const i=input();await creditRiskGate(baseArgs(i));
 await assert.rejects(pool.call('x402_prepare',[JSON.stringify({request_id:i.request_id})]),e=>e.code==='IDEMPOTENCY_CONFLICT');
});

test('edge cache never serves an expired signed GRO as an available complex tier',async()=>{
 const realNow=Date.now;let clock=realNow(),fetches=0;Date.now=()=>clock;
 try{
  const complex=productFixture('complex');complex.tiered_product.confidence.verification='CRYPTO_SIGNED';
  Object.assign(complex.tiered_product,{gro_signature:{scheme:'Ed25519',payload_sha256:'c'.repeat(64),
   generated_at:new Date(clock-1000).toISOString(),expires_at:new Date(clock+1000).toISOString()},
   b2_archive:{archive_sha256:'d'.repeat(64)},seven_day_verified_subject_history:{verified_score_days:7}});
  const resolver=createQualifiedRiskResolver({origin:'https://api.geomacro.live',token:'a'.repeat(64),fetchImpl:async(_url,o)=>{
   fetches++;const tier=JSON.parse(o.body).product_tier;
   if(tier==='complex_full'){
    const body=structuredClone(complex);if(fetches>1){body.tiered_product.status='EXPIRED';body.tiered_product.chargeable=false;}
    return Response.json(body);
   }
   return Response.json(productFixture('standard'));
  }});
  assert.deepEqual((await resolver({subject:'USA',tier:'complex'})).availableTiers,['complex']);
  clock+=2000;
  assert.deepEqual((await resolver({subject:'USA',tier:'complex'})).availableTiers,['standard']);
  assert.equal(fetches,3);
 }finally{Date.now=realNow;}
});
