/**
 * Explicit atomically bounded D1 write grants for registered production writers.
 * IMPORTANT: The GraphQL account baseline is delayed and *cannot* account for
 * writers outside this shared entrypoint; gate all production D1 write paths.
 * Reservation intentionally overcounts versus reported usage (safe but may hold).
 */
export class D1BudgetHold extends Error {
 constructor(code){super(code);this.name="D1BudgetHold";}
}
const DAY=/^\d{4}-\d{2}-\d{2}$/u;
// Token bucket: 125 rows/minute (180,000/day), with a finite 7,500-row burst.
// The cumulative daily counter remains an independent upper bound.
const D1_BUCKET_CAPACITY_MILLI=7_500_000;
const D1_REFILL_MILLI_ROWS_PER_MINUTE=125_000;

export async function reserveD1PhysicalRows(db,{dayUtc,providerObserved,estimatedRows,limit=180000,observedAt,nowMs=Date.now()}={}){
 if(!db?.prepare||!DAY.test(dayUtc??"")||![providerObserved,estimatedRows,limit,nowMs].every(Number.isSafeInteger)||
    providerObserved<0||estimatedRows<2||estimatedRows>1000||limit!==180000||nowMs<0)
  throw new D1BudgetHold("D1_WRITE_ADMISSION_INVALID");
 const currentMs=nowMs;
 const reportedMs=Date.parse(observedAt??'');
 if(dayUtc!==new Date(currentMs).toISOString().slice(0,10)||
   !Number.isFinite(reportedMs)||reportedMs>currentMs||
   currentMs-reportedMs>2*60_000)
  throw new D1BudgetHold("D1_WRITE_ADMISSION_STALE_PROVIDER_COUNTER");
 const now=new Date(currentMs).toISOString();
 // A single conditional UPSERT makes a refused reservation a zero-row-write
 // operation. A two-statement insert/update could create a ledger row even
 // when the update returned no admission.
 const out=await db.prepare(
  "INSERT INTO geomacro_d1_soft_write_budget " +
  "(day_utc,reserved_rows,observed_provider_highwater,updated_at,tokens_milli,last_refill_ms) " +
  "SELECT ?,?,?,?,?,? WHERE ?+?<=? AND ?*1000<=? " +
  "ON CONFLICT(day_utc) DO UPDATE SET " +
  "reserved_rows=geomacro_d1_soft_write_budget.reserved_rows+excluded.reserved_rows, " +
  "observed_provider_highwater=MAX(geomacro_d1_soft_write_budget.observed_provider_highwater,"+
   "excluded.observed_provider_highwater), " +
  "tokens_milli=MIN(?,geomacro_d1_soft_write_budget.tokens_milli+"+
   "CAST(MAX(0,excluded.last_refill_ms-geomacro_d1_soft_write_budget.last_refill_ms)*?/60000 AS INTEGER)-"+
   "excluded.reserved_rows*1000), " +
  "last_refill_ms=excluded.last_refill_ms,updated_at=excluded.updated_at " +
  "WHERE MAX(geomacro_d1_soft_write_budget.observed_provider_highwater,"+
   "excluded.observed_provider_highwater)+geomacro_d1_soft_write_budget.reserved_rows+"+
   "excluded.reserved_rows<=? " +
  "AND geomacro_d1_soft_write_budget.tokens_milli+"+
   "CAST(MAX(0,excluded.last_refill_ms-geomacro_d1_soft_write_budget.last_refill_ms)*?/60000 AS INTEGER)>="+
   "excluded.reserved_rows*1000 " +
  "RETURNING reserved_rows,observed_provider_highwater,tokens_milli"
 ).bind(dayUtc,estimatedRows,providerObserved,now,
  D1_BUCKET_CAPACITY_MILLI-estimatedRows*1000,currentMs,
  providerObserved,estimatedRows,limit,estimatedRows,D1_BUCKET_CAPACITY_MILLI,
  D1_BUCKET_CAPACITY_MILLI,D1_REFILL_MILLI_ROWS_PER_MINUTE,limit,
  D1_REFILL_MILLI_ROWS_PER_MINUTE).first();
 if(!out)
  throw new D1BudgetHold("D1_INTERNAL_WRITE_SOFT_BUDGET_HELD");
 return Object.freeze({ok:true,day_utc:dayUtc,
  reserved_rows:out.reserved_rows,provider_highwater:out.observed_provider_highwater,
  tokens_milli:out.tokens_milli,bucket_capacity_rows:D1_BUCKET_CAPACITY_MILLI/1000,
  refill_rows_per_minute:D1_REFILL_MILLI_ROWS_PER_MINUTE/1000,
  includes_ledger_row:true,account_wide_only_if_all_writers_integrated:true});

}
export async function admittedBoundedD1Batch(db,statements,{dayUtc,providerObserved,
 estimatedPhysicalRows,limit=180000,observedAt}={}){
 if(!Array.isArray(statements)||statements.length<1||statements.length>25||
    !Number.isSafeInteger(estimatedPhysicalRows)||estimatedPhysicalRows<statements.length||
    estimatedPhysicalRows>998)
  throw new D1BudgetHold("D1_BATCH_BOUNDS_INVALID");
 await reserveD1PhysicalRows(db,{dayUtc,providerObserved,
  estimatedRows:estimatedPhysicalRows+2,limit,observedAt});
 const receipts=await db.batch(statements);
 const actual=receipts.reduce((sum,r)=>sum+Number(r?.meta?.rows_written??NaN),0);
 if(!Number.isSafeInteger(actual)||actual>estimatedPhysicalRows)
  throw new D1BudgetHold("D1_BATCH_ESTIMATE_BREACHED_QUARANTINE_PRODUCER");
 return receipts;
}
