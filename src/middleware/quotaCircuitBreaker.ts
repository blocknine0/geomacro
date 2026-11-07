/**
 * Cloudflare Durable Object admission ledger for centrally governed D1 work.
 * This is a HARD reservation limit on cooperating callers, NOT a physical
 * Cloudflare account-wide billed-rows ceiling. D1 reports rows only AFTER SQL
 * runs and other clients may bypass this object. Never advertise otherwise.
 */
interface DurableTxn {
 get<T=unknown>(key:string):Promise<T|undefined>;
 put(key:string,value:unknown):Promise<void>;
}
interface DurableObjectState {
 storage:{transaction<T>(callback:(tx:DurableTxn)=>Promise<T>):Promise<T>};
}
interface DurableObjectNamespace {
 idFromName(name:string):unknown;
 get(id:any):{fetch(input:string|Request,init?:RequestInit):Promise<Response>};
}
export interface QuotaEnv {
 D1_QUOTA_DO: DurableObjectNamespace;
 D1_BUDGET_INTERNAL_SECRET:string;
}
export interface QuotaReservation {
 max_rows_read:number;
 max_rows_written:number;
 operation_id:string;
}
interface Daily {
 day:string;
 read_reserved:number;
 write_reserved:number;
 provider_rows_read:number;
 provider_rows_written:number;
 provider_observed_at:number;
}
const LIMIT=140000,MAX_RESERVATION=5000,MAX_PROVIDER_AGE_MS=240000;
const fail=(code:string,status=503)=>Response.json({ok:false,code,admitted:false,
 account_wide_provider_hard_cap:false},{status,headers:{'Cache-Control':'no-store'}});
const allowed=(n:unknown)=>Number.isSafeInteger(n)&&typeof n==='number'&&n>=0&&n<=MAX_RESERVATION;
const utcDay=()=>new Date().toISOString().slice(0,10);
const requireSecret=(secret:unknown)=>typeof secret==='string'&&secret.length>=32;
const key=(day:string)=>'day:'+day;
const fresh=(record:Daily)=>record.provider_observed_at>0&&
 Date.now()-record.provider_observed_at>=0&&Date.now()-record.provider_observed_at<=MAX_PROVIDER_AGE_MS;

