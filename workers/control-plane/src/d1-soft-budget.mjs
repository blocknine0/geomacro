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
export async function reserveD1PhysicalRows(db,{dayUtc,providerObserved,estimatedRows,limit=180000,observedAt}={}){
 if(!db?.batch||!DAY.test(dayUtc??"")||![providerObserved,estimatedRows,limit].every(Number.isSafeInteger)||
    providerObserved<0||estimatedRows<2||estimatedRows>1000||limit!==180000)
  throw new D1BudgetHold("D1_WRITE_ADMISSION_INVALID");
 const currentMs=Date.now();
 const reportedMs=Date.parse(observedAt??'');
 if(dayUtc!==new Date(currentMs).toISOString().slice(0,10)||
   !Number.isFinite(reportedMs)||reportedMs>currentMs||
   currentMs-reportedMs>2*60_000)
  throw new D1BudgetHold("D1_WRITE_ADMISSION_STALE_PROVIDER_COUNTER");
 const now=new Date(currentMs).toISOString();
 const receipts=await db.batch([
  db.prepare("INSERT OR IGNORE INTO geomacro_d1_soft_write_budget " +
   "(day_utc,reserved_rows,observed_provider_highwater,updated_at) VALUES(?,0,?,?)")
   .bind(dayUtc,providerObserved,now),
  db.prepare("UPDATE geomacro_d1_soft_write_budget SET " +
   "reserved_rows=reserved_rows+?, " +
   "observed_provider_highwater=MAX(observed_provider_highwater,?),updated_at=? " +
   "WHERE day_utc=? AND MAX(observed_provider_highwater,?)+reserved_rows+?<=? " +
   "RETURNING reserved_rows,observed_provider_highwater")
   .bind(estimatedRows,providerObserved,now,dayUtc,providerObserved,estimatedRows,limit)
 ]);
 const out=receipts?.[1]?.results;
 if(receipts?.[1]?.success===false || !Array.isArray(out) || out.length!==1)
  throw new D1BudgetHold("D1_INTERNAL_WRITE_SOFT_BUDGET_HELD");
 return Object.freeze({ok:true,day_utc:dayUtc,
  reserved_rows:out[0].reserved_rows,provider_highwater:out[0].observed_provider_highwater,
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
