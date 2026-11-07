/** Polygon native-USDC verification utilities. NO settlement or broadcasting.
 * Not wired into the production Worker or commercial SQL ledger.
 */
import { createPublicClient,http,recoverTypedDataAddress,decodeEventLog } from 'viem';
import { polygon } from 'viem/chains';
import { PaymentError,requireValue,readJsonResponse } from './common.mjs';
import { authorizationTypes,usdcAbi } from './base.mjs';

export const POLYGON_NETWORK='eip155:137';
export const POLYGON_CHAIN_ID=137;
export const POLYGON_NATIVE_USDC='0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
export const DEXTER_URL='https://x402.dexter.cash';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/u;
const SIGNATURE=/^0x[0-9a-fA-F]{130}$/u;
const NONCE=/^0x[0-9a-fA-F]{64}$/u;
const HASH=/^0x[0-9a-fA-F]{64}$/u;
const money=/^[1-9][0-9]{0,11}$/u;

export function polygonRequirements(amount,payee){
 requireValue(money.test(String(amount))&&ADDRESS.test(payee)&&
  payee.toLowerCase()!=='0x'+'0'.repeat(40),'POLYGON_BAD_PAYMENT_REQUIREMENTS',500);
 return {scheme:'exact',network:POLYGON_NETWORK,amount:String(amount),
  asset:POLYGON_NATIVE_USDC,payTo:payee.toLowerCase(),maxTimeoutSeconds:120,
  extra:{name:'USD Coin',version:'2',assetTransferMethod:'eip3009'}};
}
export function polygonTypedAuthorization(auth){
 return {domain:{name:'USD Coin',version:'2',chainId:POLYGON_CHAIN_ID,
  verifyingContract:POLYGON_NATIVE_USDC},types:authorizationTypes,
  primaryType:'TransferWithAuthorization',message:{
   from:auth.from,to:auth.to,value:BigInt(auth.value),
   validAfter:BigInt(auth.validAfter),validBefore:BigInt(auth.validBefore),nonce:auth.nonce
  }};
}
/** Checks every bound property *before* any facilitator request. */
export async function validatePolygonAuthorization(payment,expected,{now=Math.floor(Date.now()/1000)}={}){
 const a=payment?.payload?.authorization,sig=payment?.payload?.signature,accepted=payment?.accepted;
 requireValue(payment?.x402Version===2&&expected?.network===POLYGON_NETWORK&&
  expected.asset?.toLowerCase()===POLYGON_NATIVE_USDC&&
  accepted?.scheme==='exact'&&accepted.network===POLYGON_NETWORK&&
  accepted.asset?.toLowerCase()===POLYGON_NATIVE_USDC&&
  accepted.payTo?.toLowerCase()===expected.payTo&&
  accepted.amount===expected.amount&&
  accepted.maxTimeoutSeconds===expected.maxTimeoutSeconds&&
  accepted.extra?.name==='USD Coin'&&accepted.extra?.version==='2'&&
  (!accepted.extra.assetTransferMethod||accepted.extra.assetTransferMethod==='eip3009'),
  'POLYGON_PAYMENT_TERMS_MISMATCH',402);
 requireValue(a&&ADDRESS.test(a.from)&&ADDRESS.test(a.to)&&a.from.toLowerCase()!=='0x'+'0'.repeat(40)&&
  NONCE.test(a.nonce)&&SIGNATURE.test(sig),'POLYGON_AUTHORIZATION_MALFORMED',402);
 for(const k of ['value','validAfter','validBefore'])
  requireValue(typeof a[k]==='string'&&/^(0|[1-9][0-9]{0,77})$/u.test(a[k])&&
   BigInt(a[k])<2n**256n,'POLYGON_AUTHORIZATION_VALUE_INVALID',402);
 requireValue(a.to.toLowerCase()===expected.payTo&&a.value===expected.amount,
  'POLYGON_AMOUNT_OR_PAYEE_MISMATCH',402);
 requireValue(BigInt(a.validAfter)<BigInt(now)&&BigInt(a.validBefore)>BigInt(now+8)&&
  BigInt(a.validBefore)<=BigInt(now+expected.maxTimeoutSeconds),
  'POLYGON_AUTHORIZATION_TIME_INVALID',402);
 let recovered;
 try{recovered=await recoverTypedDataAddress({...polygonTypedAuthorization(a),signature:sig})}
 catch(e){throw new PaymentError('POLYGON_SIGNATURE_INVALID',402,e)}
 requireValue(recovered.toLowerCase()===a.from.toLowerCase(),'POLYGON_SIGNATURE_INVALID',402);
 return {payer:a.from.toLowerCase(),authorization:a,nonce:a.nonce.toLowerCase(),signature:sig};
}

