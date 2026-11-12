import test from "node:test";
import assert from "node:assert/strict";
import {assessReviewedAdditiveBindingParity,assessReviewedHot50BindingParity,
 reviewedHot50CandidateVars,REVIEWABLE_ADDITIVE_SECRETS}
 from "../lib/canary-additive-binding-parity.mjs";
const version=bindings=>({resources:{bindings}});
const db={name:"DB",type:"d1"};
const added={name:"GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",type:"secret_text"};
test("unchanged bindings remain accepted with no review",()=>{
 const x=assessReviewedAdditiveBindingParity(version([db]),version([db]));
 assert.equal(x.status,"PASS_BINDING_PARITY");
 assert.deepEqual(x.additions,[]);
});
test("reviewed exact-name secret addition is accepted, never wildcard",()=>{
 const x=assessReviewedAdditiveBindingParity(version([db]),version([db,added]),
  [added.name]);
 assert.deepEqual(x.additions,[added.name]);
});
test("unreviewed addition, changing DB binding, or removal is blocked",()=>{
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([db,added])),/UNREVIEWED_ADDITION/);
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([{...db,type:"kv_namespace"}])),
  /REMOVAL_OR_TYPE_CHANGE/);
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([])),/EMPTY/);
});
test("unknown review names or plaintext vars cannot bypass parity",()=>{
 const unknown={name:"CONTROL_PLANE_TOKEN",type:"secret_text"};
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([db,unknown]),[unknown.name]),
  /ADDITIVE_SECRET_TYPE_OR_SCOPE/);
 const plaintext={...added,type:"plain_text"};
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([db,plaintext]),[added.name]),
  /ADDITIVE_SECRET_TYPE_OR_SCOPE/);
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([db,added]),[added.name,added.name]),
  /DUPLICATE_REVIEWED_NAME/);
});

const sha="f".repeat(40);
const streamBaseline=[db,
 {name:"RISK_STREAM_ACTIVE",type:"plain_text",text:"0"},
 {name:"STREAM_INGESTION_ENABLED",type:"plain_text",text:"false"},
 {name:"RISK_STREAM_HOT50_AUTONOMOUS_ENABLED",type:"plain_text",text:"0"},
 {name:"GEOMACRO_COMMERCIAL_STREAM_RELEASE",type:"plain_text",text:"0"},
 {name:"RISK_STREAM_CANARY_HOLD_CLEARED",type:"plain_text",text:"0"},
 {name:"RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED",type:"plain_text",text:"0"},
 {name:"RISK_GATE_COUNTRY_SCOPE",type:"plain_text",text:"HOT50"},
 {name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:"b".repeat(40)}];
const streamCandidate=[
 ...streamBaseline.filter(x=>!Object.hasOwn(reviewedHot50CandidateVars(sha),x.name)),
 ...Object.entries(reviewedHot50CandidateVars(sha)).map(([name,text])=>
  ({name,type:"plain_text",text})),
 ...REVIEWABLE_ADDITIVE_SECRETS.map(name=>({name,type:"secret_text"}))
];
test("reviewed Hot50 flags and exact four additive secrets pass without broadening review",()=>{
 const result=assessReviewedHot50BindingParity(version(streamBaseline),
  version(streamCandidate),sha,REVIEWABLE_ADDITIVE_SECRETS);
 assert.equal(result.status,"PASS_REVIEWED_HOT50_PARITY");
 assert.equal(result.source_sha,sha);
 assert.equal(result.additions.length,4);
});
test("non-reviewed changes, false flags and commercial release fail closed",()=>{
 const baseline=version(streamBaseline);
 const bad=[
  [...streamCandidate,{name:"UNKNOWN_EXTRA",type:"secret_text"}],
  streamCandidate.map(x=>x.name==="RISK_STREAM_ACTIVE"?{...x,text:"0"}:x),
  streamCandidate.map(x=>x.name==="GEOMACRO_COMMERCIAL_STREAM_RELEASE"?{...x,text:"1"}:x),
  streamCandidate.map(x=>x.name==="DB"?{...x,type:"kv_namespace"}:x)
 ];
 for(const rows of bad)
  assert.throws(()=>assessReviewedHot50BindingParity(baseline,
   version(rows),sha,REVIEWABLE_ADDITIVE_SECRETS),/CANARY_BINDINGS_/);
 assert.throws(()=>assessReviewedHot50BindingParity(baseline,
  version(streamCandidate),sha,[]),/UNREVIEWED_ADDITION/);
 assert.throws(()=>assessReviewedHot50BindingParity(baseline,
  version(streamCandidate),sha,["UNKNOWN"]),/UNREVIEWED_SECRET_NAME/);
});

