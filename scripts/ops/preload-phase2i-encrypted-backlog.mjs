#!/usr/bin/env node
/**
 * Protected main-only GitHub Actions queue restore. Only AEAD-authenticated,
 * first-party metadata is ever written in the ephemeral runner filesystem.
 * Never print original titles/URLs, secret keys or decrypted contents.
 * A GitHub inventory outage fails closed; prior encrypted artifacts survive.
 */
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve,sep} from "node:path";
import {execFileSync} from "node:child_process";
import {selectPrivatePhase2iBacklogArtifact,unsealPrivatePhase2iSourceBacklog,
 PHASE2I_BACKLOG_ARTIFACT} from "../lib/phase2i-encrypted-source-backlog.mjs";

const env=process.env;
if(env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   env.GITHUB_REF!=="refs/heads/main"||
   env.GEOMACRO_SOURCE_INTAKE_ONLY!=="1"||
   env.PHASE2I_PROVIDER_SOURCE_INTAKE!=="true"||
   !["schedule","workflow_run"].includes(env.GITHUB_EVENT_NAME??""))
 throw Error("PHASE2I_BACKLOG_PROTECTED_SOURCE_ONLY");
const token=env.GH_TOKEN??"";
if(token.length<20||typeof env.GEOMACRO_COMMERCE_LEDGER_TOKEN!=="string"||
 env.GEOMACRO_COMMERCE_LEDGER_TOKEN.length<32)
 throw Error("PHASE2I_BACKLOG_AUTH_UNAVAILABLE");
const runner=resolve(env.RUNNER_TEMP??"/invalid");
const output=resolve(env.GEOMACRO_PHASE2I_PRIOR_QUEUE??"/missing");
if(!output.startsWith(runner+sep)||output.includes(".."))
 throw Error("PHASE2I_BACKLOG_PATH_INVALID");
const url="https://api.github.com/repos/blocknine0/geomacro/actions/artifacts?per_page=100&name="+
 encodeURIComponent(PHASE2I_BACKLOG_ARTIFACT);
// 96 previous 15m snapshots/day plus 72 new 20m snapshots/day can exceed
// 500 retained ciphertext artifacts across 72h. The endpoint returns the
// newest 100; the selected main-branch AEAD payload is independently
// authenticated, expiry-checked and never treated as a D1 ACK.
const result=await fetch(url,{redirect:"error",
 headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28"},
 signal:AbortSignal.timeout(15000)});
if(result.status!==200||result.redirected)
 throw Error("PHASE2I_BACKLOG_GITHUB_INDEX_UNAVAILABLE");
const doc=await result.json();
if(!Array.isArray(doc?.artifacts)||doc.artifacts.length>100||
   !Number.isSafeInteger(doc.total_count)||doc.total_count>2000)
 throw Error("PHASE2I_BACKLOG_INDEX_AMBIGUOUS");
// Latest snapshot carries all still-eligible previously queued candidates.
// A 3-day artifact retention is used only as a transport handoff; original
// 72-hour publisher timestamps still govern event expiry.
const chosen=selectPrivatePhase2iBacklogArtifact(doc.artifacts,Date.now());
let candidates=[],expired_since_capture=0;
if(chosen){
 const dir=mkdtempSync(join(tmpdir(),"geomacro-phase2i-sealed-"));
 try{
  execFileSync("gh",["run","download",String(chosen.workflow_run.id),
   "--repo","blocknine0/geomacro","--name",PHASE2I_BACKLOG_ARTIFACT,
   "--dir",dir],{env:{...env,GH_TOKEN:token},
   stdio:["ignore","ignore","pipe"],timeout:45000,maxBuffer:128*1024});
  const bytes=readFileSync(join(dir,"queue.json"),"utf8");
  if(bytes.length>6_500_000)throw Error("PHASE2I_BACKLOG_FILE_TOO_LARGE");
  const restored=unsealPrivatePhase2iSourceBacklog(JSON.parse(bytes),
   env.GEOMACRO_COMMERCE_LEDGER_TOKEN,Date.now());
  candidates=restored.candidates;
  expired_since_capture=restored.expired_since_capture;
 }finally{rmSync(dir,{recursive:true,force:true});}
}
writeFileSync(output,JSON.stringify({schema:"geomacro.phase2i-protected-runner-prior.v1",
 loaded_at:new Date().toISOString(),candidates}),{
 encoding:"utf8",mode:0o600,flag:"wx"});
console.log(JSON.stringify({schema:"geomacro.phase2i-queue-preload.v1",
  restored_authentic_unverified_candidates:candidates.length,
  expired_since_capture,
  prior_snapshot_found:chosen!==null,
  original_urls_logged:false,
  canonical_d1_readback_verified:false,
  provider_source_fetches:0,d1_queries:0,b2_requests:0,payments:0}));
