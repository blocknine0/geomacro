/**
 * Strict code-scanning acceptance for Geomacro's three high-severity alerts.
 *
 * This queries GitHub's authoritative Code Scanning REST API after CodeQL SARIF
 * processing on the exact main commit. A successful scanner process is NOT
 * evidence that alert #107, #115 and #120 are fixed. Dismissal is not a fix.
 * The workflow never modifies alerts, bypasses a security gate, or logs tokens.
 */
import {pathToFileURL} from "node:url";

export const REMEDIATED_ALERT_NUMBERS = Object.freeze([107, 115, 120]);
export const CODEQL_REPOSITORY = "blocknine0/geomacro";
export const CODEQL_REF = "refs/heads/main";
const SHA = /^[a-f0-9]{40}$/u;
const DELAY_MS = 8000;
const MAX_POLLS = 8;

function ensure(cond, code) {
  if (!cond) throw new Error(code);
}
function requestHeaders(token) {
  return {
    "Authorization": "Bearer " + token,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "geomacro-codeql-security-closure-check"
  };
}
async function githubJson(fetchImpl, path, token) {
  let res;
  try {
    res = await fetchImpl(
      "https://api.github.com/repos/" + CODEQL_REPOSITORY + path,
      {method:"GET",redirect:"error",cache:"no-store",
       headers:requestHeaders(token),signal:AbortSignal.timeout(20000)}
    );
  } catch {
    throw new Error("CODEQL_SECURITY_API_UNAVAILABLE");
  }
  if (res.status !== 200) {
    // Only status is exposed; never print the auth token or raw API body.
    throw new Error("CODEQL_SECURITY_API_HTTP_" + res.status);
  }
  try {return await res.json();}
  catch {throw new Error("CODEQL_SECURITY_API_JSON_INVALID");}
}
function validAnalysis(x, sha) {
  return x && x.commit_sha === sha &&
    x.ref === CODEQL_REF && x.tool?.name === "CodeQL" &&
    x.error === "" || Boolean(x && x.commit_sha === sha &&
      x.ref === CODEQL_REF && x.tool?.name === "CodeQL" &&
      (x.error === null || x.error === undefined));
}
export async function verifyCodeqlClosure({
  fetchImpl=fetch,token,sha,repo=CODEQL_REPOSITORY,
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  maxPolls=MAX_POLLS,
}={}) {
  ensure(repo===CODEQL_REPOSITORY && SHA.test(String(sha??"")) &&
    typeof token==="string" && token.length>=20 &&
    typeof fetchImpl==="function" && typeof pause==="function" &&
    Number.isInteger(maxPolls) && maxPolls>=1 && maxPolls<=MAX_POLLS,
    "CODEQL_CLOSURE_INPUT_INVALID");
  for (let attempt=1;attempt<=maxPolls;attempt++) {
    // Verify that the main branch actually had a CodeQL analysis for this
    // commit before trusting a possibly stale alert-closure state.
    const analyses=await githubJson(fetchImpl,
      "/code-scanning/analyses?ref=refs%2Fheads%2Fmain&tool_name=CodeQL&per_page=50",
      token);
    ensure(Array.isArray(analyses),"CODEQL_MAIN_ANALYSIS_SCHEMA_INVALID");
    const analyzed=analyses.some(x=>validAnalysis(x,sha));
    if (!analyzed) {
      if(attempt===maxPolls)
        throw new Error("CODEQL_MAIN_SHA_ANALYSIS_NOT_PROCESSED");
      await pause(DELAY_MS);continue;
    }
    const alerts=[];
    for(const number of REMEDIATED_ALERT_NUMBERS) {
      const a=await githubJson(fetchImpl,"/code-scanning/alerts/"+number,token);
      ensure(a && a.number===number && a.rule &&
        ["fixed","open","dismissed"].includes(a.state),
        "CODEQL_ALERT_RESPONSE_INVALID_"+number);
      alerts.push({number,state:a.state,rule:a.rule.id??null,
        path:a.most_recent_instance?.location?.path??null});
    }
    if(alerts.some(a=>a.state==="dismissed"))
      throw new Error("CODEQL_ALERT_DISMISSED_NOT_FIXED");
    if(alerts.every(a=>a.state==="fixed")) {
      return {ok:true,main_sha:sha,analysis_verified:true,
        alerts,open:0,dismissed:0,fixed:3,proof:"AUTHORITATIVE_GITHUB_CODE_SCANNING_API"};
    }
    if(attempt===maxPolls) {
      // Keep failed checks actionable. Do not mark an open alert as green.
      throw new Error("CODEQL_ALERTS_STILL_OPEN_"+
        alerts.filter(a=>a.state==="open").map(a=>a.number).join("_"));
    }
    await pause(DELAY_MS);
  }
  throw new Error("CODEQL_CLOSURE_UNREACHABLE");
}

if(process.argv[1] &&
  import.meta.url===pathToFileURL(process.argv[1]).href) {
  try{
    const proof=await verifyCodeqlClosure({
      token:process.env.GH_TOKEN,sha:process.env.GITHUB_SHA,
      repo:process.env.GITHUB_REPOSITORY});
    process.stdout.write(JSON.stringify(proof)+"\n");
  }catch(e){
    process.stderr.write("::error::"+e.message+"\n");
    process.exitCode=1;
  }
}
