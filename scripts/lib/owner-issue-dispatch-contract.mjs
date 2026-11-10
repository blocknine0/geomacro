/**
 * Owner-only GitHub issue -> single-use workflow_dispatch contract.
 * Untrusted GitHub issue text is NEVER code, shell, a URL, a filename, a
 * workflow ID, a GitHub ref or a secret. Only three hardcoded operations exist.
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
const SHA=/^[a-f0-9]{40}$/u;
const ISSUE_KEYS=["authorization","intent","schema","source_sha","verify_hot50"];
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
    typeof issue?.body!=="string"||issue.body.length>1400)
  fail("TRUSTED_OWNER_NEW_ISSUE_REQUIRED");
 const created=Date.parse(issue.created_at??"");
 if(!Number.isFinite(created)||created>now.getTime()+120000||
    now.getTime()-created>MAX_ISSUE_AGE_MS)
  fail("ISSUE_TIMESTAMP_STALE_OR_INVALID");
 let request;
 try{request=JSON.parse(issue.body)}
 catch{fail("STRICT_JSON_BODY_REQUIRED")}
 if(request===null||Array.isArray(request)||typeof request!=="object"||
    sorted(Object.keys(request))!==sorted(ISSUE_KEYS)||
    request.schema!==OWNER_ISSUE_DISPATCH_SCHEMA||
    !SHA.test(request.source_sha??"")||
    request.source_sha!==env.GITHUB_SHA||
    typeof request.verify_hot50!=="boolean")
  fail("STRICT_REQUEST_SCHEMA_OR_SHA_MISMATCH");
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
 if(!Object.hasOwn(intents,request.intent)||
    request.authorization!==intents[request.intent]?.authorization||
    request.verify_hot50!==intents[request.intent].verify_hot50)
  fail("INTENT_OR_OWNER_AUTHORIZATION_INVALID");
 const selected=intents[request.intent];
 return Object.freeze({
  issue_number:issue.number,issue_body:issue.body,
  event_issue_created_at:issue.created_at,
  source_sha:request.source_sha,
  intent:request.intent,target: selected.target,
  ref:"main",inputs:Object.freeze({...selected.inputs}),
  no_funds:true,
  direct_prod_sql_authorized:false,
  target_protected_admission_required:request.intent==="stage2-production",
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
    current?.created_at!==plan.event_issue_created_at)
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
