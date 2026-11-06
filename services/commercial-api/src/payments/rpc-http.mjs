import {PaymentError,readJsonResponse,requireValue} from './common.mjs';
/** One PostgreSQL RPC per call; never emulates BEGIN/COMMIT across HTTP. */
export class SupabaseRpcPool {
 constructor({url,key,fetchImpl=fetch}){
  const parsed=new URL(url);requireValue(parsed.protocol==='https:'&&parsed.origin===url,'RPC_ORIGIN_INVALID',500);
  Object.assign(this,{url,key:requireValue(key,'RPC_KEY_REQUIRED',500),fetch:fetchImpl});
 }
 async call(operation,args=[]){
  const headers={apikey:this.key,'Content-Type':'application/json',Accept:'application/json'};
  if(!this.key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${this.key}`;
  const response=await this.fetch(`${this.url}/rest/v1/rpc/geomacro_commercial_rpc`,{method:'POST',headers,
   redirect:'manual',signal:AbortSignal.timeout(15_000),body:JSON.stringify({p_operation:operation,p_args:args})});
  const result=await readJsonResponse(response);
  if(!response.ok){
   const permitted=new Set(['IDEMPOTENCY_CONFLICT','INSUFFICIENT_CREDITS','KEY_UNAVAILABLE','ACCOUNT_UNAVAILABLE',
    'EVENT_IDEMPOTENCY_CONFLICT','PAYMENT_PROCESSING','PAYMENT_LEASE_LOST','REQUEST_NOT_REPLAYABLE']);
   if(permitted.has(result?.message))throw new PaymentError(result.message,
    result.message==='KEY_UNAVAILABLE'?401:result.message==='INSUFFICIENT_CREDITS'?402:409);
   throw new PaymentError('COMMERCIAL_LEDGER_UNAVAILABLE');
  }
  return result;
 }
 async query(sql,args=[]){
  const match=sql.match(/^SELECT geomacro\.([a-z0-9_]+)\((?:\$\d+(?:,\$\d+)*)?\) AS result$/);
  if(!match)throw new Error('HTTP_RPC_REQUIRES_SINGLE_ATOMIC_FUNCTION');
  const value=await this.call(match[1],args);
  return {rows:match[1]==='x402_pending'?value.map(result=>({result})):[{result:value}]};
 }
}
