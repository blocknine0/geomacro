// Bounded, fail-closed, no-funds Worker ingestion; canonical intelligence never modified.
import {COUNTRIES_195} from "./countries-195.mjs";
import {readCountryGroB2} from "./b2-readonly.mjs";
import {loadPinnedKeys,verifySignedGro,deriveSignalsFromSignedGro} from "./verified-gro.mjs";
import {createSevenDayBuffer,DEDICATED_RISK_SUPABASE_URL} from "./supabase-buffer.mjs";

const SLOT_MS=900_000;
const BATCH_SIZE=20;
const BATCHES=Math.ceil(COUNTRIES_195.length/BATCH_SIZE);
const ISO_TIME=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function slotTime(now){
  const ms=now.getTime();
  if(!Number.isFinite(ms))throw Error("RC_CLOCK_INVALID");
  return new Date(Math.floor(ms/SLOT_MS)*SLOT_MS).toISOString();
}
export function batchForTime(now){
  const n=Math.floor(now.getTime()/SLOT_MS);
  if(!Number.isSafeInteger(n))throw Error("RC_CLOCK_INVALID");
  const index=((n % BATCHES)+BATCHES)%BATCHES;
  return {index,batch_count:BATCHES,countries:COUNTRIES_195.slice(index*BATCH_SIZE,(index+1)*BATCH_SIZE)};
}
function credentialState(env){
  return !!env?.RC_STAGING_D1?.prepare &&
    env.RC_SUPABASE_URL===DEDICATED_RISK_SUPABASE_URL &&
    typeof env.RC_SUPABASE_SERVICE_KEY==="string"&&env.RC_SUPABASE_SERVICE_KEY.length>30 &&
    typeof env.RC_B2_READ_KEY_ID==="string"&&env.RC_B2_READ_KEY_ID.length>=8 &&
    typeof env.RC_B2_READ_APPLICATION_KEY==="string"&&env.RC_B2_READ_APPLICATION_KEY.length>=20;
}
export function syncReadiness(env){
  return {sync_enabled:env?.RC_SYNC_ENABLED==="1",
    credentials_configured:credentialState(env),
    batch_size:BATCH_SIZE,batch_count:BATCHES,
    canonical_data_modified:false,
    payment_enabled:false};
}
async function claim(db,slot,now){
  const row=await db.prepare(
    "INSERT OR IGNORE INTO gm_rc_sync_runs (slot_start,status,started_at,updated_at) VALUES (?,'RUNNING',?,?) RETURNING slot_start"
  ).bind(slot,now,now).first();
  return Boolean(row?.slot_start);
}
async function complete(db,slot,state){
  await db.prepare("UPDATE gm_rc_sync_runs SET status=?,finished_at=?,updated_at=?,scanned=?,signals_written=?,no_proof=?,failures=?,last_error_code=? WHERE slot_start=? AND status='RUNNING'")
    .bind(state.status,state.finished_at,state.finished_at,state.scanned,state.signals_written,state.no_proof,state.failures,state.last_error_code,slot).run();
}
export async function syncVerifiedSignals(env,now=new Date(),deps={}){
  if(!syncReadiness(env).sync_enabled)return {ok:false,code:"SYNC_DISABLED",attempted:0};
  if(!credentialState(env))return {ok:false,code:"STAGING_SECRETS_OR_BINDINGS_MISSING",attempted:0};
  const db=env.RC_STAGING_D1;
  const slot=slotTime(now);
  const batch=batchForTime(now);
  // All data inputs are read-only canonical source. Supabase is the sole data-write sink.
  let claimed;
  try{claimed=await claim(db,slot,now.toISOString());}
  catch{return {ok:false,code:"SYNC_D1_SCHEMA_OR_CLAIM_FAILED",attempted:0};}
  if(!claimed)return {ok:true,code:"SLOT_ALREADY_CLAIMED",attempted:0};
  const state={status:"FAILED",finished_at:now.toISOString(),
    scanned:0,signals_written:0,no_proof:0,failures:0,last_error_code:null};
  try{
    const keys=await (deps.loadKeys||loadPinnedKeys)(deps.fetchImpl||fetch);
    const buffer=(deps.createBuffer||createSevenDayBuffer)({
      url:env.RC_SUPABASE_URL,serviceKey:env.RC_SUPABASE_SERVICE_KEY,
      fetchImpl:deps.fetchImpl||fetch,now:()=>now
    });
    const reader=deps.readGro||readCountryGroB2;
    for(const iso3 of batch.countries){
      state.scanned++;
      try{
        const object=await reader(iso3,{keyId:env.RC_B2_READ_KEY_ID,
          applicationKey:env.RC_B2_READ_APPLICATION_KEY,fetchImpl:deps.fetchImpl||fetch});
        if(!object){state.no_proof++;continue;}
        const result=await verifySignedGro(object,{iso3,now,keys});
        if(!result.valid){state.no_proof++;continue;}
        const signals=await deriveSignalsFromSignedGro(object,iso3,result,now);
        if(!signals.length){state.no_proof++;continue;}
        for(const signal of signals){
          await buffer.putVerifiedSignal(signal);
          state.signals_written++;
        }
      }catch{
        state.failures++;
        state.last_error_code="COUNTRY_READ_VERIFY_OR_WRITE_FAILED";
      }
    }
    state.status=state.failures?"PARTIAL":"DONE";
    state.finished_at=new Date().toISOString();
    if(state.failures)state.last_error_code="PARTIAL_BATCH_FAILED";
    await complete(db,slot,state);
    return {ok:state.failures===0,code:state.status,slot_start:slot,
      batch_index:batch.index,attempted:state.scanned,signals_written:state.signals_written,
      no_current_proof:state.no_proof,failures:state.failures};
  }catch{
    state.last_error_code="PINNED_TRUST_OR_BUFFER_UNAVAILABLE";
    state.finished_at=new Date().toISOString();
    try{await complete(db,slot,state);}catch{ /* recovery always fail closed */ }
    return {ok:false,code:state.last_error_code,slot_start:slot,attempted:state.scanned};
  }
}
