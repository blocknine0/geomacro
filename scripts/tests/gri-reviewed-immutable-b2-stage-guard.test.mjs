import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const lib=readFileSync("scripts/lib/gri-reviewed-immutable-b2-handoff.mjs","utf8");
const operator=readFileSync("scripts/ops/verify-three-domain-reviewed-handoff.mjs","utf8");
const uploader=readFileSync("scripts/ops/stage-approved-reviewed-gri-private-b2.mjs","utf8");

test("immutable handoff requires approved signatures, source review, country certs and historical SHA",()=>{
  for(const name of [
    "preflightReviewedCurrentGlobalRisk({",
    "verifyThreeDomainReviewerHandoff({",
    "sha(historicalB2Bytes)!==preflight.history_b2_sha256",
    "signed_reviewer_public_key_sha256",
    "private_reviewer_signed_input_preflight_verified:true",
    "distinct_country_category_certifications_verified:true",
  ])assert.ok(lib.includes(name),name);
  assert.ok(lib.indexOf("preflightReviewedCurrentGlobalRisk({")<
    lib.indexOf("uploadFiles:Object.freeze"));
  assert.match(lib,/reviewed-gri-current\//u);
  assert.match(lib,/reviewed-country-certification\//u);
  for(const field of [
    "immutable_b2_readback_verified:false",
    "canonical_numerical_score_published:false",
    "risk_indices_published:false",
    "x402_charge_authorized:false",
    "b2_writes:0,d1_writes:0",
  ])assert.ok(lib.includes(field),field);
});

test("offline handoff writes private 0600 files only after signed checks",()=>{
  assert.ok(operator.includes('"--prepare-immutable-b2"'));
  assert.ok(operator.includes('mode:"0o600"')===false);
  assert.ok(operator.includes("mode:0o600,flag:\"wx\""));
  assert.ok(operator.includes("mkdirSync(dir,{recursive:true,mode:0o700})"));
  assert.ok(operator.includes("prepareImmutableReviewedGriHandoff({"));
  for(const no of ["B2_KEY_ID","B2_APPLICATION_KEY","COINBASE_API_KEY"])
    assert.ok(operator.includes(no),"explicitly forbidden "+no);
  assert.ok(!operator.includes("settleCoinbaseX402("));
});

test("private uploader refuses funds and signed-object mutation before B2 and spends quota on readback",()=>{
  for(const field of [
    'process.argv[2]!=="--stage-approved-review-no-funds"',
    'process.env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"',
    'process.env.B2_REQUEST_BUDGET!=="6"',
    'approvedIndependentReviewerFromEnv()',
    'prepareImmutableReviewedGriHandoff({...input,now:new Date()})',
    "computeReviewedCurrentGlobalRisk({",
    "new_native_original_after_historical_anchor_verified",
    "CANONICAL_REVIEWED_NUMERICAL_PREFLIGHT_UNVERIFIED",
    "const existing=await b2.getOptional(item.key)",
    "IMMUTABLE_SIGNED_OBJECT_COLLISION",
    "await b2.put(item.key,item.bytes)",
    "await b2.get(item.key)",
    "INDEPENDENT_EXACT_B2_BYTES_READBACK_FAILED",
    "SIGNED_INPUT_CHANGED_DURING_PUBLICATION",
  ])assert.ok(uploader.includes(field),field);
  assert.ok(uploader.indexOf("const stage=prepareImmutableReviewedGriHandoff")<
    uploader.indexOf("const b2=createB2Client"));
  assert.ok(uploader.indexOf("const checked=computeReviewedCurrentGlobalRisk")<
    uploader.indexOf("const b2=createB2Client"));
  assert.ok(uploader.indexOf("const actual=Buffer.from(await b2.get(item.key))")<
    uploader.indexOf("let dispatched=false"));
  assert.ok(uploader.includes('process.env.GRI_SIGNED_READY_DISPATCH_ACK==="YES_NO_FUNDS"'));
  assert.ok(uploader.includes('response.status!==204'));
  assert.ok(uploader.includes('canonical_numerical_score_published:false'));
  assert.ok(uploader.includes('funds_spent_usdc:0'));
  assert.ok(!uploader.includes("RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64"));
  assert.ok(!uploader.includes("publishB2VerifiedHotSnapshot("));
});
