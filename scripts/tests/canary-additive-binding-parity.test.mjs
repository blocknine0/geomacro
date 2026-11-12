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
