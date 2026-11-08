import {test} from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,randomBytes} from "node:crypto";
import {assessStage3Bindings}
 from "../ops/step3-protected-binding-readiness.mjs";
const {privateKey,publicKey}=generateKeyPairSync("ed25519");
const sha="b".repeat(40),token="deployed_token_placeholder_1234567890";
const good=()=>({
 GITHUB_SHA:sha,
 CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),
 CLOUDFLARE_API_TOKEN:"p".repeat(40),
 D1_DATABASE_ID:"11111111-2222-4333-8444-555555555555",
 GEOMACRO_D1_SHADOW_DATABASE_ID:"66666666-7777-4888-9999-aaaaaaaaaaaa",
 GEOMACRO_D1_RECOVERY_AES256_KEY_B64:randomBytes(32).toString("base64"),
 GEOMACRO_D1_RECOVERY_R2_BUCKET:"recovery-manifests-private",
 GEOMACRO_STEP3_SHADOW_PRIVATE_R2_BUCKET:"shadow-r2-private",
 GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST:
  "geomacro-step3-shadow.example.workers.dev",
 GEOMACRO_STEP3_SHADOW_LEGACY_WORKER_HOST:
  "geomacro-step3-shadow-legacy.example.workers.dev",
 GEOMACRO_STEP3_EXACT_SHA:sha,
 GEOMACRO_D1_RECOVERY_R2_PRIVATE_APPROVED:"YES",
 GEOMACRO_STEP3_SHADOW_POINTER_SEED_APPROVED:"YES",
 GEOMACRO_STEP3_SHADOW_REHEARSAL_APPROVED:"YES",
 SIGNING_JWK:JSON.stringify(privateKey.export({format:"jwk"})),
 GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK:
  JSON.stringify(publicKey.export({format:"jwk"})),
 CONTROL_PLANE_TOKEN:token,
 GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN:token+"-shadow",
 PHASE2H_R2_REFERENCE_HMAC_KEY:"f".repeat(64),
 PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY:"e".repeat(64),
 B2_ARCHIVE_READ_KEY_ID:"b2-read-key-placeholder",
 B2_ARCHIVE_READ_APPLICATION_KEY:"b2-read-secret-placeholder"
});
test("complete matching configuration means only configuration readiness",()=>{
 const e=good(),r=assessStage3Bindings(e);
 assert.equal(r.status,"REAL_SHADOW_BINDINGS_READY_FOR_PROVIDER_PREFLIGHT");
 assert.equal(r.scope,"CONFIGURATION_ONLY_NO_PROVIDER_IO");
 assert.equal(r.missing.length,0);
 assert.equal(r.provider_physical_proof,false);
 assert.equal(r.production_sql_mutated,false);
 const text=JSON.stringify(r);
 for(const secret of [
  e.CLOUDFLARE_API_TOKEN,e.CONTROL_PLANE_TOKEN,
  e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN,
  e.SIGNING_JWK,e.PHASE2H_R2_REFERENCE_HMAC_KEY,
  e.PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY,
  e.GEOMACRO_D1_RECOVERY_AES256_KEY_B64])
  assert(!text.includes(secret),"secret value was exposed");
});
test("missing Github secrets emit one consolidated name-only report",()=>{
 const e=good();
 for(const name of ["GEOMACRO_D1_RECOVERY_AES256_KEY_B64",
  "PHASE2H_R2_REFERENCE_HMAC_KEY","PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY",
  "CONTROL_PLANE_TOKEN","GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN",
  "GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST"])
  delete e[name];
 const r=assessStage3Bindings(e);
 assert.equal(r.status,"HOLD");
 for(const name of ["GEOMACRO_D1_RECOVERY_AES256_KEY_B64",
  "PHASE2H_R2_REFERENCE_HMAC_KEY","PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY",
  "CONTROL_PLANE_TOKEN","GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN",
  "GEOMACRO_STEP3_SHADOW_VERIFIED_WORKER_HOST"])
  assert(r.missing.some(x=>x.name===name&&x.issue==="UNSET"));
 assert.equal(r.no_payment_calls,true);
});
test("wrong trusted signer, shadow UUID collision and stale main SHA always HOLD",()=>{
 const e=good(),other=generateKeyPairSync("ed25519");
 e.GEOMACRO_STEP3_TRUSTED_SIGNER_PUBLIC_JWK=
  JSON.stringify(other.publicKey.export({format:"jwk"}));
 e.GEOMACRO_D1_SHADOW_DATABASE_ID=e.D1_DATABASE_ID;
 e.GEOMACRO_STEP3_EXACT_SHA="a".repeat(40);
 const r=assessStage3Bindings(e);
 for(const name of ["PINNED_PUBLIC_SIGNER_MATCHES_PRIVATE",
  "D1_PRODUCTION_SHADOW_ISOLATED","GEOMACRO_STEP3_EXACT_SHA"])
  assert(r.missing.some(x=>x.name===name));
 assert.equal(r.production_sql_mutated,false);
});

