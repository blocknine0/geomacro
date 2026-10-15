import {createHash} from 'node:crypto';

const URL='https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/hot-snapshot/intelligence';
const SHA=/^[a-f0-9]{64}$/u;
const fail=()=>{throw Error('INTELLIGENCE_PUBLIC_D1_READBACK_UNVERIFIED');};

// A successful authenticated PUT is insufficient. Read the unauthenticated
// serving route and bind its exact bytes, native clock and proof to this run.
// No B2 request, payment, private source field or upstream error is emitted.
export async function verifyPublishedIntelligenceReadback(receipt,{
  expectedSourceRunId=process.env.GITHUB_RUN_ID,fetchImpl=fetch,now=()=>Date.now(),
}={}){
  if(receipt?.ok!==true||receipt.full_b2_readback_verified!==true||
     receipt.exact_gzip_restore_verified!==true||receipt.d1_hot_snapshot_published!==true||
     receipt.supabase_reads!==0||receipt.supabase_writes!==0||
     receipt.external_payment_executed!==false||
     !SHA.test(receipt.b2_sha256??'')||!SHA.test(receipt.payload_sha256??'')||
     !Number.isFinite(Date.parse(receipt.source_as_of??''))||
     !/^\d{1,20}$/u.test(String(expectedSourceRunId??'')))fail();
  let live;
  try{
    const response=await fetchImpl(URL,{
      headers:{Accept:'application/json','Cache-Control':'no-cache'},
      redirect:'error',signal:AbortSignal.timeout(15000),
    });
    if(!response.ok)fail();
    live=await response.json();
  }catch{fail();}
  const at=now();
  if(!Number.isFinite(at)||live?.ok!==true||live.product!=='intelligence'||
     live.proof_schema!=='geomacro.public-intelligence-live-proof.v1'||
     live.b2_sha256!==receipt.b2_sha256||live.payload_sha256!==receipt.payload_sha256||
     String(live.source_run_id)!==String(expectedSourceRunId)||
     live.source_as_of!==receipt.source_as_of||
     !(Date.parse(live.expires_at)>at)||
     Date.parse(live.source_as_of)>at||at-Date.parse(live.source_as_of)>6*3600000||
     typeof live.payload_json!=='string'||Buffer.byteLength(live.payload_json)>2*1024*1024||
     createHash('sha256').update(live.payload_json).digest('hex')!==receipt.payload_sha256)
    fail();
  return {ok:true,schema:'geomacro.reviewed-intelligence-public-readback.v1',
    source_as_of:live.source_as_of,payload_sha256:receipt.payload_sha256,
    d1_public_readback_verified:true,b2_readback_verified:true,
    supabase_reads:0,supabase_writes:0,external_payment_executed:false};
}
