import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
import {createHmac} from 'node:crypto';
const ENDPOINT='https://geomacro-control-plane.daspallab202391.workers.dev/v1/security/budget';
export async function consumeD1CentralSecurityBudget(route:string,key:string,fetchImpl=fetch){
 const root=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??'').trim();
 if(root.length<32)throw Error('D1_SECURITY_BUDGET_CONFIGURATION_REQUIRED');
 const token=createHmac('sha256',root).update('geomacro-control-plane-v1').digest('hex');
 const signal=AbortSignal.timeout(3500);
 let r:Response;
 try {
  r=await fetchWithoutRedirectUsing(fetchImpl,ENDPOINT,{method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({route_class:route,client_key:key}),signal});
 } catch {
  throw Error(signal.aborted?'D1_SECURITY_BUDGET_TIMEOUT':'D1_SECURITY_BUDGET_TRANSPORT_FAILED');
 }
 if(r.status===401||r.status===403)throw Error('D1_SECURITY_BUDGET_AUTH_REJECTED');
 if(r.status===404||r.status===405)throw Error('D1_SECURITY_BUDGET_ROUTE_NOT_READY');
 if(r.status!==200&&r.status!==429)throw Error('D1_SECURITY_BUDGET_UPSTREAM_REJECTED');
 // Enforce the byte bound while streaming, including responses without length.
 // Never retry a reservation: a lost response may already have consumed budget.
 const reader=r.body?.getReader();
 if(!reader)throw Error('D1_SECURITY_BUDGET_INVALID');
 const chunks:Uint8Array[]=[];let bytes=0;
 try {
  while(true){
   const part=await reader.read();if(part.done)break;
   bytes+=part.value.byteLength;
   if(bytes>2048){void reader.cancel().catch(()=>{});throw Error('D1_SECURITY_BUDGET_INVALID');}
   chunks.push(part.value);
  }
 } catch(error) {
  if(signal.aborted)throw Error('D1_SECURITY_BUDGET_TIMEOUT');
  if(error instanceof Error&&error.message==='D1_SECURITY_BUDGET_INVALID')throw error;
  throw Error('D1_SECURITY_BUDGET_TRANSPORT_FAILED');
 } finally {reader.releaseLock();}
 const body=new Uint8Array(bytes);let offset=0;
 for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 let d;
 try {d=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}
 catch {throw Error('D1_SECURITY_BUDGET_INVALID');}
 if(d?.ok!==true||d.schema!=='geomacro.central-security-budget.v1'||d.store!=='d1'||
   d.route_class!==route||typeof d.allowed!=='boolean'||d.allowed!==(r.status===200)||
   !Number.isSafeInteger(d.retry_after_seconds)||d.retry_after_seconds<1||d.retry_after_seconds>60)
   throw Error('D1_SECURITY_BUDGET_INVALID');
 return d as {allowed:boolean;retry_after_seconds:number};
}

// Fixed public diagnostics only. Never propagate provider bodies or messages.
export function centralSecurityBudgetFailureCode(error:unknown){
 const code=error instanceof Error?error.message:'';
 if(code==='D1_SECURITY_BUDGET_CONFIGURATION_REQUIRED')return 'CENTRAL_SECURITY_D1_CONFIGURATION_REQUIRED';
 if(code==='D1_SECURITY_BUDGET_AUTH_REJECTED')return 'CENTRAL_SECURITY_D1_AUTH_REJECTED';
 if(code==='D1_SECURITY_BUDGET_ROUTE_NOT_READY')return 'CENTRAL_SECURITY_D1_ROUTE_NOT_READY';
 if(code==='D1_SECURITY_BUDGET_TIMEOUT')return 'CENTRAL_SECURITY_D1_TIMEOUT';
 if(code==='D1_SECURITY_BUDGET_TRANSPORT_FAILED')return 'CENTRAL_SECURITY_D1_TRANSPORT_FAILED';
 if(code==='D1_SECURITY_BUDGET_UPSTREAM_REJECTED')return 'CENTRAL_SECURITY_D1_UPSTREAM_REJECTED';
 if(code==='D1_SECURITY_BUDGET_INVALID')return 'CENTRAL_SECURITY_D1_RECEIPT_INVALID';
 return 'CENTRAL_SECURITY_UNAVAILABLE';
}