test("shadow HMAC cannot be missing or reused from production",()=>{
 const e=good();
 e.PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY=e.PHASE2H_R2_REFERENCE_HMAC_KEY;
 let r=assessStage3Bindings(e);
 assert.equal(r.status,"HOLD");
 assert.equal(r.stage1_status,"HOLD");
 assert(r.stage1_missing.some(x=>x.name==="SHADOW_HMAC_ISOLATED_FROM_PRODUCTION"));
 assert(r.missing.some(x=>x.name==="SHADOW_HMAC_ISOLATED_FROM_PRODUCTION"));
 assert(!JSON.stringify(r).includes(e.PHASE2H_R2_REFERENCE_HMAC_KEY));
 e.PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY="e".repeat(63)+"\\n";
 r=assessStage3Bindings(e);
 assert(r.missing.some(x=>x.name==="PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY"));
});
test("protected workflows use shadow HMAC for Stage1 and retain production HMAC for Stage2",async()=>{
 const {readFileSync}=await import("node:fs");
 const path=new URL("../../.github/workflows/production-rollout-orchestrator.yml",import.meta.url);
 const y=readFileSync(path,"utf8");
 const [shadow,production]=y.split("  stage2-production:");
 assert(shadow.includes("PHASE2H_R2_REFERENCE_HMAC_KEY: ${{ secrets.PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY }}"));
 assert(!shadow.includes("PHASE2H_R2_REFERENCE_HMAC_KEY: ${{ secrets.PHASE2H_R2_REFERENCE_HMAC_KEY }}"));
 assert(production.includes("PHASE2H_R2_REFERENCE_HMAC_KEY: ${{ secrets.PHASE2H_R2_REFERENCE_HMAC_KEY }}"));
 assert(!production.includes("PHASE2H_R2_REFERENCE_HMAC_KEY: ${{ secrets.PHASE2H_SHADOW_R2_REFERENCE_HMAC_KEY }}"));
});

test("Shadow Stage1 can be configuration-ready without an available production HMAC",()=>{
 const e=good();
 delete e.PHASE2H_R2_REFERENCE_HMAC_KEY;
 const r=assessStage3Bindings(e);
 assert.equal(r.stage1_status,"REAL_SHADOW_BINDINGS_READY_FOR_PROVIDER_PREFLIGHT");
 assert.deepEqual(r.stage1_missing,[]);
 assert.equal(r.stage2_status,"HOLD");
 assert.equal(r.status,"HOLD");
 assert(r.missing.some(x=>x.name==="PHASE2H_R2_REFERENCE_HMAC_KEY"));
 assert.equal(r.provider_physical_proof,false);
});

test("Stage1 uses independent shadow Worker bearer token without production token",()=>{
 const e=good();
 delete e.CONTROL_PLANE_TOKEN;
 const r=assessStage3Bindings(e);
 assert.equal(r.stage1_status,"REAL_SHADOW_BINDINGS_READY_FOR_PROVIDER_PREFLIGHT");
 assert.equal(r.stage2_status,"HOLD");
 assert.equal(r.status,"HOLD");
 assert(r.missing.some(x=>x.name==="CONTROL_PLANE_TOKEN"));
 assert.equal(r.provider_physical_proof,false);
});
test("identical shadow and production bearer tokens block Stage1",()=>{
 const e=good();
 e.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN=e.CONTROL_PLANE_TOKEN;
 const r=assessStage3Bindings(e);
 assert.equal(r.stage1_status,"HOLD");
 assert(r.stage1_missing.some(x=>x.name==="SHADOW_CONTROL_TOKEN_ISOLATED_FROM_PRODUCTION"));
 assert(!JSON.stringify(r).includes(e.CONTROL_PLANE_TOKEN));
});
test("protected orchestration uses distinct bearer tokens for shadow and production",async()=>{
 const {readFileSync}=await import("node:fs");
 const y=readFileSync(new URL("../../.github/workflows/production-rollout-orchestrator.yml",import.meta.url),"utf8");
 const [shadow,prod]=y.split("  stage2-production:");
 assert(shadow.includes("CONTROL_PLANE_TOKEN: ${{ secrets.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN }}"));
 assert(!shadow.includes("CONTROL_PLANE_TOKEN: ${{ secrets.CONTROL_PLANE_TOKEN }}"));
 assert(prod.includes("CONTROL_PLANE_TOKEN: ${{ secrets.CONTROL_PLANE_TOKEN }}"));
 assert(!prod.includes("CONTROL_PLANE_TOKEN: ${{ secrets.GEOMACRO_STEP3_SHADOW_CONTROL_PLANE_TOKEN }}"));
});
