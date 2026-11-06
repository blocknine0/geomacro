/**
 * Atomic internal D1 soft-read admission.
 * The provider's account analytics remain observational. Every read caller
 * must reserve a conservative maximum before querying and report measured
 * meta.rows_read afterwards. A denied or stale admission fails closed.
 */
export class D1ReadBudgetHold extends Error {
 constructor(code){super(code);this.name="D1ReadBudgetHold";}
}
const DAY=/^\d{4}-\d{2}-\d{2}$/u;
const CAPACITY_MILLI=20_000_000;
const REFILL_MILLI_ROWS_PER_MINUTE=70_000;
const INTERNAL_DAILY_LIMIT=120_000;
const MAX_RESERVATION_ROWS=10_000;
export async function reserveD1PhysicalReadRows(db,{
 dayUtc,providerObserved,estimatedRows,observedAt,nowMs=Date.now(),
 limit=INTERNAL_DAILY_LIMIT
}={}){
 if(!db?.prepare||!DAY.test(dayUtc??"")||
   ![providerObserved,estimatedRows,limit,nowMs].every(Number.isSafeInteger)||
   providerObserved<0||estimatedRows<1||estimatedRows>MAX_RESERVATION_ROWS||
   limit!==INTERNAL_DAILY_LIMIT||nowMs<0)
  throw new D1ReadBudgetHold("D1_READ_ADMISSION_INVALID");
 const reportedMs=Date.parse(observedAt??"");
 if(dayUtc!==new Date(nowMs).toISOString().slice(0,10)||
   !Number.isFinite(reportedMs)||reportedMs>nowMs||nowMs-reportedMs>120_000)
  throw new D1ReadBudgetHold("D1_READ_ADMISSION_STALE_PROVIDER_COUNTER");
 const reservedRows=estimatedRows+1; // include this ledger UPSERT's conservative read
 if(reservedRows>MAX_RESERVATION_ROWS)
  throw new D1ReadBudgetHold("D1_READ_ADMISSION_INVALID");
 const now=new Date(nowMs).toISOString();
 const out=await db.prepare(
  "INSERT INTO geomacro_d1_soft_read_budget "+
  "(day_utc,reserved_rows,observed_provider_highwater,updated_at,tokens_milli,last_refill_ms) "+
  "SELECT ?,?,?,?,?,? WHERE ?+?<=? AND ?*1000<=? "+
  "ON CONFLICT(day_utc) DO UPDATE SET "+
  "reserved_rows=geomacro_d1_soft_read_budget.reserved_rows+excluded.reserved_rows,"+
  "observed_provider_highwater=MAX(geomacro_d1_soft_read_budget.observed_provider_highwater,"+
    "excluded.observed_provider_highwater),"+
  "tokens_milli=MIN(?,geomacro_d1_soft_read_budget.tokens_milli+"+
    "CAST(MAX(0,excluded.last_refill_ms-geomacro_d1_soft_read_budget.last_refill_ms)*?/60000 AS INTEGER)-"+
    "excluded.reserved_rows*1000),"+
  "last_refill_ms=excluded.last_refill_ms,updated_at=excluded.updated_at "+
  "WHERE MAX(geomacro_d1_soft_read_budget.observed_provider_highwater,"+
    "excluded.observed_provider_highwater)+geomacro_d1_soft_read_budget.reserved_rows+"+
    "excluded.reserved_rows<=? "+
  "AND geomacro_d1_soft_read_budget.tokens_milli+"+
    "CAST(MAX(0,excluded.last_refill_ms-geomacro_d1_soft_read_budget.last_refill_ms)*?/60000 AS INTEGER)>="+
    "excluded.reserved_rows*1000 "+
  "RETURNING reserved_rows,observed_provider_highwater,tokens_milli"
 ).bind(dayUtc,reservedRows,providerObserved,now,
  CAPACITY_MILLI-reservedRows*1000,nowMs,
  providerObserved,reservedRows,limit,reservedRows,CAPACITY_MILLI,
  CAPACITY_MILLI,REFILL_MILLI_ROWS_PER_MINUTE,limit,
  REFILL_MILLI_ROWS_PER_MINUTE).first();
 if(!out)throw new D1ReadBudgetHold("D1_INTERNAL_READ_SOFT_BUDGET_HELD");
 return Object.freeze({
  ok:true,day_utc:dayUtc,reserved_rows:out.reserved_rows,
  provider_highwater:out.observed_provider_highwater,
  tokens_milli:out.tokens_milli,bucket_capacity_rows:CAPACITY_MILLI/1000,
  refill_rows_per_minute:REFILL_MILLI_ROWS_PER_MINUTE/1000,
  requested_rows_reserved:estimatedRows,
  ledger_read_overhead_reserved:1,
  account_wide_only_if_all_readers_integrated:true,
 });
}
