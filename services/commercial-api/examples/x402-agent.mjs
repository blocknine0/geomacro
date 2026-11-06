import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes,randomUUID } from 'node:crypto';
import { USDC,NETWORK,typedAuthorization } from '../src/payments/base.mjs';
import { requireValue } from '../src/payments/common.mjs';
// This example spends REAL USDC when pointed at a live configured endpoint.
// AGENT_PRIVATE_KEY belongs in the agent's secret store; never give it to GeoMacro.
const url=new URL(process.env.GEOMACRO_API_URL);
requireValue(url.protocol==='https:','HTTPS_API_REQUIRED');
const key=process.env.AGENT_PRIVATE_KEY;
requireValue(/^0x[0-9a-fA-F]{64}$/.test(key),'AGENT_PRIVATE_KEY_REQUIRED');
const account=privateKeyToAccount(key);
const input={subject:process.argv[2]??'USA',tier:process.argv[3]??'basic',request_id:process.env.REQUEST_ID??randomUUID()};
// Persist this request ID together with the signed payment in your agent's
// durable state before submitting, so a restart can retry without paying again.
const send=payment=>fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60_000),
 headers:{'Content-Type':'application/json',...(payment?{'PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(payment)).toString('base64')}:{})},body:JSON.stringify(input)});
const first=await send();requireValue(first.status===402,'EXPECTED_PAYMENT_CHALLENGE');
const challenge=JSON.parse(Buffer.from(requireValue(first.headers.get('PAYMENT-REQUIRED'),'PAYMENT_REQUIRED_HEADER_MISSING'),'base64'));
const accepted=challenge.accepts?.find(r=>r.scheme==='exact'&&r.network===NETWORK&&r.asset.toLowerCase()===USDC);
const max={basic:100000n,standard:150000n,complex:250000n}[input.tier];
requireValue(max&&accepted&&BigInt(accepted.amount)<=max&&BigInt(accepted.amount)>0n,'UNEXPECTED_PRICE');
requireValue(accepted.payTo.toLowerCase()===process.env.EXPECTED_MERCHANT_ADDRESS?.toLowerCase(),'MERCHANT_ADDRESS_MISMATCH');
const now=Math.floor(Date.now()/1000),authorization={from:account.address,to:accepted.payTo,value:accepted.amount,
 validAfter:String(now-1),validBefore:String(now+Math.min(accepted.maxTimeoutSeconds,110)),nonce:`0x${randomBytes(32).toString('hex')}`};
const signature=await account.signTypedData(typedAuthorization(authorization));
const payment={x402Version:2,resource:challenge.resource,accepted,payload:{signature,authorization}};
// This CLI intentionally makes one paid submission. Production agents must
// durably retain input+payment BEFORE this call and replay those SAME values.
const result=await send(payment);
console.log(JSON.stringify({request_id:input.request_id,status:result.status,body:await result.json()},null,2));
if(result.status!==200)process.exitCode=1;
