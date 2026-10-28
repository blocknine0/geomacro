/**
 * Account-read-only proof that an old deployed Worker SHA and current main
 * differ ONLY in an explicit observability-only file allowlist. This does
 * not change deployed Worker, PREDGE, migrations, bindings or source clocks.
 * Any unknown/runtime/secret/config change requires real deployment proof.
 */
const SHA=/^[a-f0-9]{40}$/;
const ALLOWED=new Set([
 ".github/workflows/d1-launch-72h-observatory.yml",
 "config/github-workflow-inventory.v1.json",
 "scripts/lib/d1-launch-window.mjs",
 "scripts/ops/capture-d1-launch-insights.mjs",
 "scripts/ops/d1-launch-github-verification.mjs",
 "scripts/ops/d1-launch-hourly-observer.mjs",
 "scripts/ops/evaluate-d1-launch-72h.mjs",
 "scripts/ops/verify-deployed-runtime-equivalence.mjs",
 "scripts/tests/capture-d1-launch-insights.test.mjs",
 "scripts/tests/d1-launch-github-verification.test.mjs",
 "scripts/tests/d1-launch-hourly-observer.test.mjs",
 "scripts/tests/d1-launch-window.test.mjs",
 "scripts/tests/verify-deployed-runtime-equivalence.test.mjs"
]);
const reason=error=>Object.freeze({verified:false,reason:error});
export function assessDeployedRuntimeCompare(doc,deployedSha,mainSha){
 if(!SHA.test(String(deployedSha))||!SHA.test(String(mainSha))||
   deployedSha===mainSha)return reason("RUNTIME_COMPARE_SHA_PAIR_INVALID");
 if(doc?.status!=="ahead"||doc?.ahead_by<1||doc?.ahead_by>100||
    doc?.behind_by!==0||doc?.total_commits!==doc.ahead_by||
    !Array.isArray(doc?.files)||!doc.files.length||doc.files.length>100)
   return reason("RUNTIME_COMPARE_ANCESTRY_OR_FILES_UNVERIFIED");
 const seen=new Set();
 for(const f of doc.files){
  if(!f||typeof f.filename!=="string"||!ALLOWED.has(f.filename)||
    seen.has(f.filename)||!["added","modified"].includes(f.status)||
    (f.filename==="config/github-workflow-inventory.v1.json"&&f.status!=="modified"))
   return reason("RUNTIME_COMPARE_UNAPPROVED_SOURCE_CHANGE");
  seen.add(f.filename);
 }
 return Object.freeze({verified:true,
  source_runtime_unchanged_by_all_intervening_commits:true,
  exact_sha_equal:false,observed_deploy_sha:deployedSha,
  current_main_sha:mainSha,observability_only_changed_files:seen.size,
  interposing_commit_count:doc.total_commits,
  provider:"GITHUB_COMPARE_FULL_FILE_DIFF",
  predge_runtime_modified:false});
}
export async function verifyDeployedRuntimeEquivalence({
 fetchImpl=fetch,env=process.env,deployedSha,mainSha=env.GITHUB_SHA
}={}){
 if(!SHA.test(String(deployedSha))||!SHA.test(String(mainSha)))
  return reason("RUNTIME_COMPARE_SHA_MISSING");
 if(deployedSha===mainSha)return Object.freeze({verified:true,
  exact_sha_equal:true,source_runtime_unchanged_by_all_intervening_commits:true,
  observed_deploy_sha:deployedSha,current_main_sha:mainSha,
  provider:"EXACT_DEPLOYED_SHA",predge_runtime_modified:false});
 const token=env.GH_TOKEN??env.GITHUB_TOKEN;
 if(typeof token!=="string"||token.length<20)
  return reason("RUNTIME_COMPARE_AUTH_MISSING");
 try{
  const uri="https://api.github.com/repos/blocknine0/geomacro/compare/"+
    deployedSha+"..."+mainSha;
  const response=await fetchImpl(uri,{method:"GET",redirect:"error",
   headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28"},
   signal:AbortSignal.timeout(12000)});
  if(response?.status!==200)return reason("RUNTIME_COMPARE_PROVIDER_UNAVAILABLE");
  const declared=Number(response.headers?.get("content-length")??0);
  if(declared>1_000_000)return reason("RUNTIME_COMPARE_RESPONSE_OVERSIZE");
  const raw=await response.text();
  if(raw.length>1_000_000)return reason("RUNTIME_COMPARE_RESPONSE_OVERSIZE");
  return assessDeployedRuntimeCompare(JSON.parse(raw),deployedSha,mainSha);
 }catch{return reason("RUNTIME_COMPARE_PROVIDER_UNAVAILABLE")}
}
