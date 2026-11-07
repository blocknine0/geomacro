import test from 'node:test';
import assert from 'node:assert/strict';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeEventTopics,encodeAbiParameters,parseAbiParameters } from 'viem';
import { usdcAbi,NETWORK as BASE_NETWORK,USDC as BASE_USDC,requirements as baseRequirements,typedAuthorization } from '../src/payments/base.mjs';
import { POLYGON_NETWORK,POLYGON_NATIVE_USDC,DEXTER_URL,polygonRequirements,
 polygonTypedAuthorization,validatePolygonAuthorization,PolygonVerifier,DexterPolygonVerifier } from '../src/payments/polygon.mjs';

const account=privateKeyToAccount('0x'+'13'.repeat(32));
const recipient='0x'+'22'.repeat(20);
const amount='150000';
const expected=polygonRequirements(amount,recipient);
const now=2000000000;
async function signedPayment(options={}){
 const a={from:account.address,to:recipient,value:amount,validAfter:String(now-20),
  validBefore:String(now+100),nonce:'0x'+'11'.repeat(32),...options};
 const signature=await account.signTypedData(polygonTypedAuthorization(a));
 return {x402Version:2,accepted:{...expected},payload:{authorization:a,signature}};
}
const clone=globalThis.structuredClone;
test('Polygon native-USDC catalog and exact quote independent of Base',()=>{
 assert.equal(POLYGON_NETWORK,'eip155:137');
 assert.equal(POLYGON_NATIVE_USDC,'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359');
 assert.notEqual(POLYGON_NATIVE_USDC,BASE_USDC);
 assert.notEqual(POLYGON_NETWORK,BASE_NETWORK);
 assert.equal(expected.amount,amount);
 assert.equal(expected.asset,POLYGON_NATIVE_USDC);
 assert.equal(expected.extra.assetTransferMethod,'eip3009');
 assert.equal(polygonTypedAuthorization({from:account.address,to:recipient,value:amount,
  validAfter:'1',validBefore:'2',nonce:'0x'+'11'.repeat(32)}).domain.chainId,137);
 assert.throws(()=>polygonRequirements('0',recipient));
 assert.throws(()=>polygonRequirements(amount,'0x'+'00'.repeat(20)));
});
test('real EIP-712 Polygon typed-data payer recovery succeeds offline',async()=>{
 const p=await signedPayment();
 const verified=await validatePolygonAuthorization(p,expected,{now});
 assert.equal(verified.payer,account.address.toLowerCase());
 assert.equal(verified.nonce,p.payload.authorization.nonce);
});
test('Base, Amoy, bridged USDC and mismatched terms are rejected',async()=>{
 const p=await signedPayment();
 for(const change of [
  x=>x.accepted.network=BASE_NETWORK,
  x=>x.accepted.network='eip155:80002',
  x=>x.accepted.asset=BASE_USDC,
  x=>x.accepted.asset='0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  x=>x.accepted.amount='250000',
  x=>x.accepted.payTo='0x'+'33'.repeat(20),
  x=>x.accepted.scheme='upto',
  x=>x.accepted.extra.assetTransferMethod='permit2',
  x=>x.x402Version=1,
  x=>x.payload.authorization.to='0x'+'33'.repeat(20),
  x=>x.payload.authorization.value='250000'
 ]){
  const bad=clone(p);change(bad);
  await assert.rejects(validatePolygonAuthorization(bad,expected,{now}));
 }
});
test('malformed, expired and cross-chain signed authorizations fail closed',async()=>{
 const p=await signedPayment();
 const forged=clone(p);forged.payload.signature='0x'+'00'.repeat(65);
 await assert.rejects(validatePolygonAuthorization(forged,expected,{now}));
 const expired=await signedPayment({validBefore:String(now-10)});
 await assert.rejects(validatePolygonAuthorization(expired,expected,{now}));
 const future=await signedPayment({validAfter:String(now+10)});
 await assert.rejects(validatePolygonAuthorization(future,expected,{now}));
 const wrongNonce=clone(p);wrongNonce.payload.authorization.nonce='0xabc';
 await assert.rejects(validatePolygonAuthorization(wrongNonce,expected,{now}));
 const wrongSignature=clone(p);
 const baseTyped={...typedAuthorization(p.payload.authorization)};
 wrongSignature.payload.signature=await account.signTypedData(baseTyped);
 await assert.rejects(validatePolygonAuthorization(wrongSignature,expected,{now}));
});
test('Polygon RPC chain checks reject Base, Ethereum, Amoy, and used nonce',async()=>{
 for(const chain of [8453,1,80002]){
  const verifier=new PolygonVerifier({client:{getChainId:async()=>chain}});
  await assert.rejects(verifier.blockNumber(),/POLYGON_CHAIN_MISMATCH/);
 }
 const wrong=new PolygonVerifier({client:{getChainId:async()=>137,readContract:async()=>true}});
 await assert.rejects(wrong.verifyUnused((await signedPayment()).payload.authorization),/POLYGON_AUTHORIZATION_SPENT/);
 const clean=new PolygonVerifier({client:{getChainId:async()=>137,readContract:async()=>false}});
 await clean.verifyUnused((await signedPayment()).payload.authorization);
});
test('read-only nonce-log recovery binds Polygon USDC contract and payer',async()=>{
 const p=await signedPayment();
 const tx='0x'+'55'.repeat(32);
 const calls=[];
 const v=new PolygonVerifier({client:{getChainId:async()=>137,getBlockNumber:async()=>5000n,
  getLogs:async o=>{calls.push(o);return o.fromBlock===3000n?[{transactionHash:tx}]:[]}}});
 const result=await v.findAuthorization({scan_from_block:'1000',
  payer_address:account.address,nonce:p.payload.authorization.nonce});
 assert.equal(result,tx);
 assert.equal(calls.length,2);
 assert.equal(calls[0].address,POLYGON_NATIVE_USDC);
 assert.equal(calls[0].args.authorizer,account.address);
});
test('Polygon receipt requires authorization nonce and exact native-USDC transfer',async()=>{
 const payment=await signedPayment();
 const tx='0x'+'66'.repeat(32);
 const intent={payer_address:account.address.toLowerCase(),payee_address:recipient,
  nonce:payment.payload.authorization.nonce,amount_atomic:amount};
 const used={address:POLYGON_NATIVE_USDC,logIndex:2,data:'0x',
  topics:encodeEventTopics({abi:usdcAbi,eventName:'AuthorizationUsed',
   args:{authorizer:account.address,nonce:intent.nonce}})};
 const transfer={address:POLYGON_NATIVE_USDC,logIndex:3,
  data:encodeAbiParameters(parseAbiParameters('uint256'),[BigInt(amount)]),
  topics:encodeEventTopics({abi:usdcAbi,eventName:'Transfer',
   args:{from:account.address,to:recipient}})};
 const receipt={status:'success',transactionHash:tx,logs:[used,transfer]};
 const v=new PolygonVerifier({client:{getChainId:async()=>137,waitForTransactionReceipt:async()=>receipt}});
 assert.equal(await v.confirm(tx,intent),3);
 receipt.logs=[transfer];await assert.rejects(v.confirm(tx,intent),/POLYGON_PAYMENT_LOG_MISMATCH/);
 receipt.logs=[used,{...transfer,address:BASE_USDC}];
 await assert.rejects(v.confirm(tx,intent),/POLYGON_PAYMENT_LOG_MISMATCH/);
 receipt.logs=[used,{...transfer,data:encodeAbiParameters(parseAbiParameters('uint256'),[1n])}];
 await assert.rejects(v.confirm(tx,intent),/POLYGON_PAYMENT_LOG_MISMATCH/);
 receipt.status='reverted';await assert.rejects(v.confirm(tx,intent),/POLYGON_TX_NOT_SUCCESS/);
});
test('Dexter verification-only client does not expose settlement or broadcast',async()=>{
 const calls=[];
 const dexter=new DexterPolygonVerifier({fetchImpl:async(url,options)=>{
  calls.push({url,options,body:JSON.parse(options.body)});
  return Response.json({isValid:true,payer:account.address});
 }});
 assert.equal(typeof dexter.settle,'undefined');
 const p=await signedPayment({validAfter:String(Math.floor(Date.now()/1000)-3),
  validBefore:String(Math.floor(Date.now()/1000)+90)});
 const r=await dexter.verify(p,expected);
 assert.equal(r.isValid,true);
 assert.equal(r.network,POLYGON_NETWORK);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,DEXTER_URL+'/verify');
 assert.deepEqual(calls[0].body.paymentRequirements,expected);
 assert.equal(calls[0].body.x402Version,2);
 assert(calls.every(c=>c.url.endsWith('/verify')));
});
test('Dexter rejects invalid/mismatched verification response without settlement',async()=>{
 const p=await signedPayment({validAfter:String(Math.floor(Date.now()/1000)-3),
  validBefore:String(Math.floor(Date.now()/1000)+90)});
 for(const response of [{isValid:false},{isValid:true,payer:recipient},{isValid:'true'},{}]){
  const d=new DexterPolygonVerifier({fetchImpl:async()=>Response.json(response)});
  await assert.rejects(d.verify(p,expected),/DEXTER_VERIFICATION_INVALID/);
 }
 assert.throws(()=>new DexterPolygonVerifier({url:'https://facilitator.xpay.sh'}),
  /DEXTER_ENDPOINT_NOT_PINNED/);
 const d=new DexterPolygonVerifier({fetchImpl:async()=>Response.json({}, {status:429})});
 await assert.rejects(d.verify(p,expected),/DEXTER_VERIFY_UNAVAILABLE/);
});
