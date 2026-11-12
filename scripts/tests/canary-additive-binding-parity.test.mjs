import test from "node:test";
import assert from "node:assert/strict";
import {assessReviewedAdditiveBindingParity}
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

const SHA="a".repeat(40);
const src={name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:"b".repeat(40)};
const protectedVars=[
 {name:"GEOMACRO_P0B_ADMISSION_ACTIVE",type:"plain_text",text:"1"},
 {name:"GEOMACRO_P1_BUNDLED_LEASES_ENABLED",type:"plain_text",text:"1"},
 {name:"GEOMACRO_COMMERCIAL_STREAM_RELEASE",type:"plain_text",text:"0"},
 {name:"RISK_STREAM_CANARY_HOLD_CLEARED",type:"plain_text",text:"0"},
 {name:"RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED",type:"plain_text",text:"0"},
 {name:"RISK_GATE_COUNTRY_SCOPE",type:"plain_text",text:"GLOBAL"},
 {name:"RISK_STREAM_ACTIVE",type:"plain_text",text:"0"},
 {name:"STREAM_INGESTION_ENABLED",type:"plain_text",text:"false"},
 {name:"RISK_STREAM_HOT50_AUTONOMOUS_ENABLED",type:"plain_text",text:"0"}
];
const baselineBindings=[{name:"DB",type:"d1",id:"db-prod"},src,...protectedVars];
const candidateBindings=()=>baselineBindings.map(x=>({
 ...x,text:x.name==="GEOMACRO_SOURCE_SHA"?SHA:
 ({RISK_GATE_COUNTRY_SCOPE:"HOT50",RISK_STREAM_ACTIVE:"1",
 STREAM_INGESTION_ENABLED:"true",RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"1"})[x.name]??x.text
}));
test("signed-scope Hot50 profile and exact secret additions admit source SHA transition",()=>{
 const proposed=[...candidateBindings(),added];
 const result=assessReviewedAdditiveBindingParity(version(baselineBindings),
  version(proposed),{sourceSha:SHA,reviewedFlagProfile:"HOT50_INTAKE_REVIEWED",
   reviewedSecretNames:[added.name]});
 assert.equal(result.status,"PASS_BINDING_PARITY");
 assert.deepEqual(result.additions,[added.name]);
 assert.deepEqual(result.reviewed_flag_changes.sort(),[
  "RISK_GATE_COUNTRY_SCOPE","RISK_STREAM_ACTIVE",
  "RISK_STREAM_HOT50_AUTONOMOUS_ENABLED","STREAM_INGESTION_ENABLED"].sort());
 assert.equal(result.baseline_count+1,result.candidate_count);
});
test("unreviewed flags, secret additions, resource changes, gates fail closed",()=>{
 const proposed=[...candidateBindings(),added];
 const base=version(baselineBindings);
 const accept={sourceSha:SHA,reviewedFlagProfile:"HOT50_INTAKE_REVIEWED",
  reviewedSecretNames:[added.name]};
 assert.throws(()=>assessReviewedAdditiveBindingParity(base,version(proposed),
  {sourceSha:SHA,reviewedSecretNames:[added.name]}),/UNREVIEWED_RESOURCE_OR_VALUE_CHANGE/);
 assert.throws(()=>assessReviewedAdditiveBindingParity(base,version(proposed),
  {sourceSha:SHA,reviewedFlagProfile:"HOT50_INTAKE_REVIEWED"}),/UNREVIEWED_SECRET_ADDITION/);
 for(const [name,value] of [
  ["GEOMACRO_COMMERCIAL_STREAM_RELEASE","1"],
  ["RISK_STREAM_CANARY_HOLD_CLEARED","1"],
  ["RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED","1"],
  ["STREAM_INGESTION_ENABLED","false"]]){
  const bad=proposed.map(x=>x.name===name?{...x,text:value}:x);
  assert.throws(()=>assessReviewedAdditiveBindingParity(base,version(bad),accept));
 }
 const dbChanged=proposed.map(x=>x.name==="DB"?{...x,id:"other-db"}:x);
 assert.throws(()=>assessReviewedAdditiveBindingParity(base,version(dbChanged),accept),
  /UNREVIEWED_RESOURCE_OR_VALUE_CHANGE/);
 assert.throws(()=>assessReviewedAdditiveBindingParity(base,
  version([...proposed,{name:"NEW_KV",type:"kv_namespace"}]),accept),/UNREVIEWED_ADDITION/);
});
