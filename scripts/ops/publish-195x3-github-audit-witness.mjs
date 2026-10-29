#!/usr/bin/env node
/**
 * A second, independent, long-retention witness for the 195×3 audit.
 *
 * Only a SHA-256 hash of the PRIVATE audit, high-level status, check clock,
 * exact protected GitHub commit and 195×3 denominator reach a PUBLIC issue.
 * Source IDs, country rows, source URLs, publisher names, buyer/partner data,
 * API credentials and original material are NEVER sent to GitHub.
 *
 * B2's full private evidence store and quota governor are left untouched.
 * A witness is proof of the audit digest, NOT proof of current paid coverage.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {assertGlobalAuditDocument} from "../lib/195x3-durable-proof-chain.mjs";
export const ISSUE=3102;
export const SCHEMA="geomacro.195x3-independent-github-audit-witness.v1";
const fail=code=>{throw Error("GITHUB_195_WITNESS_"+code)};
const TIMESTAMP=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;
export function createRedactedGithubAuditWitness(raw,meta){
  if(typeof raw!=="string"||Buffer.byteLength(raw)>750000||
     typeof meta?.sha!=="string"||!/^[a-f0-9]{40}$/u.test(meta.sha)||
     !/^[1-9]\d{0,18}$/u.test(String(meta.runId))||
     !/^[1-9]\d{0,3}$/u.test(String(meta.attempt)))
    fail("INPUT_SCOPE_INVALID");
  let audit;
  try{audit=JSON.parse(raw);}catch{fail("AUDIT_JSON_INVALID")}
  const verified=assertGlobalAuditDocument(audit);
  const sha256=createHash("sha256").update(raw,"utf8").digest("hex");
  const tag=["geomacro-195x3-proof",meta.runId,meta.attempt,sha256].join(":");
  const body=[
    "### Automatic 195×3 audit digest witness (no funds)",
    "",
    "- Schema: \`"+SCHEMA+"\`",
    "- Audit checked at (UTC): \`"+audit.checked_at+"\`",
    "- Canonical GitHub commit: \`"+meta.sha+"\`",
    "- Workflow run/attempt: \`"+meta.runId+"/"+meta.attempt+"\`",
    "- Country × category denominator: **195 × 3 = 585**",
    "- Source-runtime audit state: **"+audit.audit_state+"**",
    "- Independently verified signed paid deliveries in this audit: **0 claimed**",
    "- Private audit SHA-256: \`"+sha256+"\`",
    "- Full private B2 readback: **not asserted by this GitHub witness**",
    "- This record is an audit occurrence/digest, not current publisher rights or an x402 entitlement.",
    "",
    "<!-- "+tag+" -->",
  ].join("\n");
  if(body.length>2400||body.includes("http://")||body.includes("https://"))
    fail("PUBLIC_BODY_BOUNDS_INVALID");
  return Object.freeze({schema:SCHEMA,body,tag,sha256,
    audit_ok:verified.audit_ok,checked_at:audit.checked_at,
    raw_source_material_emitted:false,
    paid_delivery_implied:false,has_full_private_audit_data:false});
}
function config(env){
 if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main"||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA??"")||
    !/^[1-9]\d{0,18}$/u.test(env.GITHUB_RUN_ID??"")||
    !/^[1-9]\d{0,3}$/u.test(env.GITHUB_RUN_ATTEMPT??"")||
    typeof env.GITHUB_TOKEN!=="string"||env.GITHUB_TOKEN.length<20)
   fail("PROTECTED_MAIN_TOKEN_REQUIRED");
 return env;
}
async function githubJson(endpoint,init,fetcher){
  const r=await fetcher(endpoint,{
    ...init,redirect:"error",cache:"no-store",
    headers:{"Accept":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28",
      "Authorization":"Bearer "+init.token,
      ...(init.body?{"Content-Type":"application/json"}:{})},
    signal:AbortSignal.timeout(10000),
  });
  if(!r.ok)fail("GITHUB_API_STATUS_"+r.status);
  const text=await r.text();
  if(text.length>120000)fail("GITHUB_REPLY_TOO_LARGE");
  try{return JSON.parse(text);}catch{fail("GITHUB_REPLY_INVALID")}
}
export async function publishGithubAuditWitness({raw,env=process.env,fetcher=fetch}={}){
 config(env);
 const proof=createRedactedGithubAuditWitness(raw,{
   sha:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID,attempt:env.GITHUB_RUN_ATTEMPT,
 });
 const base="https://api.github.com/repos/blocknine0/geomacro/issues/"+ISSUE+"/comments";
 // Idempotency across manual job reruns. Query bounded recent comments only.
 const since=new Date(Math.max(0,Date.parse(proof.checked_at)-86400_000)).toISOString();
 const previous=await githubJson(base+"?per_page=100&since="+encodeURIComponent(since),
   {method:"GET",token:env.GITHUB_TOKEN},fetcher);
 if(!Array.isArray(previous)||previous.length>100)fail("GITHUB_COMMENT_INDEX_INVALID");
 if(previous.some(c=>typeof c?.body==="string"&&c.body.includes(proof.tag))){
   return {ok:true,already_witnessed:true,witness_sha256:proof.sha256,
     issue_number:ISSUE,payment_performed:false,private_source_emitted:false};
 }
 const posted=await githubJson(base,{
   method:"POST",token:env.GITHUB_TOKEN,body:JSON.stringify({body:proof.body}),
 },fetcher);
 if(!Number.isSafeInteger(posted.id)||posted.id<1||
    typeof posted.html_url!=="string"||
    !posted.html_url.startsWith("https://github.com/blocknine0/geomacro/issues/3102#"))
   fail("GITHUB_WITNESS_ACK_INVALID");
 return {ok:true,already_witnessed:false,witness_sha256:proof.sha256,
   issue_number:ISSUE,comment_id:posted.id,payment_performed:false,
   private_source_emitted:false};
}
if(import.meta.main){
  try{
    const file=process.argv[2]??"/tmp/global-country-runtime.json";
    if(file!=="/tmp/global-country-runtime.json")fail("INPUT_PATH_NOT_ALLOWED");
    const raw=readFileSync(file,"utf8");
    const result=await publishGithubAuditWitness({raw});
    console.log(JSON.stringify(result));
  }catch(e){
    const msg=e instanceof Error?e.message:"";
    console.error(/^GITHUB_195_WITNESS_[A-Z0-9_]+$/u.test(msg)?msg:
      "GITHUB_195_WITNESS_NOT_VERIFIED");
    process.exitCode=2;
  }
}
