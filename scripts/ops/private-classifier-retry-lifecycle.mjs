#!/usr/bin/env node
/**
 * Authenticated D1 classifier work claim/readback and classification ACK.
 * No source URLs, titles, content, paid data or keys are emitted.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createD1ControlPlaneStateClient} from "../lib/d1-control-plane-state.mjs";
import {emptyPrivateScoringDiagnostic} from "../lib/restricted-private-scoring-diagnostics.mjs";
import {CANONICAL_CLASSIFIER_VERSION} from "../lib/restricted-private-scored-stage.mjs";
import {
 PRIVATE_SCORING_ATTEMPTS_PIPELINE,pickPrivateClassifierWork,
 claimPrivateClassifierWork,acknowledgePrivateClassifierWork,
 validateClaimForPrivateScorer,readPrivateClassifierAttempts,
} from "../lib/private-classifier-retry-ledger.mjs";
const [operation,domain]=process.argv.slice(2);
const DOMAINS=new Set(["geopolitics","macro","rare_earth"]);
const DIR="artifacts/restricted-current-scoring";
const runId=String(process.env.GITHUB_RUN_ID||"");
function safeRecord(name,data){
 mkdirSync(DIR,{recursive:true});
 writeFileSync(`${DIR}/${name}`,JSON.stringify(data)+"\n",{mode:0o600});
}
function emptyStage(){
 safeRecord(`${domain}.json`,{
  schema:"geomacro.private-scoring-candidates.v1",category:domain,
  classifier_version:CANONICAL_CLASSIFIER_VERSION,
  private_only:true,records:[],diagnostics:emptyPrivateScoringDiagnostic(domain),
 });
 safeRecord(`${domain}-source.json`,{
  schema:"geomacro.private-gri-source-candidates.v1",category:domain,
  private_only:true,public_published:false,commercial_eligible:false,records:[],
 });
}
try{
 if(!DOMAINS.has(domain)||!["claim","finish","abort","commit"].includes(operation)||
    process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    process.env.GITHUB_REF!=="refs/heads/main"||
    process.env.GEOMACRO_AUTOMATIC_D1_PULSE_STAGE!=="true"||
    !/^\d{1,24}$/u.test(runId))
  throw Error("PRIVATE_CLASSIFIER_LIFECYCLE_PROTECTED_CONTEXT_REQUIRED");
 const now=new Date().toISOString();
 const attempts=createD1ControlPlaneStateClient({pipeline:PRIVATE_SCORING_ATTEMPTS_PIPELINE});
 const previous=(await attempts.loadRows()).get(domain);
 if(operation==="claim"){
  const pulse=(await createD1ControlPlaneStateClient({
   pipeline:"official_source_pulse_30m",
  }).loadRows()).get(domain);
  if(!pulse||pulse.last_attempt_at!==pulse.payload?.checked_at||
     !Array.isArray(pulse.payload.private_classifier_work_refs)||
     pulse.payload.private_classifier_work_refs.length>1)
   throw Error("PRIVATE_CLASSIFIER_WORK_D1_INVALID");
  const chosen=pulse.payload.private_classifier_work_refs;
  if(chosen.length===0){
   emptyStage();
   safeRecord(`${domain}-claim.json`,{claimed:false});
   console.log(JSON.stringify({domain,claimed:false,classifier_calls:0}));
  }else{
   // The pulse selected SHA was independently committed/read back already.
   // The current classifier runner revalidates pending review, native clock
   // and attempts ledger BEFORE claiming and before any article/model GET.
   const candidates=pulse.payload.recent_private_article_fingerprints
    .filter(x=>chosen.includes(x.article_sha256))
    .map(x=>({original_article_sha256:x.article_sha256,
      native_published_at:x.native_published_at}));
   const verified=pickPrivateClassifierWork({
    domain,source:pulse,ledger:previous,now:Date.parse(now),
    currentCandidates:candidates,
   });
   if(verified.length!==1||verified[0].article_sha256!==chosen[0])
    throw Error("PRIVATE_CLASSIFIER_WORK_SELECTION_UNVERIFIED");
   const state=claimPrivateClassifierWork({
    domain,ledger:previous,work:verified[0],now,runId,
   });
   await attempts.persist(domain,{cursor:{status:"CLAIMED"},...state},
     {last_attempt_at:now});
   const stored=(await attempts.loadRows()).get(domain);
   if(JSON.stringify(stored?.payload?.records)!==JSON.stringify(state.records)||
      !validateClaimForPrivateScorer(pulse,stored,domain,runId,Date.parse(now)).has(chosen[0]))
    throw Error("PRIVATE_CLASSIFIER_CLAIM_D1_READBACK_FAILED");
   safeRecord(`${domain}-claim.json`,{claimed:true});
   console.log(JSON.stringify({domain,claimed:true,attempts:verified[0].next_attempts,
     retry:verified[0].retry,d1_readback_verified:true,
     intelligence_qualified:false,payment_allowed:false}));
  }
 }else{
  const claim=JSON.parse(readFileSync(`${DIR}/${domain}-claim.json`,"utf8"));
  if(claim?.claimed!==true)throw Error("PRIVATE_CLASSIFIER_FINISH_WITHOUT_CLAIM");
  let data=null;
  try {data=JSON.parse(readFileSync(`${DIR}/${domain}.json`,"utf8"));}
  catch {if(operation!=="abort")throw Error("PRIVATE_CLASSIFIER_RESULT_MISSING");}
  if(operation==="commit"){
    const proof=JSON.parse(readFileSync(`${DIR}/archive-proof.json`,"utf8"));
    if(proof?.schema!=="geomacro.restricted-private-scoring-archive-proof.v1"||
       proof.ok!==true||proof.b2_full_readback_sha256_verified!==true||
       proof.b2_exact_gzip_restore_verified!==true||
       proof.d1_checkpoint_readback_verified!==true||proof.supabase_writes!==0||
       proof.public_published!==false||proof.commercial_eligible!==false)
      throw Error("PRIVATE_CLASSIFIER_ARCHIVE_DURABILITY_UNVERIFIED");
  }
  const valid=data?.schema==="geomacro.private-scoring-candidates.v1"&&
     data.category===domain&&data.private_only===true&&
     data.diagnostics?.domain===domain&&
     Array.isArray(data.attempted_original_article_refs)&&
     Array.isArray(data.returned_original_article_refs)&&
     data.diagnostics.classifier_attempted_count>=data.attempted_original_article_refs.length&&
     data.diagnostics.classifier_returned_count>=data.returned_original_article_refs.length;
  if(["finish","commit"].includes(operation)&&!valid)throw Error("PRIVATE_CLASSIFIER_RESULT_PROOF_INVALID");
  if(operation==="abort"&&data!==null&&!valid)throw Error("PRIVATE_CLASSIFIER_ABORT_PROOF_INVALID");
  /* Prior full proof assertion retained for normal finish only. */
  if(["finish","commit"].includes(operation) && (data?.schema!=="geomacro.private-scoring-candidates.v1"||
     data.category!==domain||data.private_only!==true||
     data.diagnostics?.domain!==domain||
     !Array.isArray(data.attempted_original_article_refs)||
     !Array.isArray(data.returned_original_article_refs)||
     data.diagnostics.classifier_attempted_count<
       data.attempted_original_article_refs.length||
     data.diagnostics.classifier_returned_count<
       data.returned_original_article_refs.length))
   throw Error("PRIVATE_CLASSIFIER_RESULT_PROOF_INVALID");
  if(operation==="finish" && data.records.length>0){
    // Only the existing, independently authenticated B2/D1 archival step
    // can complete an eligible private stage. Do not spend an ACK here.
    const claimed=readPrivateClassifierAttempts(previous,domain,Date.parse(now))
      .filter(e=>e.run_id===runId&&e.status==="CLAIMED");
    if(claimed.length!==1||data.attempted_original_article_refs.length!==1||
       data.returned_original_article_refs.length!==1||
       data.returned_original_article_refs[0]!==claimed[0].article_sha256||
       data.attempted_original_article_refs[0]!==claimed[0].article_sha256)
      throw Error("PRIVATE_CLASSIFIER_ARCHIVE_PENDING_IDENTITY_UNVERIFIED");
    console.log(JSON.stringify({domain,status:"AWAITING_VERIFIED_B2_D1_ARCHIVE",
      private_only:true,payment_allowed:false}));
    process.exit(0);
  }
  // Source fetch failures or HTTP restrictions never earn a retry.
  // A failed classifier batch with an authenticated selected source hash
  // may use its single delayed retry; absent/corrupt proof is terminal.
  const retriableClassifierFailure=operation==="abort" && valid &&
    data.diagnostics.classifier_failed_batch_count>0 &&
    data.returned_original_article_refs.length===0;
  const attempted=operation==="finish"||operation==="commit"
    ?data.attempted_original_article_refs:
    retriableClassifierFailure?data.attempted_original_article_refs:[];
  // Qualified stage records MUST complete existing verified B2 + D1 archive
  // before a final classifier-processing ACK. No funds or rights are granted.
  const returned=operation==="commit" ||
     (operation==="finish" && data.records.length===0)
      ?data.returned_original_article_refs:[];
  if(operation==="commit" && (!data.records.length||!returned.length))
    throw Error("PRIVATE_CLASSIFIER_COMMIT_WITHOUT_DURABLE_RESULT");
  const state=acknowledgePrivateClassifierWork({
   domain,ledger:previous,now,runId,
   attempted,returned,
  });
  await attempts.persist(domain,{cursor:{status:"PRIVATE_CLASSIFIER_PROCESSING"},...state},
    {last_attempt_at:now});
  const stored=(await attempts.loadRows()).get(domain);
  if(JSON.stringify(stored?.payload?.records)!==JSON.stringify(state.records))
   throw Error("PRIVATE_CLASSIFIER_ACK_D1_READBACK_FAILED");
  const e=state.records.find(x=>x.run_id===runId);
  console.log(JSON.stringify({
   domain,operation,status:e.status,d1_readback_verified:true,
   classifier_attempted_originals:attempted.length,
   classifier_returned_originals:returned.length,
   commercially_qualified:false,payment_allowed:false,
  }));
 }
}catch(error){
 console.error("::error::PRIVATE_CLASSIFIER_D1_LIFECYCLE_FAILED");
 process.exitCode=2;
}
