import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const HASH=/^[a-f0-9]{40}$/;
function assertContext(input) {
  if(input.repository!=="blocknine0/geomacro"||input.ref!=="refs/heads/main"||
     !["workflow_dispatch","repository_dispatch","workflow_run"].includes(input.eventName)||
     !HASH.test(input.githubSha??"")||input.expectedSha!==input.githubSha||
     input.checkoutSha!==input.githubSha)
    throw Error("BACKEND_PUBLICATION_TRUSTED_MAIN_REQUIRED");
}
export function verifyBackendPublicationRevision(input) {
  assertContext(input);
  if(!HASH.test(input.remoteMainSha??"")||input.remoteMainSha!==input.githubSha)
    throw Error("BACKEND_PUBLICATION_MAIN_MOVED_OR_UNVERIFIED");
  return {schema:"geomacro.backend-publication-code-admission.v1",
    canonical_main_sha:input.githubSha,canonical_code_revision_verified:true,
    website_deployment_checked:false,reviewed_input_checked:false,
    current_signed_publication_verified:false,b2_requests:0,d1_writes:0,payments:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try {
    const git=args=>execFileSync("git",args,{encoding:"utf8",timeout:15000,
      stdio:["ignore","pipe","pipe"]}).trim();
    const input={repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,
      eventName:process.env.GITHUB_EVENT_NAME,githubSha:process.env.GITHUB_SHA,
      expectedSha:process.env.EXPECTED_SHA,checkoutSha:git(["rev-parse","HEAD"])};
    assertContext(input);
    const remote=git(["ls-remote","https://github.com/blocknine0/geomacro.git","refs/heads/main"]);
    const match=/^([a-f0-9]{40})\s+refs\/heads\/main$/.exec(remote);
    console.log(JSON.stringify(verifyBackendPublicationRevision({...input,remoteMainSha:match?.[1]})));
  } catch {
    console.error("BACKEND_PUBLICATION_TRUSTED_CURRENT_MAIN_NOT_VERIFIED");
    process.exitCode=2;
  }
}
