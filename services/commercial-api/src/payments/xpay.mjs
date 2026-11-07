import { Facilitator,NETWORK } from './base.mjs';
import { requireValue } from './common.mjs';

export const XPAY_ORIGIN='https://facilitator.xpay.sh';
const ADDRESS=/^0x[0-9a-fA-F]{40}$/u;
const HASH=/^0x[0-9a-fA-F]{64}$/u;

// xpay documents valid/settled/txHash while standard x402 v2 clients can return
// isValid/success/transaction. Normalize only explicit, non-conflicting success.
// The BaseVerifier independently checks both on-chain USDC events before delivery.
export class XpayFacilitator extends Facilitator {
 constructor({url,headers={},fetchImpl=fetch}) {
  super({url,headers,fetchImpl});
  requireValue(this.url===XPAY_ORIGIN,'XPAY_ENDPOINT_MISMATCH',500);
  requireValue(headers&&typeof headers==='object'&&!Array.isArray(headers)&&
   Object.keys(headers).length===0,'XPAY_AUTH_HEADERS_NOT_REQUIRED',500);
 }
 assertPayment(payment,expected) {
  requireValue(expected?.network===NETWORK&&payment?.x402Version===2&&
   payment.accepted?.network===NETWORK&&payment.accepted?.scheme==='exact'&&
   payment.accepted?.asset?.toLowerCase()===expected.asset?.toLowerCase()&&
   payment.accepted?.payTo?.toLowerCase()===expected.payTo?.toLowerCase()&&
   payment.accepted?.amount===expected.amount&&
   ADDRESS.test(payment.payload?.authorization?.from??''),
   'XPAY_TERMS_MISMATCH',402);
  return payment.payload.authorization.from.toLowerCase();
 }
 async verify(payment,expected) {
  const payer=this.assertPayment(payment,expected);
  const r=await this.call('verify',payment,expected);
  requireValue(r&&typeof r==='object'&&
   (r.isValid===true||r.valid===true)&&
   (r.isValid===undefined||r.isValid===true)&&
   (r.valid===undefined||r.valid===true),
   'XPAY_VERIFICATION_REJECTED',402);
  if(r.payer!==undefined)requireValue(typeof r.payer==='string'&&
   ADDRESS.test(r.payer)&&r.payer.toLowerCase()===payer,'XPAY_PAYER_MISMATCH',402);
  return {isValid:true,payer};
 }
 async settle(payment,expected) {
  const payer=this.assertPayment(payment,expected);
  const r=await this.call('settle',payment,expected);
  requireValue(r&&typeof r==='object'&&
   (r.success===true||r.settled===true)&&
   (r.success===undefined||r.success===true)&&
   (r.settled===undefined||r.settled===true)&&
   !r.errorReason,
   'XPAY_SETTLEMENT_UNCONFIRMED');
  const transaction=r.transaction??r.txHash;
  requireValue(typeof transaction==='string'&&HASH.test(transaction)&&
   (r.transaction===undefined||r.txHash===undefined||
    r.transaction.toLowerCase()===r.txHash.toLowerCase()),
   'XPAY_TRANSACTION_INVALID');
  if(r.network!==undefined)requireValue(r.network===NETWORK,'XPAY_NETWORK_MISMATCH');
  if(r.payer!==undefined)requireValue(typeof r.payer==='string'&&
   ADDRESS.test(r.payer)&&r.payer.toLowerCase()===payer,'XPAY_PAYER_MISMATCH');
  return {success:true,transaction:transaction.toLowerCase(),network:NETWORK,payer};
 }
}

// Other existing providers retain their original strict standard-v2 adapter.
// Never silently re-route a signed/quoted/uncertain payment to a different host.
export function createCommercialFacilitator({url,headers={},fetchImpl=fetch}) {
 const host=new URL(url).hostname.toLowerCase();
 return host==='facilitator.xpay.sh'
  ?new XpayFacilitator({url,headers,fetchImpl})
  :new Facilitator({url,headers,fetchImpl});
}
