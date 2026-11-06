import { createPublicClient,http,parseAbi,recoverTypedDataAddress,parseSignature,getAddress,decodeEventLog } from 'viem';
import { base } from 'viem/chains';
import { PaymentError,requireValue,readJsonResponse } from './common.mjs';
export const USDC='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
export const NETWORK='eip155:8453';
export const authorizationTypes={TransferWithAuthorization:[
 {name:'from',type:'address'},{name:'to',type:'address'},{name:'value',type:'uint256'},
 {name:'validAfter',type:'uint256'},{name:'validBefore',type:'uint256'},{name:'nonce',type:'bytes32'},
]};
export const usdcAbi=parseAbi([
 'function authorizationState(address authorizer,bytes32 nonce) view returns (bool)',
 'function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,uint8 v,bytes32 r,bytes32 s)',
 'event Transfer(address indexed from,address indexed to,uint256 value)',
 'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
]);
export function typedAuthorization(a) {
 return {domain:{name:'USD Coin',version:'2',chainId:8453,verifyingContract:USDC},types:authorizationTypes,
  primaryType:'TransferWithAuthorization',message:{from:a.from,to:a.to,value:BigInt(a.value),
    validAfter:BigInt(a.validAfter),validBefore:BigInt(a.validBefore),nonce:a.nonce}};
}
export function requirements(amount,payee) {
 return {scheme:'exact',network:NETWORK,amount:String(amount),asset:USDC,payTo:payee.toLowerCase(),
  maxTimeoutSeconds:120,extra:{name:'USD Coin',version:'2',assetTransferMethod:'eip3009'}};
}
export function parsePayment(header) {
 requireValue(typeof header==='string'&&header.length<=24_000&&/^[A-Za-z0-9+/]+={0,2}$/.test(header),'INVALID_PAYMENT_HEADER',400);
 let p;try{p=JSON.parse(Buffer.from(header,'base64').toString('utf8'));}catch{throw new PaymentError('INVALID_PAYMENT_JSON',400);}
 requireValue(p&&p.x402Version===2&&p.accepted&&p.payload,'INVALID_X402_V2',400);return p;
}
export async function validateAuthorization(payment,expected,{now=Math.floor(Date.now()/1000)}={}) {
 const accepted=payment.accepted,a=payment.payload?.authorization,sig=payment.payload?.signature;
 requireValue(accepted?.scheme==='exact'&&accepted.network===NETWORK&&accepted.asset?.toLowerCase()===USDC&&
  accepted.payTo?.toLowerCase()===expected.payTo&&accepted.amount===expected.amount&&
  accepted.maxTimeoutSeconds===expected.maxTimeoutSeconds&&accepted.extra?.name==='USD Coin'&&accepted.extra.version==='2'&&
  (!accepted.extra.assetTransferMethod||accepted.extra.assetTransferMethod==='eip3009'),'PAYMENT_TERMS_MISMATCH',402);
 requireValue(a&&/^0x[0-9a-fA-F]{40}$/.test(a.from)&&/^0x[0-9a-fA-F]{40}$/.test(a.to)&&
  /^0x[0-9a-fA-F]{64}$/.test(a.nonce)&&typeof sig==='string'&&/^0x[0-9a-fA-F]{130}$/.test(sig),'INVALID_EIP3009',402);
 for(const field of ['value','validAfter','validBefore'])
  requireValue(typeof a[field]==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(a[field])&&BigInt(a[field])<2n**256n,'INVALID_AUTHORIZATION_VALUE',402);
 requireValue(a.from.toLowerCase()!=='0x'+'0'.repeat(40)&&a.to.toLowerCase()===expected.payTo&&a.value===expected.amount,'AUTHORIZATION_AMOUNT_OR_PAYEE_MISMATCH',402);
 requireValue(BigInt(a.validAfter)<BigInt(now)&&BigInt(a.validBefore)>BigInt(now+8)&&
  BigInt(a.validBefore)<=BigInt(now+expected.maxTimeoutSeconds),'AUTHORIZATION_TIME_INVALID',402);
 let recovered;try{recovered=await recoverTypedDataAddress({...typedAuthorization(a),signature:sig});}
 catch(error){throw new PaymentError('AUTHORIZATION_SIGNATURE_INVALID',402,error);}
 requireValue(recovered.toLowerCase()===a.from.toLowerCase(),'AUTHORIZATION_SIGNATURE_INVALID',402);
 return {authorization:a,signature:sig,payer:a.from.toLowerCase(),nonce:a.nonce.toLowerCase()};
}
export class BaseVerifier {
 constructor({rpcUrl,client,confirmations=2}) {
  requireValue(Number.isInteger(confirmations)&&confirmations>=2,'INVALID_CONFIRMATIONS',500);
  this.client=client??createPublicClient({chain:base,transport:http(requireValue(rpcUrl,'BASE_RPC_URL_REQUIRED',500),{timeout:10_000,retryCount:1})});
  this.confirmations=confirmations;
 }
 async assertChain(){requireValue(await this.client.getChainId()===8453,'BASE_CHAIN_MISMATCH');}
 async blockNumber(){await this.assertChain();return this.client.getBlockNumber();}
 async checkUnusedAndSimulate(a,sig) {
  await this.assertChain();
  const used=await this.client.readContract({address:USDC,abi:usdcAbi,functionName:'authorizationState',args:[a.from,a.nonce]});
  requireValue(!used,'AUTHORIZATION_ALREADY_USED',402);
  const {r,s,v,yParity}=parseSignature(sig);
  await this.client.simulateContract({address:USDC,abi:usdcAbi,functionName:'transferWithAuthorization',account:getAddress(a.to),
    args:[a.from,a.to,BigInt(a.value),BigInt(a.validAfter),BigInt(a.validBefore),a.nonce,v??BigInt(27+yParity),r,s]});
 }
 async findAuthorization(intent) {
  await this.assertChain();
  const head=await this.client.getBlockNumber();
  const event=usdcAbi.find(x=>x.type==='event'&&x.name==='AuthorizationUsed');
  // Chunk RPC scans, including an uncertain facilitator broadcast. Nonces remain
  // reserved forever in SQL; retries never request another payment authorization.
  for(let from=BigInt(intent.scan_from_block);from<=head;from+=2000n){
    const to=from+1999n<head?from+1999n:head;
    const logs=await this.client.getLogs({address:USDC,event,args:{authorizer:intent.payer_address,nonce:intent.nonce},fromBlock:from,toBlock:to});
    if(logs.length)return logs[0].transactionHash;
  }
  return null;
 }
 async confirm(tx,intent) {
  await this.assertChain();
  const receipt=await this.client.waitForTransactionReceipt({hash:tx,confirmations:this.confirmations,timeout:30_000});
  requireValue(receipt.status==='success'&&receipt.transactionHash.toLowerCase()===tx.toLowerCase(),'BASE_TX_NOT_SUCCESS');
  const records=[];
  for(const log of receipt.logs){if(log.address.toLowerCase()!==USDC||log.removed)continue;
    try{records.push({...decodeEventLog({abi:usdcAbi,data:log.data,topics:log.topics}),index:log.logIndex});}catch{/* unrelated USDC event */}}
  const used=records.find(e=>e.eventName==='AuthorizationUsed'&&e.args.authorizer.toLowerCase()===intent.payer_address&&e.args.nonce.toLowerCase()===intent.nonce);
  const transfer=records.find(e=>e.eventName==='Transfer'&&e.args.from.toLowerCase()===intent.payer_address&&
    e.args.to.toLowerCase()===intent.payee_address&&e.args.value===BigInt(intent.amount_atomic));
  requireValue(used&&transfer&&Number.isInteger(transfer.index),'BASE_PAYMENT_LOG_MISMATCH');
  return transfer.index;
 }
}
export class Facilitator {
 constructor({url,headers={},fetchImpl=fetch}) {
  const parsed=new URL(url);requireValue(parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash,'HTTPS_FACILITATOR_REQUIRED',500);
  Object.assign(this,{url:url.replace(/\/$/,''),headers,fetch:fetchImpl});
 }
 async call(operation,payment,expected) {
  requireValue(['verify','settle'].includes(operation),'INVALID_FACILITATOR_OPERATION',500);
  const response=await this.fetch(`${this.url}/${operation}`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(30_000),
   headers:{...this.headers,'Content-Type':'application/json'},body:JSON.stringify({x402Version:2,paymentPayload:payment,paymentRequirements:expected})});
  if(!response.ok)throw new PaymentError('FACILITATOR_UNAVAILABLE');return readJsonResponse(response);
 }
 async verify(payment,expected){const r=await this.call('verify',payment,expected);requireValue(r.isValid===true,'FACILITATOR_PAYMENT_INVALID',402);
  requireValue(!r.payer||r.payer.toLowerCase()===payment.payload.authorization.from.toLowerCase(),'FACILITATOR_PAYER_MISMATCH');return r;}
 async settle(payment,expected){return this.call('settle',payment,expected);}
}
