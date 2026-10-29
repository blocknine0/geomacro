import {resolveGeomacroCapabilityPrice} from '../../../src/lib/capability-pricing-catalog.ts';
import {exactGeomacroUsdcRail} from '../../../src/lib/usdc-native-rail-identities.ts';

export const CAPABILITY_PREQUOTE_LIMIT=64;
const HASH=/^[a-f0-9]{64}$/u;
const ADDRESS=/^0x[0-9a-f]{40}$/u;
export async function capabilityQuoteHash(quote){
 const values=[quote.version,quote.capability,quote.variant,quote.amount_atomic,
  quote.request_fingerprint_sha256,quote.network,quote.asset_contract,
  quote.recipient,quote.payment_rail,quote.issued_at,quote.expires_at,
  quote.availability,quote.prepared_answer_sha256];
 const bytes=new TextEncoder().encode(JSON.stringify(values));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
  n=>n.toString(16).padStart(2,'0')).join('');
}

/** Storage admission only. The sole price catalogue is the application's
 * founder-locked pure module, bundled by Wrangler without Node dependencies.
 * This never attests source eligibility, signatures or settlement authority. */
export async function assertCapabilityPrequote(quote,scope,now=Date.now()){
 const fail=()=>{throw Error('CAPABILITY_PREQUOTE_INVALID_OR_UNVERIFIED')};
 if(!quote||typeof quote!=='object'||Array.isArray(quote)||!Number.isFinite(now))fail();
 let price;
 try{price=resolveGeomacroCapabilityPrice(quote.capability,quote.variant)}catch{fail()}
 const fields=[...Object.keys(price),'quote_id','issued_at','expires_at',
  'quote_window_seconds','request_fingerprint_sha256','network','asset_contract',
  'recipient','availability','payment_rail','prepared_answer_sha256','execution_authorized'];
 if(Object.keys(quote).length!==fields.length||Object.keys(quote).some(k=>!fields.includes(k))||
  Object.entries(price).some(([k,v])=>quote[k]!==v)||
  !HASH.test(quote.quote_id)||!HASH.test(quote.request_fingerprint_sha256)||
  !HASH.test(quote.prepared_answer_sha256)||quote.quote_window_seconds!==300||
  !exactGeomacroUsdcRail(quote.network,quote.asset_contract)||
  // The Coinbase CDP settlement adapter is not a Circle facilitator and
  // MUST never inherit Arc/Polygon from the Circle discovery catalog.
  (quote.payment_rail==='coinbase_x402'&&quote.network!=='eip155:8453')||
  (quote.payment_rail==='xpay_x402'&&quote.network!=='eip155:8453')||
  (quote.payment_rail==='dexter_x402'&&
    !['eip155:8453','eip155:137'].includes(quote.network))||
  !ADDRESS.test(quote.recipient)||quote.execution_authorized!==false||
  quote.availability!=='VERIFIED_DELIVERABLE'||
  !['coinbase_x402','circle_gateway_x402','xpay_x402','dexter_x402'].includes(quote.payment_rail)||
  scope.provider!==quote.payment_rail||scope.providerEnvironment!==
   (['coinbase_x402','xpay_x402','dexter_x402'].includes(quote.payment_rail)?'mainnet':'production'))fail();
 const issued=Date.parse(quote.issued_at),expires=Date.parse(quote.expires_at);
 if(!Number.isSafeInteger(issued)||!Number.isSafeInteger(expires)||
  new Date(issued).toISOString()!==quote.issued_at||
  new Date(expires).toISOString()!==quote.expires_at||
  issued%300_000!==0||expires-issued!==300_000||issued>now||expires<=now)
  throw Error('CAPABILITY_PREQUOTE_EXPIRED_OR_INVALID');
 if(await capabilityQuoteHash(quote)!==quote.quote_id)fail();
 return expires;
}