test("existing secret metadata is immutable and only genuinely additive names may be reviewed",()=>{
 const already={name:REVIEWABLE_ADDITIVE_SECRETS[0],type:"secret_text"};
 const old=version([...streamBaseline,already]);
 const candidate=version(streamCandidate);
 const missing=REVIEWABLE_ADDITIVE_SECRETS.slice(1);
 assert.equal(assessReviewedHot50BindingParity(old,candidate,sha,missing)
  .status,"PASS_REVIEWED_HOT50_PARITY");
 assert.throws(()=>assessReviewedHot50BindingParity(old,candidate,sha,
  REVIEWABLE_ADDITIVE_SECRETS),/REVIEWED_SECRET_ALREADY_EXISTS/);
 const rotated=version(streamCandidate.map(x=>x.name===already.name?
  {...x,account_id:"changed-provider-binding"}:x));
 assert.throws(()=>assessReviewedHot50BindingParity(old,rotated,sha,missing),
  /UNREVIEWED_RESOURCE_CHANGE/);
 const changedFlag=version(streamCandidate.map(x=>x.name==="RISK_STREAM_ACTIVE"?
  {...x,security_scope:"unreviewed-change"}:x));
 assert.throws(()=>assessReviewedHot50BindingParity(old,changedFlag,sha,missing),
  /REVIEWED_FLAG_RESOURCE_CHANGED/);
});
test("additional metadata on newly approved secret cannot bypass type or identity proof",()=>{
 const bad=streamCandidate.map(x=>x.name===REVIEWABLE_ADDITIVE_SECRETS[0]?
  {...x,provider_ref:"unreviewed"}:x);
 assert.throws(()=>assessReviewedHot50BindingParity(version(streamBaseline),
  version(bad),sha,REVIEWABLE_ADDITIVE_SECRETS),
  /REVIEWED_SECRET_TYPE_OR_METADATA/);
});

test("canonical six-stage canary signs Hot50 owner review even when secret additions are empty",async()=>{
 const {readFileSync}=await import("node:fs");
 const flow=readFileSync(new URL("../../.github/workflows/canary-promotion.yml",import.meta.url),"utf8");
 const review=readFileSync(new URL("../ops/attest-canary-additive-secrets.mjs",import.meta.url),"utf8");
 const promoter=readFileSync(new URL("../canary-promoter.ts",import.meta.url),"utf8");
 assert.match(flow,/reviewed_hot50_runtime:/);
 assert.match(flow,/ENABLE_HOT50_RESEARCH_NO_FUNDS/);
 assert.match(flow,/CANARY_OWNER_REVIEWED_HOT50_RUNTIME:/);
 assert.match(review,/reviewed_hot50_runtime:"ENABLE_HOT50_RESEARCH_NO_FUNDS"/);
 assert.match(review,/no_funds:true,commercial_release_authorized:false,hold_cleared:false/);
 assert.match(promoter,/CANARY_HOT50_SIGNED_OWNER_REVIEW_MISSING/);
 assert.match(promoter,/review\.reviewed_hot50_runtime==='ENABLE_HOT50_RESEARCH_NO_FUNDS'/);
 assert.match(promoter,/CANARY_ROLLBACK_BASELINE_100_VERIFIED/);
});
