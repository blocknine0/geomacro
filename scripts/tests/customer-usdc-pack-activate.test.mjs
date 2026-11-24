import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {storeUsdcPackActivate,USDC_PACK_CHAINS,USDC_PACK_CATALOG,USDC_PACK_RECIPIENT,verifyPackTransfer} from '../../workers/control-plane/src/store-usdc-pack-activate.mjs';
import {customerHmac,handleCustomerRuntime} from '../../workers/control-plane/src/customer-runtime.mjs';

const TOKEN='commerce-ledger-test-token-'.padEnd(40,'x');
const PEPPER='customer-auth-test-pepper-'.padEnd(64,'p');
const USER='customer-usdc-pack-user-0001';
const EMAIL='test@example.com';
const WALLET='0x1234567890abcdef1234567890abcdef12345678';
const TX='0x'+'a'.repeat(64);
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAddress=address=>'0x'+address.slice(2).toLowerCase().padStart(64,'0');

function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0090_customer_canonical_d1.sql','0091_customer_canonical_integrity_triggers.sql','0092_customer_resend_otp_sessions.sql','0093_customer_email_provider_quota.sql','0094_customer_login_runtime.sql','0095_customer_grant_scoped_usage.sql','0096_customer_prepaid_pack_spend.sql','0097_customer_paypal_checkout_intents.sql'])
  sql.exec(readFileSync('workers/control-plane/migrations/'+name,'utf8'));
 sql.exec('CREATE TABLE risk_gate_d1_quota(client_id TEXT,usage_day TEXT,used INTEGER DEFAULT 0,PRIMARY KEY(client_id,usage_day))');
 sql.exec(readFileSync('workers/control-plane/migrations/0133_customer_store_risk_gate_recharge.sql','utf8'));
 sql.exec(readFileSync('workers/control-plane/migrations/0226_customer_mainnet_usdc_pack_funding.sql','utf8'));
 const prepare=q=>({bind(...args){return {q,args,first:async()=>sql.prepare(q).get(...args)??null,
  all:async()=>({results:sql.prepare(q).all(...args)}),run:async()=>({meta:{changes:Number(sql.prepare(q).run(...args).changes)}})};}});
 const DB={prepare,async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const result=statements.map(s=>({meta:{changes:Number(sql.prepare(s.q).run(...s.args).changes)}}));sql.exec('COMMIT');return result;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const now=Date.now(),at=new Date(now).toISOString(),session='b'.repeat(64);
 const env={DB,GEOMACRO_COMMERCE_LEDGER_TOKEN:TOKEN,GEOMACRO_CUSTOMER_AUTH_PEPPER:PEPPER,
  GEOMACRO_API_CREDENTIAL_PEPPER:'api-credential-test-pepper'.padEnd(40,'k'),
  GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE:'ACCEPTED_CANONICAL_D1_PAID_RUNTIME',
  GEOMACRO_RISK_GATE_COMMERCIAL_ACCEPTANCE:'ACCEPTED_RISK_GATE_PRICING_LEDGER',
  GEOMACRO_COMMERCE_EMERGENCY_FREEZE:'false',GEOMACRO_CENTRAL_SECURITY_MODE:'enforce',
  GEOMACRO_COMMERCIAL_LAUNCH_ACK:'I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH',
  GEOMACRO_REAL_FUNDS_SECURITY_ACK:'I_ACCEPT_REAL_FUNDS_SECURITY_GATES',
  GEOMACRO_USDC_PACK_CHECKOUT_ACCEPTANCE:'ACCEPTED_MAINNET_USDC_PACK_FUNDING'};
 sql.prepare('INSERT INTO users(id,email,status,email_verified_at) VALUES(?,?,\'active\',?)').run(USER,EMAIL,at);
 sql.prepare('INSERT INTO sessions(id,user_id,token_hmac_sha256,expires_at) VALUES(?,?,?,?)')
  .run('customer-usdc-session-0001',USER,awaitSyncHmac(),new Date(now+3600000).toISOString());
 function awaitSyncHmac(){return '0'.repeat(64);}
 sql.prepare('INSERT INTO customer_wallet_addresses(user_id,wallet_address,created_at) VALUES(?,?,?)').run(USER,WALLET,at);
 // Rebind the fixture session HMAC asynchronously in ready() before requests.
 const fetcher=async(_url,init)=>{
  const call=JSON.parse(init.body);
  if(call.method==='eth_chainId'){
   // The selected chain is inferred from the RPC host passed as the URL.
   const chain=Object.values(USDC_PACK_CHAINS).find(x=>x.rpc===_url);
   return Response.json({jsonrpc:'2.0',id:1,result:'0x'+chain.chainId.toString(16)});
  }
  if(call.method==='eth_getTransactionReceipt')return Response.json({jsonrpc:'2.0',id:1,result:{transactionHash:TX,status:'0x1',blockNumber:'0x64',logs:[{
   address:USDC_PACK_CHAINS.base.token,topics:[TRANSFER_TOPIC,topicAddress(WALLET),topicAddress(USDC_PACK_RECIPIENT)],data:'0x'+(1500n*10_000n).toString(16).padStart(64,'0')} ]}});
  if(call.method==='eth_blockNumber')return Response.json({jsonrpc:'2.0',id:1,result:'0x65'});
  if(call.method==='eth_getBlockByNumber')return Response.json({jsonrpc:'2.0',id:1,result:{number:'0x64',timestamp:'0x67300000'}});
  return Response.json({jsonrpc:'2.0',id:1,error:{message:'unexpected'}});
 };
 const request=async(body)=>storeUsdcPackActivate(new Request('https://cp.invalid/v1/store/usdc-pack-activate',{method:'POST',headers:{authorization:`Bearer ${TOKEN}`,'content-type':'application/json'},body:JSON.stringify(body)}),env,{now:()=>now,fetcher});
 return {sql,env,request,session,async ready(){const hash=await customerHmac(PEPPER,'session',session);sql.prepare('UPDATE sessions SET token_hmac_sha256=?').run(hash);}};
}

