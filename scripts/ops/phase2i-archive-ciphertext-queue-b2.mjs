#!/usr/bin/env node
/**
 * Source-only *ciphertext* B2 archival of the existing 72h private OSINT queue.
 * Four existing maintenance windows per UTC day; never an extra RSS GET.
 * This archive does NOT constitute per-original D1 admission or customer rights.
 * No source article URLs/titles, plaintext or encryption root are logged.
 */
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync,mkdirSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {createB2Client} from "./b2-s3-client.mjs";
import {createB2D1AccountGovernor} from "./b2-d1-account-governor.mjs";
import {verifyPhase2iSourceB2Lifecycle} from "./phase2h-verify-b2-72h-lifecycle.mjs";
import {PHASE2I_BACKLOG_ARTIFACT,selectPrivatePhase2iBacklogArtifact,
 unsealPrivatePhase2iSourceBacklog} from "../lib/phase2i-encrypted-source-backlog.mjs";

export const PHASE2I_B2_PREFIX="geomacro-evidence/v1/private/phase2i-source-queue/";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const fail=code=>{throw Error("PHASE2I_B2_"+code)};
const CATS=["geopolitics","macro","rare_earth"];
const sixHours=6*3600_000;

export function buildPhase2iCiphertextB2Object({
 envelope,root,now=new Date(),sourceRunId
}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isSafeInteger(sourceRunId)||sourceRunId<1)
  fail("INPUT_INVALID");
 const restored=unsealPrivatePhase2iSourceBacklog(envelope,root,now.getTime());
 const created=Date.parse(envelope.created_at);
 if(!Number.isFinite(created)||now.getTime()-created>sixHours||
    created>now.getTime()+60_000||restored.restored_authentic_originals<1)
  fail("NO_RECENT_NONEMPTY_AUTHENTIC_SOURCE_QUEUE");
 const counts=Object.fromEntries(CATS.map(x=>[x,0]));
 let d1Acknowledged=0;
 for(const row of restored.candidates){
  counts[row.category]++;
  if(row.d1Acknowledged===true)d1Acknowledged++;
 }
 // This object contains exactly the original authenticated AEAD queue;
 // the derived five-part content is not fabricated and no source URL leaks.
 const bytes=Buffer.from(JSON.stringify(envelope)+"\n","utf8");
 if(bytes.length>6_500_000)fail("ENVELOPE_TOO_LARGE");
 const digest=sha(bytes);
 const date=now.toISOString().slice(0,10).replaceAll("-","/");
 const key=PHASE2I_B2_PREFIX+date+"/"+sourceRunId+"-"+digest+".json";
 return Object.freeze({bytes,key,sha256:digest,source_run_id:sourceRunId,
  candidate_count:restored.restored_authentic_originals,
  expired_since_snapshot:restored.expired_since_capture,
  d1_acknowledged_in_snapshot:d1Acknowledged,
  not_d1_acknowledged_in_snapshot:restored.restored_authentic_originals-d1Acknowledged,
  category_counts:counts,source_snapshot_created_at:envelope.created_at});
}
export function verifyPhase2iCiphertextB2Readback(bytes,plan,root,now=new Date()){
 if(!Buffer.isBuffer(bytes)||!bytes.equals(plan.bytes)||sha(bytes)!==plan.sha256)
  fail("FULL_BODY_SHA_MISMATCH");
 let envelope;
 try{envelope=JSON.parse(bytes.toString("utf8"))}
 catch{fail("RESTORE_JSON_INVALID")}
 const restored=unsealPrivatePhase2iSourceBacklog(envelope,root,now.getTime());
 if(restored.restored_authentic_originals!==plan.candidate_count||
    restored.candidates.filter(c=>c.d1Acknowledged===true).length!==
      plan.d1_acknowledged_in_snapshot)
  fail("RESTORED_CANDIDATE_COUNTS_DIVERGED");
 return true;
}
export async function readPhase2iProtectedArtifact({
 token,now=new Date(),fetchImpl=fetch,downloadImpl=execFileSync
}={}){
 if(typeof token!=="string"||token.length<20)fail("ACTIONS_READ_TOKEN_MISSING");
 const url="https://api.github.com/repos/blocknine0/geomacro/actions/artifacts?per_page=100&name="+
  encodeURIComponent(PHASE2I_BACKLOG_ARTIFACT);
 const response=await fetchImpl(url,{redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28"},
  signal:AbortSignal.timeout(15_000)});
 if(response.status!==200||response.redirected)fail("ARTIFACT_INDEX_UNAVAILABLE");
 const doc=await response.json();
 if(!Array.isArray(doc?.artifacts)||doc.artifacts.length>100||
    !Number.isSafeInteger(doc.total_count)||doc.total_count>500)
  fail("ARTIFACT_INDEX_AMBIGUOUS");
 const found=selectPrivatePhase2iBacklogArtifact(doc.artifacts,now.getTime());
 if(!found||now.getTime()-Date.parse(found.created_at)>sixHours)
  fail("NO_RECENT_MAIN_SOURCE_SNAPSHOT");
 const dir=mkdtempSync(join(tmpdir(),"geomacro-phase2i-b2-"));
 try{
  downloadImpl("gh",["run","download",String(found.workflow_run.id),
   "--repo","blocknine0/geomacro","--name",PHASE2I_BACKLOG_ARTIFACT,
   "--dir",dir],{env:{...process.env,GH_TOKEN:token},
   stdio:["ignore","ignore","pipe"],timeout:50_000,maxBuffer:96*1024});
  const bytes=readFileSync(join(dir,"queue.json"),"utf8");
  if(bytes.length>6_500_000)fail("ARTIFACT_OVERSIZE");
  return {envelope:JSON.parse(bytes),sourceRunId:found.workflow_run.id};
 }finally{rmSync(dir,{recursive:true,force:true})}
}
async function exactD1Id(env,fetchImpl){
 const account=String(env.CLOUDFLARE_ACCOUNT_ID??"");
 const token=String(env.CLOUDFLARE_API_TOKEN??"");
 if(!/^[a-f0-9]{32}$/u.test(account)||token.length<20)
  fail("D1_GOVERNOR_AUTH_MISSING");
 const result=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
  account+"/d1/database?per_page=100",{redirect:"error",
  headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(15000)});
 if(result.status!==200||result.redirected)fail("D1_DATABASE_DISCOVERY_FAILED");
 const doc=await result.json();
 const matched=doc?.result?.filter(x=>x.name==="geomacro-control-plane")??[];
 if(doc.success!==true||matched.length!==1||
    !/^[a-f0-9-]{36}$/iu.test(matched[0].uuid??""))
  fail("EXACT_D1_DATABASE_UNVERIFIED");
 return matched[0].uuid;
}
export async function runPhase2iCiphertextB2Archive({
 env=process.env,now=new Date(),fetchImpl=fetch,
 artifactReader=readPhase2iProtectedArtifact,
 lifecycleVerifier=verifyPhase2iSourceB2Lifecycle,
 b2Factory=createB2Client,
 governorFactory=createB2D1AccountGovernor,
}={}){
 if(env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    env.GITHUB_EVENT_NAME!=="schedule"||
    env.GITHUB_WORKFLOW_REF!==
      "blocknine0/geomacro/.github/workflows/phase2h-private-raw-archive.yml@refs/heads/main"||
    env.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
    env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||
    env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=="derived_news_backup"||
    env.B2_REQUEST_BUDGET!=="10"||
    String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").length<32||
    !/^\d{1,20}$/u.test(env.GITHUB_RUN_ID??""))
  fail("PROTECTED_MAIN_MAINTENANCE_REQUIRED");
 // No other workflow/cron/dispatch can drain the shared B2 quota.
 const event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH??"/missing","utf8"));
 if(event?.schedule!=="29 0,6,12,18 * * *")
  fail("UNAPPROVED_SCHEDULE");
 const root=env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
 const {envelope,sourceRunId}=await artifactReader({
   token:env.GH_TOKEN,now,fetchImpl});
 const plan=buildPhase2iCiphertextB2Object({envelope,root,now,sourceRunId});
 const runtimeEnv={...env,D1_DATABASE_ID:await exactD1Id(env,fetchImpl)};
 // Existing canonical B2 client gets its atomic D1 guard from process.env.
 // This job sets only the independently verified canonical D1 UUID.
 const previousId=process.env.D1_DATABASE_ID;
 process.env.D1_DATABASE_ID=runtimeEnv.D1_DATABASE_ID;
 try{
  const governor=governorFactory({env:runtimeEnv,fetchImpl});
  const quota=await governor.status();
  if(quota?.ok!==true||quota.used.total>quota.limits.total-7||
     quota.used.GET>quota.limits.GET-4||
     quota.used.PUT>quota.limits.PUT-2||
     quota.used.NATIVE_AUTH>quota.limits.NATIVE_AUTH-2)
   fail("B2_SHARED_HEADROOM_HELD");
  const lifecycle=await lifecycleVerifier({env:runtimeEnv,fetchImpl,governor});
  if(lifecycle?.phase2i_source_queue_prefix_verified!==true||
     lifecycle?.private_72h_delete_lifecycle_verified!==true||
     lifecycle?.no_bucket_mutation!==true)
   fail("SOURCE_CIPHERTEXT_LIFECYCLE_NOT_VERIFIED");
  const b2=b2Factory({endpointUrl:"https://s3.us-east-005.backblazeb2.com",
   bucket:"geomacro-private-archive",accessKey:env.B2_KEY_ID,
   secretKey:env.B2_APPLICATION_KEY,
   readAccessKey:env.B2_ARCHIVE_READ_KEY_ID,
   readSecretKey:env.B2_ARCHIVE_READ_APPLICATION_KEY});
  const first=await b2.putWithMetadataVerification(plan.key,plan.bytes,{
   verifyRestored:restored=>verifyPhase2iCiphertextB2Readback(
     Buffer.from(restored),plan,root,now)
  });
  if(first?.full_body_readback_verified!==true||first.sha256!==plan.sha256||
     first.bytes!==plan.bytes.length)
   fail("B2_FIRST_PUT_GET_NOT_VERIFIED");
  const second=await b2.get(plan.key);
  verifyPhase2iCiphertextB2Readback(Buffer.from(second),plan,root,now);
  return Object.freeze({
   schema:"geomacro.phase2i.private-source-queue-b2-acceptance.v1",
   status:"B2_ENCRYPTED_SOURCE_QUEUE_PUT_TWO_GET_SHA_VERIFIED",
   b2_private_ciphertext_verified:true,
   b2_two_independent_gets_verified:true,
   b2_provider_lifecycle_verified:true,
   source_run_id:plan.source_run_id,
   source_snapshot_created_at:plan.source_snapshot_created_at,
   candidate_count:plan.candidate_count,
   category_counts:plan.category_counts,
   d1_acknowledged_in_snapshot:plan.d1_acknowledged_in_snapshot,
   not_d1_acknowledged_in_snapshot:plan.not_d1_acknowledged_in_snapshot,
   b2_object_sha256:plan.sha256,
   all_candidates_individually_d1_verified:
     plan.not_d1_acknowledged_in_snapshot===0,
   source_native_clocks_unchanged:true,encrypted_raw_metadata_only:true,
   archive_source_item_full_html:false,customer_paid_rights_verified:false,
   predge_changed:false,payments:0
  });
 }finally{
  if(previousId===undefined)delete process.env.D1_DATABASE_ID;
  else process.env.D1_DATABASE_ID=previousId;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===pathToFileURL(import.meta.url)){
 try{
  const r=await runPhase2iCiphertextB2Archive();
  mkdirSync("artifacts/derived-news",{recursive:true,mode:0o700});
  writeFileSync("artifacts/derived-news/phase2i-ciphertext-b2-acceptance.json",
   JSON.stringify(r,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(r));
 }catch(e){
  const msg=String(e?.message??"");
  console.error("::error::"+
   (/^PHASE2I_B2_[A-Z0-9_]+$/u.test(msg)?msg:
    "PHASE2I_B2_PROVIDER_ARCHIVE_NOT_VERIFIED"));
  process.exitCode=3;
 }
}