export class QuotaBudgetDO {
 private readonly ctx:DurableObjectState;
 private readonly env:QuotaEnv;
 constructor(ctx:DurableObjectState,env:QuotaEnv){this.ctx=ctx;this.env=env}
 async fetch(request:Request):Promise<Response>{
  if(request.method!=='POST'||!requireSecret(this.env.D1_BUDGET_INTERNAL_SECRET)||
   request.headers.get('Authorization')!=='Bearer '+this.env.D1_BUDGET_INTERNAL_SECRET)
   return fail('D1_BUDGET_UNAUTHORIZED',403);
  const url=new URL(request.url);
  const body:any=await request.json().catch(()=>null);
  const day=utcDay();
  if(url.pathname==='/sync'){
   if(body?.day!==day||!Number.isSafeInteger(body.rows_read)||!Number.isSafeInteger(body.rows_written)||
    body.rows_read<0||body.rows_written<0||body.rows_read>Number.MAX_SAFE_INTEGER||body.rows_written>Number.MAX_SAFE_INTEGER)
    return fail('D1_PROVIDER_USAGE_INVALID');
   // Trusted caller MUST use actual live GraphQL sum for every account D1 DB.
   // Monotonic floor prevents counter rewind and early UTC acceptance.
   return this.ctx.storage.transaction(async txn=>{
    const previous=await txn.get<Daily>(key(day));
    const record:Daily=previous??{day,read_reserved:0,write_reserved:0,
     provider_rows_read:0,provider_rows_written:0,provider_observed_at:0};
    if(body.rows_read<record.provider_rows_read||body.rows_written<record.provider_rows_written)
     return fail('D1_PROVIDER_COUNTER_REWIND');
    record.provider_rows_read=body.rows_read;record.provider_rows_written=body.rows_written;
    record.provider_observed_at=Date.now();
    await txn.put(key(day),record);
    return Response.json({ok:true,day,provider_observed:true});
   });
  }
  if(url.pathname!=='/reserve'||body?.day!==day||!allowed(body.max_rows_read)||
    !allowed(body.max_rows_written)||typeof body.operation_id!=='string'||
    !/^[A-Za-z0-9:_-]{12,100}$/.test(body.operation_id))return fail('D1_RESERVATION_INVALID');
  return this.ctx.storage.transaction(async txn=>{
   const record:Daily=(await txn.get<Daily>(key(day)))??{day,read_reserved:0,write_reserved:0,
    provider_rows_read:0,provider_rows_written:0,provider_observed_at:0};
   if(!fresh(record))return fail('D1_PROVIDER_USAGE_STALE');
   // Double counting provider-observed rows and all local reservations is
   // intentionally conservative; it cannot falsely grant account-wide safety.
   if(record.provider_rows_read+record.read_reserved+body.max_rows_read>LIMIT||
      record.provider_rows_written+record.write_reserved+body.max_rows_written>LIMIT)
    return fail('D1_140K_DAILY_CIRCUIT_OPEN',429);
   record.read_reserved+=body.max_rows_read;record.write_reserved+=body.max_rows_written;
   await txn.put(key(day),record);
   // Ambiguous retries conservatively consume another ticket; no refund or
   // idempotency shortcut that could let a repeated operation exceed the cap.
   return Response.json({ok:true,admitted:true,day,
    read_remaining_bound:LIMIT-record.provider_rows_read-record.read_reserved,
    write_remaining_bound:LIMIT-record.provider_rows_written-record.write_reserved,
    account_wide_provider_hard_cap:false});
  });
 }
}
async function post(env:QuotaEnv,route:string,payload:Record<string,unknown>){
 if(!env?.D1_QUOTA_DO||!requireSecret(env.D1_BUDGET_INTERNAL_SECRET))
  throw Error('D1_QUOTA_DO_BINDING_MISSING');
 const id=env.D1_QUOTA_DO.idFromName('geomacro-account-d1-daily');
 const stub=env.D1_QUOTA_DO.get(id);
 const res=await stub.fetch('https://quota.internal'+route,{method:'POST',
  headers:{Authorization:'Bearer '+env.D1_BUDGET_INTERNAL_SECRET,
   'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const response:any=await res.json().catch(()=>null);
 if(!res.ok||response?.ok!==true||response?.admitted===false)
  throw Error(response?.code||'D1_QUOTA_DO_UNAVAILABLE');
 return response;
}
export async function reserveD1Budget(env:QuotaEnv,reservation:QuotaReservation){
 return post(env,'/reserve',{...reservation,day:utcDay()});
}
/** Callable ONLY by a trusted operator after independent account-wide GraphQL. */
export async function syncProviderRows(env:QuotaEnv,rows_read:number,rows_written:number){
 return post(env,'/sync',{day:utcDay(),rows_read,rows_written});
}
/** Caller must provide a strict query-cost upper bound; missing cap = HOLD. */
export async function withQuotaCircuitBreaker<T>(env:QuotaEnv,r:QuotaReservation,
 query:()=>Promise<{value:T;meta:{rows_read:number;rows_written:number}}>){
 if(!allowed(r.max_rows_read)||!allowed(r.max_rows_written))throw Error('D1_QUERY_COST_BOUND_MISSING');
 await reserveD1Budget(env,r); // durable serializable commit before ANY D1 access
 const result=await query();
 if(!Number.isSafeInteger(result.meta?.rows_read)||!Number.isSafeInteger(result.meta?.rows_written)||
    result.meta.rows_read>r.max_rows_read||result.meta.rows_written>r.max_rows_written)
  throw Error('D1_QUERY_ROW_BOUND_BREACHED'); // caller cannot ACK or publish
 return result.value;
}