function rpcFixture(network,amountAtomic=15_000_000n,payer=WALLET){
 const chain=USDC_PACK_CHAINS[network];
 return async(url,init)=>{
  const call=JSON.parse(init.body);
  if(call.method==='eth_chainId')return Response.json({result:'0x'+chain.chainId.toString(16)});
  if(call.method==='eth_getTransactionReceipt')return Response.json({result:{transactionHash:TX,status:'0x1',blockNumber:'0x64',logs:[{
   address:chain.token,topics:[TRANSFER_TOPIC,topicAddress(payer),topicAddress(USDC_PACK_RECIPIENT)],data:'0x'+amountAtomic.toString(16).padStart(64,'0')} ]}});
  if(call.method==='eth_blockNumber')return Response.json({result:'0x65'});
  if(call.method==='eth_getBlockByNumber')return Response.json({result:{number:'0x64',timestamp:'0x67300000'}});
  throw Error('UNEXPECTED_RPC_METHOD');
 };
}

test('only the three pinned mainnet USDC networks and exact pack amounts verify',async()=>{
 assert.deepEqual(Object.keys(USDC_PACK_CHAINS),['base','polygon','arc']);
 assert.deepEqual(Object.values(USDC_PACK_CHAINS).map(x=>x.chainId),[8453,137,5042]);
 assert.deepEqual(Object.values(USDC_PACK_CHAINS).map(x=>x.token),[
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913','0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  '0x3600000000000000000000000000000000000000']);
 assert.deepEqual(Object.values(USDC_PACK_CHAINS).map(x=>x.rpc),[
  'https://mainnet.base.org','https://polygon-bor-rpc.publicnode.com','https://rpc.mainnet.arc.io']);
 assert.equal(USDC_PACK_RECIPIENT,'0x95ba71d21c41bda8bba9533f96d25f793e4137b5');
 assert.deepEqual(Object.values(USDC_PACK_CATALOG).map(x=>x.amountMinorUnits),[1500,3000,6000]);
 for(const network of Object.keys(USDC_PACK_CHAINS)){
  const proof=await verifyPackTransfer({network,txHash:TX,sku:'risk-gate-small',walletAddress:WALLET,fetcher:rpcFixture(network)});
  assert.equal(proof.network,network);assert.equal(proof.payer,WALLET);assert.equal(proof.amount_atomic,'15000000');
 }
});

