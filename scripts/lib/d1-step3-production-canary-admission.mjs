/**
 * Production 0204→0213 PASS attestation guard for protected Worker canaries.
 * Stage1 shadow, local Miniflare, untrusted status JSON and stale/moved
 * GitHub runs never authorize release. This guard performs zero provider IO.
 */
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {verifyStep3StatusReceipt}
 from "./d1-step3-recovery-checkpoint.mjs";
import {step3SqlManifests}
 from "./d1-step3-migration-contract.mjs";
import {sha256MigrationSet}
 from "./d1-step3-migration-ledger.mjs";

export const STEP3_PRODUCTION_SIGNED_PASS_PATH=
 "artifacts/release/step3-production-physical-pass.json";
const SHA=/^[a-f0-9]{40}$/u,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const IDS=["0204","0211","0212","0213"];
const fail=code=>{throw Error("STEP3_CANARY_"+code)};
const equal=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&
 a.every((x,i)=>x===b[i]);
const digest=s=>createHash("sha256").update(s).digest("hex");

export function admitSignedStep3ProductionForCanary({
 signed,publicJwk,headSha,runId,productionDatabaseUuid,
 manifests=step3SqlManifests(),now=Date.now()
}={}){
 if(!SHA.test(headSha??"")||
    !/^[1-9][0-9]{5,20}$/u.test(String(runId??""))||
    !UUID.test(productionDatabaseUuid??"")||
    !Array.isArray(manifests)||manifests.length!==4||
    !equal(manifests.map(x=>x.id),IDS)||
    !manifests.every(x=>/^[a-f0-9]{64}$/u.test(x.sql_sha256??"")))
  fail("PINNED_RUN_D1_OR_SQL_INVALID");
 let report;
 try{report=verifyStep3StatusReceipt(signed,publicJwk)}
 catch{fail("SIGNATURE_OR_TRUSTED_SIGNER_UNVERIFIED")}
 const started=Date.parse(report?.started_at??"");
 const ended=Date.parse(report?.completed_at??"");
 if(!Number.isFinite(started)||!Number.isFinite(ended)||
    started>ended||ended>now+120000||now-ended>3_600_000)
  fail("STALE_OR_NONMONOTONIC_PHYSICAL_PROOF");
 const checksums=manifests.map(x=>x.sql_sha256);
 const stages=report.verified;
 if(report.schema!=="geomacro.step3.migrations-execution.v1"||
    report.status!=="PASS"||report.operation_kind!=="production"||
    report.proof_scope!=="REAL_PROVIDER_PRODUCTION"||
    report.reviewed_source_sha!==headSha||
    report.github_repository!=="blocknine0/geomacro"||
    report.github_ref!=="refs/heads/main"||
    report.github_run_id!==String(runId)||
    report.production_database_uuid_sha256!==
     digest(productionDatabaseUuid.toLowerCase())||
    report.migration_sha256!==sha256MigrationSet(manifests)||
    !equal(report.ordered_ids,IDS)||
    !equal(report.source_migrations?.map(x=>x.id),IDS)||
    !equal(report.source_migrations?.map(x=>x.sql_sha256),checksums)||
    !equal(stages?.map(x=>x.id),IDS)||
    stages?.some(x=>x.migration_history_and_schema_valid!==true||
     x.ledger_status!=="VERIFIED")||
    report.stage1_admission?.status!==
     "PASS_AUTHENTICATED_REAL_PROVIDER_SHADOW_ADMISSION"||
    report.recovery_checkpoint_verified!==true||
    report.migration_ledger_verified!==true||
    report.shadow_test_proven!==true||
    report.post_migration_readback_explicit_PASS!==true||
    report.production_b2_archive_proof?.status!=="PASS_REAL_B2_BYTE_READBACK"||
    report.production_b2_archive_proof?.independent_b2_full_get_verified!==true||
    report.production_reference_table?.stage1_shadow_hmac_attestation_required!==true||
    report.hold_file_untouched!==true||
    report.production_release_authorized!==false)
  fail("FOUR_MIGRATIONS_OR_PHYSICAL_PROOFS_MISSING");
 return Object.freeze({
  schema:"geomacro.step3.production-canary-admission.v1",
  status:"PASS_REAL_PROVIDER_PRODUCTION",
  exact_main_sha:headSha,approved_stage2_run:String(runId),
  signed_receipt_sha256:digest(JSON.stringify(signed)),
  migration_set_sha256:report.migration_sha256,
  production_d1_uuid_sha256:report.production_database_uuid_sha256,
  no_funds:true,canary_traffic_altered:false,
  release_hold_removed:false
 });
}
export function admitSignedStep3ProductionFile({
 path=STEP3_PRODUCTION_SIGNED_PASS_PATH,read=readFileSync,
 env=process.env,now=Date.now(),manifests=step3SqlManifests()
}={}){
 let signed;try{signed=JSON.parse(read(path,"utf8"))}
 catch{fail("SIGNED_PRODUCTION_ARTIFACT_MISSING")}
 return admitSignedStep3ProductionForCanary({
  signed,publicJwk:env.GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK,
  headSha:env.GITHUB_SHA,
  runId:env.GEOMACRO_STEP3_APPROVED_PRODUCTION_RUN_ID,
  productionDatabaseUuid:env.D1_DATABASE_ID,manifests,now
 });
}
