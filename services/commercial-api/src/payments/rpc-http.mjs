import {PaymentError,readJsonResponse,requireValue} from './common.mjs';
/** One PostgreSQL RPC per call; never emulates BEGIN/COMMIT across HTTP. */
export class SupabaseRpcPool {
 constructor({url,key,fetchImpl=fetch}){
  const parsed=new URL(url);requireValue(parsed.protocol==='https:'&&parsed.origin===url,'RPC_ORIGIN_INVALID',500);
  Object.assign(this,{url,key:requireValue(key,'RPC_KEY_REQUIRED',500),fetch:fetchImpl.bind(globalThis)});
 }
 async call(operation,args=[]){
  const headers={apikey:this.key,'Content-Type':'application/json',Accept:'application/json'};
  if(!this.key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${this.key}`;
  let response,result;
  try{response=await this.fetch(`${this.url}/rest/v1/rpc/geomacro_commercial_rpc`,{method:'POST',headers,
   redirect:'manual',signal:AbortSignal.timeout(15_000),body:JSON.stringify({p_operation:operation,p_args:args})});
  result=await readJsonResponse(response);}
  catch(error){throw new PaymentError('COMMERCIAL_LEDGER_UNAVAILABLE',503,error);}
  if(!response.ok){
   const permitted=new Set(['IDEMPOTENCY_CONFLICT','INSUFFICIENT_CREDITS','KEY_UNAVAILABLE','ACCOUNT_UNAVAILABLE',
    'RATE_LIMIT_EXCEEDED','EVENT_IDEMPOTENCY_CONFLICT','PAYMENT_PROCESSING','PAYMENT_LEASE_LOST','REQUEST_NOT_REPLAYABLE']);
   if(permitted.has(result?.message))throw new PaymentError(result.message,
    result.message==='RATE_LIMIT_EXCEEDED'?429:result.message==='KEY_UNAVAILABLE'?401:result.message==='INSUFFICIENT_CREDITS'?402:409);
   throw new PaymentError('COMMERCIAL_LEDGER_UNAVAILABLE');
  }
  return result;
 }
 async query(sql,args=[]){
  const match=sql.match(/^SELECT geomacro\.([a-z0-9_]+)\((?:\$\d+(?:,\$\d+)*)?\) AS (result|id|account)$/);
  if(!match)throw new Error('HTTP_RPC_REQUIRES_SINGLE_ATOMIC_FUNCTION');
  const value=await this.call(match[1],args);
  const alias=match[2];
  return {rows:['x402_pending','polygon_x402_pending'].includes(match[1])?value.map(result=>({[alias]:result})):[{[alias]:value}]};
 }
}
