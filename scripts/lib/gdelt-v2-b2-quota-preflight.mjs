/**
 * Protected GDELT V2 account-wide quota admission before ANY archive network.
 * This is only a read-only advisory preflight: actual S3 PUT/GET still make
 * their own atomic reservations in createB2Client(). No false B2 ACK is issued.
 */
import {createB2D1AccountGovernor} from '../ops/b2-d1-account-governor.mjs';
import {evaluateGovernedB2Headroom} from './governed-b2-headroom.mjs';

export async function requireGdeltV2B2PacedHeadroom({
 env=process.env,now=new Date(),governorFactory=createB2D1AccountGovernor,
}={}){
 if(env.B2_ACCOUNT_QUOTA_REQUIRED!=='1'||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=='gdelt_v2_event_sync'||
    env.B2_REQUEST_BUDGET!=='4'||!env.D1_DATABASE_ID||
    !env.CLOUDFLARE_API_TOKEN||!env.CLOUDFLARE_ACCOUNT_ID)
  throw Error('GDELT_V2_B2_QUOTA_GOVERNANCE_REQUIRED');
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw Error('GDELT_V2_B2_QUOTA_CLOCK_INVALID');
 const quota=await governorFactory({env}).status();
 const decision=evaluateGovernedB2Headroom(quota,{
  now,getRequests:1,putRequests:1,
 });
 if(decision.admitted!==true)
  // Never spend quota on a run that cannot perform both immutable-object
  // operations. The next scheduled run checks a fresh UTC-day provider ledger.
  throw Error('GDELT_V2_B2_SHARED_QUOTA_HELD');
 return Object.freeze({schema:'geomacro.gdelt-v2-b2-preflight.v1',
  admitted:true,atomic_s3_reservations_still_required:true,
  expected_s3_get:1,expected_s3_put:1,b2_network_attempts:0,
  commercial_eligible:false,payments:0});
}
