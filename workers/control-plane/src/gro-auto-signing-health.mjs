/** Called only behind the existing owner-admin authentication guard. */
export async function readGroAutoSigningHealth(env,now=Date.now()){
 try{
  const cycle=await env.DB.prepare('SELECT run_id,source_sha,finished_at,signer_key_id,signer_pair_verified,claimed,signed,failed,state FROM gro_auto_signing_cycles WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1').first();
  const pending=await env.DB.prepare("SELECT state,COUNT(*) AS n FROM gro_auto_signing_jobs WHERE state IN ('PENDING','LEASED','RETRY') AND expires_at>? GROUP BY state").bind(new Date(now).toISOString()).all();
  if(!Array.isArray(pending?.results))throw Error('INVALID_PENDING');
  // The signer being operational is NOT proof that any paid, current signed
  // product exists. Use the existing (state, expires_at) D1 index to avoid
  // a table-wide history scan against the founder's D1 rows-read budget.
  // This is a recorded successful outside-in readback at the time of issue,
  // NOT another live HTTP readback or authorization to charge customers.
  const stamp=new Date(now).toISOString();
  const signed=await env.DB.prepare(
    "SELECT signed_record_sha256 FROM gro_auto_signing_jobs WHERE state='SIGNED' AND expires_at>? AND signed_gro_expires_at>? AND length(signed_record_sha256)=64 LIMIT 1"
  ).bind(stamp,stamp).first();
  const age=cycle?now-Date.parse(cycle.finished_at):null;
  const fresh=Number.isFinite(age)&&age>=0&&age<=40*60000;
  return {ok:true,schema:'geomacro.gro-auto-signing-health.v1',
   automation_active:fresh&&cycle.signer_pair_verified===1&&cycle.state==='DONE',
   signer_pair_verified:cycle?.signer_pair_verified===1,
   unexpired_qualified_signed_record_available:!!signed,
   current_live_worker_readback_rechecked:false,
   signer_operational_is_not_delivery_qualification:true,
   paid_customer_delivery_verified:false,
   qualification_pipeline_state:signed?'SIGNED_HOT_PREVIOUS_READBACK_UNEXPIRED':'NO_CURRENT_QUALIFIED_SIGNED_JOB',
   last_cycle:cycle?{run_id:cycle.run_id,source_sha:cycle.source_sha,finished_at:cycle.finished_at,
    state:cycle.state,claimed:cycle.claimed,signed:cycle.signed,failed:cycle.failed}:null,
   pending:Object.fromEntries(pending.results.map(row=>[row.state,Number(row.n)])),
   signing_preparation_only:true,decision_path_queue_less:true,
   execution_authorized:false,payment_performed:false};
 }catch{return {ok:false,schema:'geomacro.gro-auto-signing-health.v1',automation_active:false,error:'GRO_AUTO_SIGNING_HEALTH_UNAVAILABLE'}}
}
