/**
 * Schema-expand-only D1 migration ledger contract. No destructive DDL.
 * The native D1 migrations history remains authoritative: the ledger never
 * replays an ambiguous partially applied SQL file on its own.
 */
import {createHash} from "node:crypto";
export const STEP3_LEDGER_SCHEMA=Object.freeze({
 name:"_geomacro_migration_ledger",version:1,
 allowed_statuses:["STARTED","APPLIED","VERIFIED"]
});
const fail=why=>{throw Error("STEP3_LEDGER_"+why)};
const ID=/^(?:0204|0211|0212|0213)$/u;
const SHA=/^[a-f0-9]{64}$/u;
const ISO=/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
export const createStep3LedgerSQL=()=>
 "CREATE TABLE IF NOT EXISTS _geomacro_migration_ledger ("+
 "migration_id TEXT PRIMARY KEY NOT NULL CHECK(migration_id IN ('0204','0211','0212','0213')),"+
 "sql_sha256 TEXT NOT NULL CHECK(length(sql_sha256)=64),"+
 "status TEXT NOT NULL CHECK(status IN ('STARTED','APPLIED','VERIFIED')),"+
 "started_at TEXT NOT NULL,finished_at TEXT,"+
 "duration_ms INTEGER CHECK(duration_ms IS NULL OR duration_ms>=0),"+
 "CHECK((status='VERIFIED' AND finished_at IS NOT NULL AND duration_ms IS NOT NULL) OR status!='VERIFIED'))";
export const readStep3LedgerSQL=()=>
 "SELECT migration_id,sql_sha256,status,started_at,finished_at,duration_ms "+
 "FROM _geomacro_migration_ledger ORDER BY migration_id";
export function verifyStep3LedgerRows(rows,manifests){
 if(!Array.isArray(rows)||!Array.isArray(manifests)||
    rows.length>4||manifests.length!==4)fail("ROWSET_INVALID");
 const lookup=new Map(manifests.map(m=>[m.id,m.sql_sha256]));
 const seen=new Set();
 for(const r of rows){
  if(!ID.test(r?.migration_id)||seen.has(r.migration_id)||
     !SHA.test(r.sql_sha256)||lookup.get(r.migration_id)!==r.sql_sha256||
     !STEP3_LEDGER_SCHEMA.allowed_statuses.includes(r.status)||
     !ISO.test(r.started_at)||Number.isNaN(Date.parse(r.started_at))||
     !(r.finished_at===null||ISO.test(r.finished_at))||
     !(r.duration_ms===null||
       Number.isSafeInteger(r.duration_ms)&&r.duration_ms>=0)||
     (r.status==="VERIFIED"&&
       (!r.finished_at||!Number.isSafeInteger(r.duration_ms))))
    fail("CHECKSUM_STATUS_OR_ROW_INVALID");
  seen.add(r.migration_id);
 }
 return new Map(rows.map(r=>[r.migration_id,r]));
}
export function step3LedgerStartSQL(manifest,at){
 if(!ID.test(manifest?.id)||!SHA.test(manifest?.sql_sha256)||!ISO.test(at))
  fail("START_INPUT_INVALID");
 return "INSERT INTO _geomacro_migration_ledger "+
  "(migration_id,sql_sha256,status,started_at) VALUES('"+
  manifest.id+"','"+manifest.sql_sha256+"','STARTED','"+at+"') "+
  "ON CONFLICT(migration_id) DO NOTHING";
}
export function step3LedgerStatusSQL(manifest,status,at,duration){
 if(!ID.test(manifest?.id)||!SHA.test(manifest?.sql_sha256)||
    !["APPLIED","VERIFIED"].includes(status)||!ISO.test(at)||
    !Number.isSafeInteger(duration)||duration<0||duration>86400000)
  fail("STATUS_INPUT_INVALID");
 // Never rewrite an already VERIFIED migration or an unrelated checksum.
 return "UPDATE _geomacro_migration_ledger SET status='"+status+
  "',finished_at='"+at+"',duration_ms="+duration+
  " WHERE migration_id='"+manifest.id+"' AND sql_sha256='"+
  manifest.sql_sha256+"' AND status IN ('STARTED','APPLIED')";
}
export function sha256MigrationSet(manifests){
 if(!Array.isArray(manifests)||manifests.length!==4||
    manifests.map(x=>x.id).join(",")!=="0204,0211,0212,0213"||
    manifests.some(x=>!SHA.test(x.sql_sha256)))fail("MIGRATION_SET_INVALID");
 return createHash("sha256").update(manifests.map(x=>x.id+":"+x.sql_sha256).join("\n")).digest("hex");
}
export function decideResume({entry,manifest,nativePending,objectsVerified}={}){
 if(typeof nativePending!=="boolean"||!ID.test(manifest?.id)||
    !SHA.test(manifest?.sql_sha256))fail("NATIVE_HISTORY_OR_MANIFEST_INVALID");
 if(!entry)return nativePending?"APPLY_REVIEWED_SQL":"HOLD_NATIVE_HISTORY_WITHOUT_LEDGER";
 if(entry.sql_sha256!==manifest.sql_sha256)
  return "HOLD_CHANGED_MIGRATION_CHECKSUM";
 if(entry.status==="VERIFIED")
  return !nativePending&&objectsVerified?"SKIP_VERIFIED":"HOLD_VERIFIED_LEDGER_DRIFT";
 if(entry.status==="APPLIED")
  return !nativePending&&objectsVerified?"REVALIDATE_ONLY":"HOLD_APPLIED_LEDGER_DRIFT";
 if(entry.status==="STARTED")
  return !nativePending&&objectsVerified?"RECONCILE_COMPLETED":"HOLD_AMBIGUOUS_PARTIAL_MIGRATION";
 return "HOLD_UNKNOWN_LEDGER_STATUS";
}