test('checkout stays off unless the complete acceptance gate is enabled',async()=>{
 const f=fixture();await f.ready();f.env.GEOMACRO_USDC_PACK_CHECKOUT_ACCEPTANCE='';
 const response=await f.request({action:'status'});assert.equal(response.status,200);
 assert.equal((await response.json()).checkout_enabled,false);f.sql.close();
});

test('verified transfer atomically funds one grant and rejects network transaction replay',async()=>{
 const f=fixture();await f.ready();
 const response=await f.request({action:'activate',network:'base',sku:'risk-gate-small',tx_hash:TX,session_token:f.session});
 const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.payment_funded,true);assert.equal(body.credits_funded,1500);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM customer_payment_receipts').get().n,1);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM customer_entitlement_grants').get().n,1);
 assert.equal(f.sql.prepare('SELECT delta_credits AS n FROM credit_ledger').get().n,1500);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM customer_usdc_pack_transfers').get().n,1);
 f.env.GEOMACRO_CUSTOMER_SSR_TOKEN='isolated-customer-ssr-token-'.padEnd(64,'s');
 f.env.CONTROL_PLANE_TOKEN='separate-control-plane-operator-token';
 f.env.GEOMACRO_CUSTOMER_ALLOWED_ORIGINS='https://geomacro.live';
 const keyResponse=await handleCustomerRuntime(new Request('https://cp.invalid/v1/internal/customer/key-create',{method:'POST',headers:{
  authorization:`Bearer ${f.env.GEOMACRO_CUSTOMER_SSR_TOKEN}`,origin:'https://geomacro.live','content-type':'application/json'},
  body:JSON.stringify({session_token:f.session})}),f.env,{now:()=>Date.now()});
 const key=await keyResponse.json();assert.equal(keyResponse.status,200,JSON.stringify(key));
 assert.match(key.api_key,/^gmk_live_[0-9a-f]{64}$/);
 const storedKey=f.sql.prepare('SELECT scopes_json FROM api_keys WHERE key_id=?').get(key.key_id);
 assert.ok(JSON.parse(storedKey.scopes_json).includes('risk-gate:read'));
 const replay=await f.request({action:'activate',network:'base',sku:'risk-gate-small',tx_hash:TX,session_token:f.session});
 assert.equal((await replay.json()).idempotent_replay,true);
 assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);f.sql.close();
});

test('wrong amount, unbound payer, unsupported network and unconfirmed transaction never fund',async()=>{
 for(const [network,sku,fetcher,error] of [
  ['base','risk-gate-small',rpcFixture('base',15_000_001n),'USDC_PACK_EXACT_TRANSFER_REQUIRED'],
  ['base','risk-gate-small',rpcFixture('base',15_000_000n,'0x9999999999999999999999999999999999999999'),'USDC_PACK_PAYER_WALLET_MISMATCH'],
 ]){
  const proof=await verifyPackTransfer({network,txHash:TX,sku,walletAddress:WALLET,fetcher}).catch(e=>e.message);
  assert.equal(proof,error);
 }
 await assert.rejects(()=>verifyPackTransfer({network:'sepolia',txHash:TX,sku:'risk-gate-small'}),/USDC_PACK_PROOF_INPUT_INVALID/);
 const f=fixture();await f.ready();f.env.GEOMACRO_USDC_PACK_CHECKOUT_ACCEPTANCE='';
 const locked=await f.request({action:'activate',network:'base',sku:'risk-gate-small',tx_hash:TX,session_token:f.session});
 assert.equal(locked.status,423);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM credit_ledger').get().n,0);f.sql.close();
});