/** The only Polygon verification methods are read-only; never transmit a transfer. */
export class PolygonVerifier {
 constructor({rpcUrl,client,confirmations=2}={}){
  requireValue(Number.isInteger(confirmations)&&confirmations>=2,'POLYGON_CONFIRMATIONS_REQUIRED',500);
  if(!client){
   requireValue(typeof rpcUrl==='string'&&new URL(rpcUrl).protocol==='https:',
    'POLYGON_HTTPS_RPC_REQUIRED',500);
  }
  this.client=client??createPublicClient({chain:polygon,transport:http(rpcUrl,{timeout:10000,retryCount:1})});
  this.confirmations=confirmations;
 }
 async assertChain(){requireValue(await this.client.getChainId()===POLYGON_CHAIN_ID,'POLYGON_CHAIN_MISMATCH')}
 async blockNumber(){await this.assertChain();return this.client.getBlockNumber()}
 async verifyUnused(authorization){
  await this.assertChain();
  const spent=await this.client.readContract({address:POLYGON_NATIVE_USDC,abi:usdcAbi,
   functionName:'authorizationState',args:[authorization.from,authorization.nonce]});
  requireValue(spent===false,'POLYGON_AUTHORIZATION_SPENT',402);
 }
 async findAuthorization(intent){
  await this.assertChain();
  const head=await this.client.getBlockNumber();
  const event=usdcAbi.find(x=>x.type==='event'&&x.name==='AuthorizationUsed');
  for(let from=BigInt(intent.scan_from_block);from<=head;from+=2000n){
   const to=from+1999n<head?from+1999n:head;
   const logs=await this.client.getLogs({address:POLYGON_NATIVE_USDC,event,
    args:{authorizer:intent.payer_address,nonce:intent.nonce},fromBlock:from,toBlock:to});
   if(logs.length)return logs[0].transactionHash;
  }
  return null;
 }
 async confirm(tx,intent){
  requireValue(HASH.test(tx),'POLYGON_TX_HASH_MALFORMED');
  await this.assertChain();
  const receipt=await this.client.waitForTransactionReceipt({hash:tx,confirmations:this.confirmations,timeout:30000});
  requireValue(receipt.status==='success'&&receipt.transactionHash.toLowerCase()===tx.toLowerCase(),
   'POLYGON_TX_NOT_SUCCESS');
  const records=[];
  for(const log of receipt.logs){
   if(log.address.toLowerCase()!==POLYGON_NATIVE_USDC||log.removed)continue;
   try{records.push({...decodeEventLog({abi:usdcAbi,data:log.data,topics:log.topics}),index:log.logIndex})}
   catch{/* ignore unrelated native-USDC events */}
  }
  const used=records.find(e=>e.eventName==='AuthorizationUsed'&&
   e.args.authorizer.toLowerCase()===intent.payer_address&&
   e.args.nonce.toLowerCase()===intent.nonce);
  const transfer=records.find(e=>e.eventName==='Transfer'&&
   e.args.from.toLowerCase()===intent.payer_address&&
   e.args.to.toLowerCase()===intent.payee_address&&
   e.args.value===BigInt(intent.amount_atomic));
  requireValue(used&&transfer&&Number.isInteger(transfer.index),'POLYGON_PAYMENT_LOG_MISMATCH');
  return transfer.index;
 }
}

/** Read-only facilitator client. No settle method is provided by design. */
export class DexterPolygonVerifier {
 constructor({fetchImpl=fetch,url=DEXTER_URL}={}){
  requireValue(url===DEXTER_URL,'DEXTER_ENDPOINT_NOT_PINNED',500);
  this.fetch=fetchImpl.bind(globalThis);
 }
 async verify(payment,expected){
  const local=await validatePolygonAuthorization(payment,expected);
  const response=await this.fetch(DEXTER_URL+'/verify',{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(30000),
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({x402Version:2,paymentPayload:payment,paymentRequirements:expected})
  });
  requireValue(response.ok,'DEXTER_VERIFY_UNAVAILABLE');
  const data=await readJsonResponse(response,131072);
  requireValue(data&&data.isValid===true&&
   (data.payer===undefined||typeof data.payer==='string'&&ADDRESS.test(data.payer)&&
    data.payer.toLowerCase()===local.payer),'DEXTER_VERIFICATION_INVALID',402);
  return {isValid:true,payer:local.payer,network:POLYGON_NETWORK};
 }
}
