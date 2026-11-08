/**
 * GeoMacro's inclusion-only, ZERO discretionary overage, local admission
 * ceilings. A product is NOT usable until its genuine provider-cycle counter
 * has been independently observed, and every cooperating producer obtains
 * a serializable ticket BEFORE any metered resource access.
 *
 * Limits use <=90% of each published included tier; remaining allowance is
 * an emergency-only reserve inside the SAME included volume, not extra spend.
 * Cloudflare's eventual billing, external API/CLI writers, taxes and
 * Backblaze B2 are outside this software ledger: NOT an invoice guarantee.
 */
export const COST_METERS=Object.freeze({
 workers_requests:Object.freeze({normal:8000000,emergency:1000000,included:10000000}),
 workers_cpu_ms:Object.freeze({normal:24000000,emergency:3000000,included:30000000}),
 d1_rows_read:Object.freeze({normal:3720000,emergency:620000,included:25000000000}),
 d1_rows_written:Object.freeze({normal:3720000,emergency:620000,included:50000000}),
 d1_storage_bytes:Object.freeze({normal:3500000000,emergency:500000000,included:5000000000}),
 queues_standard_operations:Object.freeze({normal:800000,emergency:100000,included:1000000}),
 kv_reads:Object.freeze({normal:8000000,emergency:1000000,included:10000000}),
 kv_writes:Object.freeze({normal:800000,emergency:100000,included:1000000}),
 kv_deletes:Object.freeze({normal:800000,emergency:100000,included:1000000}),
 kv_lists:Object.freeze({normal:800000,emergency:100000,included:1000000}),
 kv_storage_bytes:Object.freeze({normal:800000000,emergency:100000000,included:1000000000}),
 r2_standard_class_a:Object.freeze({normal:800000,emergency:100000,included:1000000}),
 r2_standard_class_b:Object.freeze({normal:8000000,emergency:1000000,included:10000000}),
 r2_standard_storage_bytes:Object.freeze({normal:8000000000,emergency:1000000000,included:10000000000}),
 durable_objects_requests:Object.freeze({normal:800000,emergency:100000,included:1000000}),
 durable_objects_gb_seconds:Object.freeze({normal:300000,emergency:50000,included:400000})
});
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const MONTH_ANCHOR=5;
export function cloudflareCycleId(now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("COST_CYCLE_CLOCK_INVALID");
 const y=now.getUTCFullYear(),m=now.getUTCMonth();
 const start=now.getUTCDate()>=MONTH_ANCHOR?Date.UTC(y,m,MONTH_ANCHOR):Date.UTC(y,m-1,MONTH_ANCHOR);
 return new Date(start).toISOString().slice(0,10);
}
export function validateMonthlyMeters(meters){
 if(!meters||typeof meters!=="object"||Array.isArray(meters)||
    Object.keys(meters).length!==Object.keys(COST_METERS).length ||
    Object.keys(meters).some(k=>!(k in COST_METERS)||!safe(meters[k])) ||
    Object.keys(COST_METERS).some(k=>!Object.hasOwn(meters,k)))
  throw Error("COST_PROVIDER_METER_COMPLETENESS_UNVERIFIED");
 return Object.freeze({...meters});
}
/**
 * @param {{meter?:string,observed?:number,normalReserved?:number,
 * emergencyReserved?:number,units?:number,lane?:string}} [ticket]
 */
export function assessMeterTicket({meter,observed,normalReserved=0,
 emergencyReserved=0,units,lane="normal"}={}){
 if(!Object.hasOwn(COST_METERS,meter??"")||!safe(observed)||
    !safe(normalReserved)||!safe(emergencyReserved)||
    !safe(units)||units<=0||units>5000||
    !["normal","emergency"].includes(lane))
  return Object.freeze({admitted:false,code:"COST_METER_OR_BOUND_UNVERIFIED"});
 const limit=COST_METERS[meter];
 // Provider is a monotonic observation; reservations may overlap its rows.
 // Double-counting sacrifices capacity rather than risking an overage.
 const aggregate=observed+normalReserved+emergencyReserved+units;
 const classReserved=lane==="normal"?normalReserved:emergencyReserved;
 const classLimit=lane==="normal"?limit.normal:limit.emergency;
 const belowClass=classReserved+units<=classLimit;
 const belowNormal=lane==="emergency"||aggregate<=limit.normal;
 const belowTotal=aggregate<=limit.normal+limit.emergency &&
   aggregate<=limit.included;
 return Object.freeze({admitted:belowClass&&belowNormal&&belowTotal,
  code:belowClass&&belowNormal&&belowTotal?"COST_COOPERATING_METER_TICKET_ADMITTED":
   "COST_INCLUDED_OR_RESERVE_LIMIT_HELD",
  meter,lane,included:limit.included,
  normal_cap:limit.normal,emergency_reserve:limit.emergency,
  external_account_wide_bill_guaranteed:false});
}
