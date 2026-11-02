#!/usr/bin/env bun
/** Use the EXISTING third 15-minute D1 writer budget, but ONLY when the
 * protected legacy held-spool recovery PROVED it has zero fresh items.
 * No publisher GET, extra B2 operation, quota bypass, new table or public data.
 * Exact same-run Actions ciphertext is authenticated and never logged.
 */
import {createHmac} from "node:crypto";
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {unsealPrivatePhase2iSourceBacklog,PHASE2I_BACKLOG_ARTIFACT}
 from "../lib/phase2i-encrypted-source-backlog.mjs";
import {stagePhase2iOsintFairRaw} from "../lib/phase2i-osint-country-fair-raw-staging.mjs";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model.ts";

const env=process.env;
if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   env.GITHUB_REF!=="refs/heads/main"||env.GITHUB_EVENT_NAME!=="schedule"||
   env.GEOMACRO_SOURCE_INTAKE_ONLY!=="1"||
   env.PHASE2I_PROVIDER_SOURCE_INTAKE!=="true"||
   env.PHASE2I_PROVIDER_CRITICAL!=="true"||
   env.PHASE2I_PROVIDER_RESEARCH!=="true"||
   env.PHASE2I_HELD_SPOOL_EMPTY_VERIFIED!=="1"||
   ![3,5].includes(Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS))||
   !/^\d{1,20}$/u.test(env.GITHUB_RUN_ID??""))
 throw Error("PHASE2I_EXTRA_D1_PROTECTED_IDLE_REPLAY_SLOT_REQUIRED");
const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"");
const token=String(env.GH_TOKEN??"");
if(root.length<32||token.length<20)throw Error("PHASE2I_EXTRA_D1_SECRET_UNAVAILABLE");
const dir=mkdtempSync(join(tmpdir(),"geomacro-phase2i-extra-"));
try{
 // Read EXACTLY the current trusted source-only job's ciphertext; not
 // an arbitrary external Actions artifact, PR artifact or plaintext URL.
 execFileSync("gh",["run","download",env.GITHUB_RUN_ID,
  "--repo","blocknine0/geomacro","--name",PHASE2I_BACKLOG_ARTIFACT,
  "--dir",dir],{env:{...env,GH_TOKEN:token},
  stdio:["ignore","ignore","pipe"],timeout:50_000,maxBuffer:128*1024});
 const raw=readFileSync(join(dir,"queue.json"),"utf8");
 if(raw.length>6_500_000)throw Error("PHASE2I_EXTRA_D1_CIPHERTEXT_OVERSIZE");
 const queue=unsealPrivatePhase2iSourceBacklog(JSON.parse(raw),root,Date.now());
 const pending=queue.candidates.filter(c=>c.d1Acknowledged!==true);
 if(!pending.length){
  console.log(JSON.stringify({schema:"geomacro.phase2i.extra-d1-queue-drain.v1",
   status:"NO_UNACKNOWLEDGED_ELIGIBLE_ORIGINALS",selected_count:0,
   d1_inserted:0,source_fetches:0,extra_provider_d1_approval_spent:false}));
 }else{
  const key=createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex");
  const staged=await stagePhase2iOsintFairRaw({
   candidates:pending,derive:deriveStatelessSignals,
   maxRows:Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS),
   controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
   token:key
  });
  if(staged.selected_count>0&&staged.d1_readback_verified!==true)
   throw Error("PHASE2I_EXTRA_D1_AUTHENTICATED_READBACK_REQUIRED");
  console.log(JSON.stringify({schema:"geomacro.phase2i.extra-d1-queue-drain.v1",
   status:staged.status,selected_count:staged.selected_count,
   candidate_count:pending.length,deferred_count:staged.deferred_count,
   selected_by_category:staged.selected_by_category,
   d1_inserted:staged.d1_inserted,d1_unchanged:staged.d1_unchanged,
   rejected_conflicts:staged.d1_rejected_conflicts,
   d1_exact_readback_verified:staged.d1_readback_verified,
   max_rows_within_existing_spool_replay_reserve:env.PHASE2I_PROVIDER_MAX_NEW_ROWS,
   source_fetches:0,extra_b2_requests:0,predge_changed:false,
   rights_verified:false,payments:0}));
 }
}finally{rmSync(dir,{recursive:true,force:true})}
