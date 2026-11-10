/**
 * Owner-only GitHub issue -> single-use workflow_dispatch contract.
 * Untrusted GitHub issue text is NEVER code, shell, a URL, a filename, a
 * workflow ID, a GitHub ref or a secret. All operations have fixed, reviewed
 * targets and canonical protected no-funds inputs.
 *
 * This contract is a request admission, NOT an approval of production SQL:
 * the protected target still independently verifies Shadow/D1/B2, signing,
 * monthly Paid quota, exact head and rollback requirements.
 */
export const OWNER_ISSUE_DISPATCH_REPO="blocknine0/geomacro";
export const OWNER_ISSUE_DISPATCH_LOGIN="blocknine0";
export const OWNER_ISSUE_DISPATCH_TITLE="GeoMacro Owner Dispatch Request";
export const OWNER_ISSUE_DISPATCH_SCHEMA="geomacro.owner-issue-dispatch.v1";
export const OWNER_ISSUE_DISPATCH_TARGET="production-rollout-orchestrator.yml";
export const OWNER_ISSUE_HANDSHAKE_TARGET="owner-dispatch-handshake.yml";
export const OWNER_ISSUE_CANARY_CANDIDATE_TARGET="geomacro-optimized-worker-candidate.yml";
export const OWNER_ISSUE_CANARY_ROLLOUT_TARGET="geomacro-protected-hot50-worker-rollout.yml";
export const OWNER_ISSUE_HOLD_REVIEW_TARGET="canary-promotion.yml";
export const OWNER_ISSUE_MINIMUM_RISK_BACKUP_TARGET="phase2h-private-r2-b2-quota-backup.yml";
export const OWNER_ISSUE_CANARY_SCHEMA="geomacro.owner-issue-dispatch.v2";
const SHA=/^[a-f0-9]{40}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RUN_ID=/^[1-9][0-9]{5,20}$/u;
const ISSUE_KEYS=["authorization","intent","schema","source_sha","verify_hot50"];
const CANARY_KEYS=Object.freeze({
 "candidate-upload":ISSUE_KEYS,
 "minimum-risk-facts-backup":ISSUE_KEYS,
 "canary-rollout":[...ISSUE_KEYS,
  "baseline_version_id","candidate_version_id","stage2_run_id"],
 "canary-hold-review":[...ISSUE_KEYS,
  "baseline_version_id","candidate_version_id","stage2_run_id",
  "promotion_run_id"]
});
const MAX_ISSUE_AGE_MS=24*60*60*1000;
function fail(code){throw Error("OWNER_DISPATCH_"+code)}
const sorted=a=>[...a].sort().join("|");
export function planOwnerIssueDispatch({event,env,now=new Date()}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    env?.GITHUB_REPOSITORY!==OWNER_ISSUE_DISPATCH_REPO||
    env?.GITHUB_REF!=="refs/heads/main"||
    env?.GITHUB_EVENT_NAME!=="issues"||
    env?.GITHUB_ACTOR!==OWNER_ISSUE_DISPATCH_LOGIN||
    !SHA.test(env?.GITHUB_SHA??""))
  fail("TRUSTED_MAIN_RUNNER_REQUIRED");
 const issue=event?.issue;
 if(event?.action!=="opened"||
    event?.repository?.full_name!==OWNER_ISSUE_DISPATCH_REPO||
    event?.sender?.login!==OWNER_ISSUE_DISPATCH_LOGIN||
    event?.sender?.type!=="User"||
    issue?.user?.login!==OWNER_ISSUE_DISPATCH_LOGIN||
    issue?.user?.type!=="User"||
    issue?.author_association!=="OWNER"||
    issue?.title!==OWNER_ISSUE_DISPATCH_TITLE||
    issue?.state!=="open"||issue?.pull_request!=null||
    !Number.isSafeInteger(issue?.number)||issue.number<=0||
    typeof issue?.body!=="string"||issue.body.length>1400||
    !Number.isFinite(Date.parse(issue?.updated_at??""))||
    Date.parse(issue.updated_at)<Date.parse(issue.created_at??""))
  fail("TRUSTED_OWNER_NEW_ISSUE_REQUIRED");
 const created=Date.parse(issue.created_at??"");
 if(!Number.isFinite(created)||created>now.getTime()+120000||
    now.getTime()-created>MAX_ISSUE_AGE_MS)
  fail("ISSUE_TIMESTAMP_STALE_OR_INVALID");
 let request;
 try{request=JSON.parse(issue.body)}
 catch{fail("STRICT_JSON_BODY_REQUIRED")}
 const isCanary=Boolean(request&&typeof request==="object"&&!Array.isArray(request)&&
  request.schema===OWNER_ISSUE_CANARY_SCHEMA);
 const allowedKeys=isCanary?CANARY_KEYS[request?.intent]:ISSUE_KEYS;
 if(request===null||Array.isArray(request)||typeof request!=="object"||
    !Array.isArray(allowedKeys)||
    sorted(Object.keys(request))!==sorted(allowedKeys)||
    ![OWNER_ISSUE_DISPATCH_SCHEMA,OWNER_ISSUE_CANARY_SCHEMA].includes(request.schema)||
    !SHA.test(request.source_sha??"")||
    request.source_sha!==env.GITHUB_SHA||
    typeof request.verify_hot50!=="boolean")
  fail("STRICT_REQUEST_SCHEMA_OR_SHA_MISMATCH");
 if(isCanary&&["canary-rollout","canary-hold-review"].includes(request.intent)&&(
    !UUID.test(request.baseline_version_id??"")||
    !UUID.test(request.candidate_version_id??"")||
    request.baseline_version_id.toLowerCase()===
      request.candidate_version_id.toLowerCase()||
    !RUN_ID.test(request.stage2_run_id??"")))
  fail("CANARY_IMMUTABLE_VERSIONS_OR_STAGE2_PROOF_INVALID");
 if(isCanary&&request.intent==="canary-hold-review"&&
    (!RUN_ID.test(request.promotion_run_id??"")||
     request.promotion_run_id===request.stage2_run_id))
  fail("CANARY_PRIOR_PROMOTION_PROOF_INVALID");
 const intents={
  "gateway-handshake":{
   authorization:"OWNER_AUTHORIZE_NO_FUNDS_GATEWAY_HANDSHAKE",
   verify_hot50:false,target:OWNER_ISSUE_HANDSHAKE_TARGET,
   inputs:{approved_main_sha:request.source_sha,request_issue:String(issue.number)}
  },
  "shadow-rehearsal":{
   authorization:"OWNER_AUTHORIZE_SHADOW_ONLY_NO_PRODUCTION_SQL",
   verify_hot50:false,target:OWNER_ISSUE_DISPATCH_TARGET,
   inputs:{approval:"REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL",
    execute_stage2:"false",verify_hot50:"false"}
  },
  "stage2-production":{
   authorization:"OWNER_AUTHORIZE_REAL_PRODUCTION_D1_0204_0211_0212_0213_NO_FUNDS",
   verify_hot50:true,target:OWNER_ISSUE_DISPATCH_TARGET,
   inputs:{approval:"REHEARSE_D1_SHADOW_ONLY_NO_PRODUCTION_SQL",
    execute_stage2:"true",verify_hot50:"true"}
  }
 };
 const canaryIntents={
  "minimum-risk-facts-backup":{
   authorization:"OWNER_AUTHORIZE_BROTLI11_RISK_MINIMUM_PRIVATE_R2_NO_B2_NO_FUNDS",
   verify_hot50:false,target:OWNER_ISSUE_MINIMUM_RISK_BACKUP_TARGET,
   inputs:{approval:"BACKUP_PHASE2H_PRIVATE_R2_NO_B2_OR_FUNDS"}
  },
  "candidate-upload":{
   authorization:"OWNER_AUTHORIZE_ZERO_TRAFFIC_EXACT_MAIN_WORKER_CANDIDATE_NO_FUNDS",
   verify_hot50:false,target:OWNER_ISSUE_CANARY_CANDIDATE_TARGET,
   inputs:{approval:"UPLOAD_EXACT_MAIN_ZERO_TRAFFIC_NO_FUNDS"}
  },
  "canary-rollout":{
   authorization:"OWNER_AUTHORIZE_PROTECTED_HOT50_0_TO_100_NO_FUNDS",
   verify_hot50:true,target:OWNER_ISSUE_CANARY_ROLLOUT_TARGET,
   inputs:{baseline_version_id:request.baseline_version_id,
    candidate_version_id:request.candidate_version_id,
    confirmation:"PROMOTE_HOT50_NO_FUNDS",
    stage2_run_id:request.stage2_run_id}
  },
  "canary-hold-review":{
   authorization:"OWNER_AUTHORIZE_READ_ONLY_CANARY_HOLD_REVIEW_NO_FUNDS",
   verify_hot50:true,target:OWNER_ISSUE_HOLD_REVIEW_TARGET,
   inputs:{operation:"release-hold",
    baseline_version_id:request.baseline_version_id,
    candidate_version_id:request.candidate_version_id,
    confirmation:"REVIEW_HOT50_HOLD_NO_FUNDS",
    stage2_run_id:request.stage2_run_id,
    promotion_run_id:request.promotion_run_id}
  }
 };
 const approved=isCanary?canaryIntents:intents;
 if(!Object.hasOwn(approved,request.intent)||
    request.authorization!==approved[request.intent]?.authorization||
    request.verify_hot50!==approved[request.intent].verify_hot50)
  fail("INTENT_OR_OWNER_AUTHORIZATION_INVALID");
 const selected=approved[request.intent];
 return Object.freeze({
  issue_number:issue.number,issue_body:issue.body,
  event_issue_created_at:issue.created_at,
  event_issue_updated_at:issue.updated_at,
  source_sha:request.source_sha,
  intent:request.intent,target: selected.target,
  ref:"main",inputs:Object.freeze({...selected.inputs}),
  no_funds:true,
  direct_prod_sql_authorized:false,
  target_protected_admission_required:request.intent==="stage2-production"||isCanary,
 });
}
export function assertLiveOwnerIssue({current,plan}={}){
 if(current?.number!==plan?.issue_number||
    current?.state!=="open"||
    current?.title!==OWNER_ISSUE_DISPATCH_TITLE||
    current?.body!==plan.issue_body||
    current?.user?.login!==OWNER_ISSUE_DISPATCH_LOGIN||
    current?.user?.type!=="User"||
    current?.author_association!=="OWNER"||
    current?.pull_request!=null||
    current?.created_at!==plan.event_issue_created_at||
    current?.updated_at!==plan.event_issue_updated_at)
  fail("LIVE_ISSUE_CHANGED_OR_ALREADY_CONSUMED");
 return true;
}
export function assertExactRemoteMain({remote,plan,env}={}){
 if(!SHA.test(remote?.commit?.sha??"")||
    remote.commit.sha!==plan?.source_sha||
    remote.commit.sha!==env?.GITHUB_SHA||
    remote.name!=="main")
  fail("REMOTE_MAIN_MOVED_OR_UNVERIFIED");
 return true;
}
