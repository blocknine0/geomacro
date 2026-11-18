import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessReviewedAdditiveBindingParity,assessReviewedHot50BindingParity,
 reviewedHot50CandidateVars,REVIEWABLE_ADDITIVE_SECRETS,diagnoseReviewedHot50BindingDelta}
 from "../lib/canary-additive-binding-parity.mjs";
import {candidateConfig,verifyCandidateBindings} from "../ops/prepare-optimized-worker-candidate.mjs";
import {assessP95LatencyRegression,checkSource,requireCanaryObservabilityPrerequisites,
 verifiedLiveObservability} from "../canary-promoter.ts";
import {classifyGraphQLHttpFailure,queryCloudflareAnalytics} from "../release-common.ts";
const version=bindings=>({resources:{bindings}});
const db={name:"DB",type:"d1"};
const added={name:"GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",type:"secret_text"};
test("p95 regression compares only two measured Worker samples and holds on a real regression",()=>{
 const baseline={worker_metrics_status:"DELAYED_OR_EMPTY",worker_wall_time_p95_ms:null};
 const unavailable={worker_metrics_status:"DELAYED_OR_EMPTY",worker_wall_time_p95_ms:null};
 assert.equal(assessP95LatencyRegression(baseline,unavailable).status,
  "SKIPPED_UNAVAILABLE");
 const coldBaseline={worker_metrics_status:"VERIFIED",worker_wall_time_p95_ms:8};
 const coldCandidate={worker_metrics_status:"DELAYED_OR_EMPTY",worker_wall_time_p95_ms:null};
 assert.equal(assessP95LatencyRegression(coldBaseline,coldCandidate).reason,
  "CANDIDATE_WORKER_P95_UNAVAILABLE");
 assert.equal(assessP95LatencyRegression(coldBaseline,
  {worker_metrics_status:"VERIFIED",worker_wall_time_p95_ms:7}).status,"PASS");
 assert.throws(()=>assessP95LatencyRegression(coldBaseline,
  {worker_metrics_status:"VERIFIED",worker_wall_time_p95_ms:9}),
  /CANARY_P95_BASELINE_LATENCY_REGRESSION/u);
});
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
const researchRuntime={RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
 STREAM_MODE:"PRODUCTION",RISK_STREAM_HOT50_AUTONOMOUS_ENABLED:"1"};
const streamBaseline=[db,
 {name:"PREDGE_PAID_TRAFFIC_ENABLED",type:"plain_text",text:"NO"},
 {name:"PREDGE_PAID_GO_LIVE_CROSSCHECK",type:"plain_text",text:""},
 {name:"PREDGE_MUTUAL_TRIAL_STARTED_AT",type:"plain_text",text:""},
 {name:"RISK_STREAM_ACTIVE",type:"plain_text",text:"0"},
 {name:"STREAM_INGESTION_ENABLED",type:"plain_text",text:"false"},
 {name:"RISK_STREAM_HOT50_AUTONOMOUS_ENABLED",type:"plain_text",text:"0"},
 {name:"GEOMACRO_COMMERCIAL_STREAM_RELEASE",type:"plain_text",text:"0"},
 {name:"RISK_STREAM_CANARY_HOLD_CLEARED",type:"plain_text",text:"0"},
 {name:"RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED",type:"plain_text",text:"0"},
 {name:"RISK_GATE_COUNTRY_SCOPE",type:"plain_text",text:"HOT50"},
 {name:"GEOMACRO_SOURCE_SHA",type:"plain_text",text:"b".repeat(40)}];
const streamCandidate=[
 ...streamBaseline.filter(x=>!Object.hasOwn(reviewedHot50CandidateVars(sha,researchRuntime),x.name)),
 ...Object.entries(reviewedHot50CandidateVars(sha,researchRuntime)).map(([name,text])=>
  ({name,type:"plain_text",text})),
 ...REVIEWABLE_ADDITIVE_SECRETS.map(name=>({name,type:"secret_text"}))
];
test("reviewed Hot50 flags and exact additive secrets pass without broadening review",()=>{
 const result=assessReviewedHot50BindingParity(version(streamBaseline),
  version(streamCandidate),sha,REVIEWABLE_ADDITIVE_SECRETS,researchRuntime);
 assert.equal(result.status,"PASS_REVIEWED_HOT50_PARITY");
 assert.equal(result.source_sha,sha);
 assert.equal(result.additions.length,REVIEWABLE_ADDITIVE_SECRETS.length+1);
 assert.equal(result.additions.includes("STREAM_MODE"),true);
 const delta=diagnoseReviewedHot50BindingDelta(version(streamBaseline),
  version(streamCandidate),sha,REVIEWABLE_ADDITIVE_SECRETS,researchRuntime);
 assert.deepEqual(delta.expected_additions_missing,[]);
});

test("reviewed queue bindings pass parity only when the explicit queue flag is enabled",()=>{
 const queueRuntime={...researchRuntime,GEOMACRO_RISK_STREAM_QUEUES_BIND:"1"};
 const queues=[
  {name:"RISK_STREAM_QUEUE",type:"queue",queue_name:"geomacro-risk-stream"},
  {name:"RISK_STREAM_DELIVERY_QUEUE",type:"queue",queue_name:"geomacro-risk-stream-delivery"}
 ];
 const attesters=[
  {name:"RISK_STREAM_FACTS_ATTESTER",type:"service",
   service:"geomacro-risk-stream-facts-attester"},
  {name:"RISK_STREAM_RIGHTS_ATTESTER",type:"service",
   service:"geomacro-risk-stream-rights-attester"}
 ];
 const base=version(streamBaseline);
 const candidate=version([...streamCandidate,...queues,...attesters]);
 const result=assessReviewedHot50BindingParity(base,candidate,sha,
  REVIEWABLE_ADDITIVE_SECRETS,queueRuntime);
 assert.equal(result.status,"PASS_REVIEWED_HOT50_PARITY");
 assert.ok(result.additions.includes("RISK_STREAM_QUEUE"));
 assert.ok(result.additions.includes("RISK_STREAM_DELIVERY_QUEUE"));
 const delta=diagnoseReviewedHot50BindingDelta(base,candidate,sha,
  REVIEWABLE_ADDITIVE_SECRETS,queueRuntime);
 assert.equal(delta.status,"NO_UNEXPECTED_BINDING_NAMES");
 assert.deepEqual(delta.expected_additions_missing,[]);
});

test("queue additions without the reviewed flag and wrong queue types fail closed",()=>{
 const queues=[
  {name:"RISK_STREAM_QUEUE",type:"queue",queue_name:"geomacro-risk-stream"},
  {name:"RISK_STREAM_DELIVERY_QUEUE",type:"queue",queue_name:"geomacro-risk-stream-delivery"}
 ];
 const attesters=[
  {name:"RISK_STREAM_FACTS_ATTESTER",type:"service",
   service:"geomacro-risk-stream-facts-attester"},
  {name:"RISK_STREAM_RIGHTS_ATTESTER",type:"service",
   service:"geomacro-risk-stream-rights-attester"}
 ];
 const base=version(streamBaseline);
 const unflagged=version([...streamCandidate,...queues]);
 assert.throws(()=>assessReviewedHot50BindingParity(base,unflagged,sha,
  REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),/RISK_STREAM_QUEUE_BINDING_UNREVIEWED/);
 const wrongType=version([...streamCandidate,
  {...queues[0],type:"service"},
  queues[1],...attesters
 ]);
 assert.throws(()=>assessReviewedHot50BindingParity(base,wrongType,sha,
  REVIEWABLE_ADDITIVE_SECRETS,{...researchRuntime,GEOMACRO_RISK_STREAM_QUEUES_BIND:"1"}),
  /RISK_STREAM_QUEUE_TYPE_INVALID_RISK_STREAM_QUEUE/);
 const missing=version([...streamCandidate,queues[0],...attesters]);
 assert.throws(()=>assessReviewedHot50BindingParity(base,missing,sha,
  REVIEWABLE_ADDITIVE_SECRETS,{...researchRuntime,GEOMACRO_RISK_STREAM_QUEUES_BIND:"1"}),
  /UNREVIEWED_ADDITION/);
});

test("queue flag is carried from deploy environment through owner attestation and candidate parity",()=>{
 const attest=readFileSync(new URL("../ops/attest-canary-additive-secrets.mjs",import.meta.url),"utf8");
 const prepare=readFileSync(new URL("../ops/prepare-optimized-worker-candidate.mjs",import.meta.url),"utf8");
 assert.match(attest,/GEOMACRO_RISK_STREAM_QUEUES_BIND/u);
 assert.match(prepare,/predgeRuntimeVars\.GEOMACRO_RISK_STREAM_QUEUES_BIND==='1'/u);
 assert.match(prepare,/diagnoseReviewedHot50BindingDelta\(baseline,candidate,\s*env\.GITHUB_SHA,reviewedSecrets,env\)/u);
 assert.match(prepare,/assessReviewedHot50BindingParity\(baseline,candidate,sha,reviewedSecrets,predgeRuntimeVars\)/u);
});

test("missing STREAM_MODE is reported as a missing reviewed candidate binding",()=>{
 const missing=streamCandidate.filter(x=>x.name!=="STREAM_MODE");
 const delta=diagnoseReviewedHot50BindingDelta(version(streamBaseline),
  version(missing),sha,REVIEWABLE_ADDITIVE_SECRETS,researchRuntime);
 assert.deepEqual(delta.expected_additions_missing,["STREAM_MODE"]);
 assert.throws(()=>assessReviewedHot50BindingParity(version(streamBaseline),
  version(missing),sha,REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),
  /REVIEWED_FLAG_NOT_VERIFIED_STREAM_MODE/);
});

test("Wrangler raw plain_text binding config satisfies uploaded-version parity",()=>{
 const baseline={resources:{script_runtime:{compatibility_date:"2026-10-03"},bindings:[
  ...streamBaseline,{name:"CONTROL_PLANE_TOKEN",type:"secret_text"}
 ]}};
 const config=candidateConfig(baseline,sha,[],researchRuntime);
 const uploaded={resources:{script_runtime:structuredClone(baseline.resources.script_runtime),
  bindings:[
   ...Object.entries(config.vars).map(([name,text])=>({name,type:"plain_text",text})),
   ...config.unsafe.bindings.map(x=>x.type==="inherit"?
    structuredClone(baseline.resources.bindings.find(row=>row.name===x.name)):
    ({name:x.name,type:x.type,text:x.text}))
  ]}};
 assert.equal(uploaded.resources.bindings.filter(x=>x.name==="STREAM_MODE").length,1);
 assert.equal(uploaded.resources.bindings.find(x=>x.name==="STREAM_MODE").text,"PRODUCTION");
 assert.equal(assessReviewedHot50BindingParity(version(baseline.resources.bindings),
  version(uploaded.resources.bindings),sha,[],researchRuntime).status,
  "PASS_REVIEWED_HOT50_PARITY");
});
test("exact-main upload contract passes with STREAM_MODE and reviewed signing secrets",()=>{
 const reviewed=["GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",
  "GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64",
  "GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64","RISK_STREAM_INDEX_LEAD_BEARER",
  "PREDGE_PAID_RISK_GATE_TOKEN",
  "RISK_STREAM_GRO_SIGN_PKCS8_B64","RISK_STREAM_GRO_VERIFY_SPKI_B64",
  "RISK_STREAM_MACHINE_FACTS_SPKI_B64","RISK_STREAM_MACHINE_RIGHTS_SPKI_B64",
  "RISK_STREAM_AES256_KEY_B64"];
 const base={resources:{script_runtime:{compatibility_date:"2026-10-03",
  compatibility_flags:[]},bindings:[...streamBaseline,{name:"CONTROL_PLANE_TOKEN",
   type:"secret_text"}]}};
 const config=candidateConfig(base,sha,reviewed,researchRuntime);
 const inherited=new Map(base.resources.bindings.map(row=>[row.name,row]));
 const uploaded={resources:{script_runtime:structuredClone(base.resources.script_runtime),
  bindings:[
   ...Object.entries(config.vars).map(([name,text])=>({name,type:"plain_text",text})),
   ...config.unsafe.bindings.map(row=>row.type==="inherit"?
    structuredClone(inherited.get(row.name)):
    ({name:row.name,type:row.type,text:row.text})),
   ...reviewed.map(name=>({name,type:"secret_text"}))
  ]}};
 assert.equal(uploaded.resources.bindings.filter(row=>row.name==="STREAM_MODE").length,1);
 assert.deepEqual(REVIEWABLE_ADDITIVE_SECRETS.filter(name=>reviewed.includes(name)),reviewed);
 assert.ok(reviewed.slice(-4).every(name=>REVIEWABLE_ADDITIVE_SECRETS.includes(name)));
 assert.equal(verifyCandidateBindings(base,uploaded,sha,reviewed,researchRuntime),true);
});
test("Predge vars default fail-closed and explicitly reviewed trial vars are validated",()=>{
 const defaults=reviewedHot50CandidateVars(sha);
 assert.equal(defaults.PREDGE_PAID_TRAFFIC_ENABLED,"NO");
 assert.equal(defaults.PREDGE_PAID_GO_LIVE_CROSSCHECK,"");
 assert.equal(defaults.PREDGE_MUTUAL_TRIAL_STARTED_AT,"");
 assert.equal(Object.hasOwn(defaults,"GEOMACRO_STORE_CHECKOUT_ENABLED"),false);
 const explicit=reviewedHot50CandidateVars(sha,{
  PREDGE_PAID_TRAFFIC_ENABLED:"YES",PREDGE_PAID_GO_LIVE_CROSSCHECK:"PASS",
  PREDGE_MUTUAL_TRIAL_STARTED_AT:"2026-11-13T10:00:00Z",
  GEOMACRO_STORE_CHECKOUT_ENABLED:"YES"});
 assert.equal(explicit.PREDGE_PAID_TRAFFIC_ENABLED,"YES");
 assert.equal(explicit.PREDGE_PAID_GO_LIVE_CROSSCHECK,"PASS");
 assert.equal(explicit.GEOMACRO_STORE_CHECKOUT_ENABLED,"YES");
 assert.throws(()=>reviewedHot50CandidateVars(sha,{GEOMACRO_STORE_CHECKOUT_ENABLED:"true"}),
  /STORE_CHECKOUT_RUNTIME_VAR_INVALID/);
 assert.throws(()=>reviewedHot50CandidateVars(sha,{PREDGE_PAID_TRAFFIC_ENABLED:"true"}),
  /PREDGE_TRIAL_RUNTIME_VAR_INVALID/);
 assert.throws(()=>reviewedHot50CandidateVars(sha,{PREDGE_MUTUAL_TRIAL_STARTED_AT:"yesterday"}),
  /PREDGE_TRIAL_RUNTIME_VAR_INVALID/);
});
test("Predge paid token is additive only when named for review; it remains optional otherwise",()=>{
 const token="PREDGE_PAID_RISK_GATE_TOKEN";
 const existingLegacy=REVIEWABLE_ADDITIVE_SECRETS.filter(name=>name!==token)
  .map(name=>({name,type:"secret_text"}));
 const base=version([...streamBaseline,...existingLegacy]);
 const candidateRows=[...streamCandidate.filter(x=>x.name!==token),{name:token,type:"secret_text"}];
 assert.equal(assessReviewedHot50BindingParity(base,version(candidateRows),sha,[token],researchRuntime)
  .status,"PASS_REVIEWED_HOT50_PARITY");
 assert.throws(()=>assessReviewedHot50BindingParity(base,version(candidateRows),sha,[],researchRuntime),
  /UNREVIEWED_ADDITION/);
 const noToken=version(streamCandidate.filter(x=>x.name!==token));
 assert.equal(assessReviewedHot50BindingParity(base,noToken,sha,[],researchRuntime)
  .status,"PASS_REVIEWED_HOT50_PARITY");
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
   version(rows),sha,REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),/CANARY_BINDINGS_/);
 assert.throws(()=>assessReviewedHot50BindingParity(baseline,
  version(streamCandidate),sha,[],researchRuntime),/UNREVIEWED_ADDITION/);
 assert.throws(()=>assessReviewedHot50BindingParity(baseline,
  version(streamCandidate),sha,["UNKNOWN"],researchRuntime),/UNREVIEWED_SECRET_NAME/);
});

test("existing secret metadata is immutable and only genuinely additive names may be reviewed",()=>{
 const already={name:REVIEWABLE_ADDITIVE_SECRETS[0],type:"secret_text"};
 const old=version([...streamBaseline,already]);
 const candidate=version(streamCandidate);
 const missing=REVIEWABLE_ADDITIVE_SECRETS.slice(1);
 assert.equal(assessReviewedHot50BindingParity(old,candidate,sha,missing,researchRuntime)
  .status,"PASS_REVIEWED_HOT50_PARITY");
 assert.throws(()=>assessReviewedHot50BindingParity(old,candidate,sha,
  REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),/REVIEWED_SECRET_ALREADY_EXISTS/);
 const rotated=version(streamCandidate.map(x=>x.name===already.name?
  {...x,account_id:"changed-provider-binding"}:x));
 assert.throws(()=>assessReviewedHot50BindingParity(old,rotated,sha,missing,researchRuntime),
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
  version(bad),sha,REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),
  /REVIEWED_SECRET_TYPE_OR_METADATA/);
});

test("release reviewer service binding must match the independently protected service name",()=>{
 const reviewerRuntime={...researchRuntime,GEOMACRO_RELEASE_REVIEWER_SERVICE:"geomacro-release-reviewer"};
 const base=version(streamBaseline);
 const vars=reviewedHot50CandidateVars(sha,reviewerRuntime);
 const candidate=version([
  ...streamBaseline.filter(x=>!Object.hasOwn(vars,x.name)),
  ...Object.entries(vars).map(([name,text])=>({name,type:"plain_text",text})),
  ...REVIEWABLE_ADDITIVE_SECRETS.map(name=>({name,type:"secret_text"})),
  {name:"GEOMACRO_RELEASE_REVIEWER",type:"service",service:"geomacro-release-reviewer"}
 ]);
 assert.equal(assessReviewedHot50BindingParity(base,candidate,sha,
  REVIEWABLE_ADDITIVE_SECRETS,reviewerRuntime).status,"PASS_REVIEWED_HOT50_PARITY");
 assert.throws(()=>assessReviewedHot50BindingParity(base,candidate,sha,
  REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),/GEOMACRO_RELEASE_REVIEWER_BINDING_UNREVIEWED/);
 const wrong=version(candidate.resources.bindings.map(x=>x.name==="GEOMACRO_RELEASE_REVIEWER"?
  {...x,service:"unreviewed-worker"}:x));
 assert.throws(()=>assessReviewedHot50BindingParity(base,wrong,sha,
  REVIEWABLE_ADDITIVE_SECRETS,reviewerRuntime),/GEOMACRO_RELEASE_REVIEWER_BINDING_MISMATCH/);
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

test("provider delta names identify unreviewed additions without leaking any values",()=>{
 const base=version([...streamBaseline,{name:"SECRET_KEY",type:"secret_text",secret:"PRIVATE_MATERIAL"}]);
 const candidate=version([...streamCandidate,
  {name:"SECRET_KEY",type:"secret_text",secret:"PRIVATE_MATERIAL"},
  {name:"UNEXPECTED_BINDING",type:"plain_text",text:"DO_NOT_LOG_THIS_VALUE"}]);
 const result=diagnoseReviewedHot50BindingDelta(base,candidate,sha,[],researchRuntime);
 assert.equal(result.status,"UNREVIEWED_BINDING_DELTA_HOLD");
 assert.ok(result.unexpected_addition_names.includes("UNEXPECTED_BINDING"));
 assert.deepEqual(result.actual_additions.find(x=>x.name==="UNEXPECTED_BINDING"),
  {name:"UNEXPECTED_BINDING",type:"plain_text"});
 assert.equal(result.secret_values_included,false);
 assert.equal(result.plain_text_values_included,false);
 assert.equal(result.traffic_promoted,false);
 assert.doesNotMatch(JSON.stringify(result),/DO_NOT_LOG_THIS_VALUE|PRIVATE_MATERIAL/);
 assert.throws(()=>assessReviewedHot50BindingParity(base,candidate,sha,[],researchRuntime),
  /UNREVIEWED_ADDITION/);
 assert.throws(()=>assessReviewedHot50BindingParity(base,candidate,sha,[],researchRuntime),
  /UNREVIEWED_ADDITION_ACTUAL_.*UNEXPECTED_BINDING/);
});
test("reviewed named candidate additions remain diagnostic-only, not authorization",()=>{
 const base=version(streamBaseline);
 const cand=version([...streamCandidate.filter(x=>!REVIEWABLE_ADDITIVE_SECRETS.includes(x.name)),
  {name:"GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",type:"secret_text"}]);
 const result=diagnoseReviewedHot50BindingDelta(base,cand,sha,
  ["GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64"],researchRuntime);
 assert.equal(result.status,"NO_UNEXPECTED_BINDING_NAMES");
 assert.deepEqual(result.unexpected_addition_names,[]);
 assert.equal(assessReviewedHot50BindingParity(base,cand,sha,
  ["GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64"],researchRuntime).status,"PASS_REVIEWED_HOT50_PARITY");
});

test("Lovable domain canary uses worker-level telemetry without a Cloudflare Zone",()=>{
 assert.equal(requireCanaryObservabilityPrerequisites({}),"WORKER_D1_B2_ONLY");
 assert.equal(requireCanaryObservabilityPrerequisites({CLOUDFLARE_ZONE_ID:""}),
  "WORKER_D1_B2_ONLY");
 assert.throws(()=>requireCanaryObservabilityPrerequisites({CLOUDFLARE_ZONE_ID:"bad"}),
  /CANARY_ZONE_ID_INVALID/);
 assert.equal(requireCanaryObservabilityPrerequisites({
  CLOUDFLARE_ZONE_ID:"a".repeat(32)}),"ZONE_AND_WORKER");
 const promoter=readFileSync(new URL("../canary-promoter.ts",import.meta.url),"utf8");
 assert.match(promoter,/query\(WORKER_GRAPH/);
 assert.match(promoter,/workersInvocationsAdaptive\(limit:100,filter:\{scriptName:\$script,datetime_geq:\$start,datetime_leq:\$end\}\)/u);
 assert.doesNotMatch(promoter,/workersInvocationsAdaptive\([^\n]*scriptVersion:\$version/u);
 assert.match(promoter,/zone_http_5xx_unavailable_reason:zone\?null:'NO_CLOUDFLARE_ZONE_FOR_DOMAIN'/);
 assert.match(promoter,/CANARY_D1_SCHEMA_PROOF_NOT_ACCEPTED/);
 assert.match(promoter,/b2-physical-parity-certificate\.json/);
 assert.match(promoter,/checkLiveD1Budget\(\)/u);
 assert.match(promoter,/DIRECTED_HEALTH_READINESS_D1_MONTHLY_HEADROOM_SIGNED_B2_D1_PROOFS/u);
});

test("Cloudflare GraphQL HTTP failures use fixed provider-safe diagnostics",()=>{
 assert.equal(classifyGraphQLHttpFailure(401),"RELEASE_GRAPHQL_ACCESS_DENIED");
 assert.equal(classifyGraphQLHttpFailure(403),"RELEASE_GRAPHQL_ACCESS_DENIED");
 assert.equal(classifyGraphQLHttpFailure(429),"RELEASE_GRAPHQL_RATE_OR_COST_LIMIT");
 assert.equal(classifyGraphQLHttpFailure(503),"RELEASE_GRAPHQL_PROVIDER_UNAVAILABLE");
 assert.equal(classifyGraphQLHttpFailure(418),"RELEASE_GRAPHQL_UNVERIFIED_418");
});

test("Cloudflare GraphQL transport failure is normalized for the no-Zone telemetry fallback",async()=>{
 const originalFetch=globalThis.fetch;
 const originalToken=process.env.CLOUDFLARE_BILLING_READ_TOKEN;
 process.env.CLOUDFLARE_BILLING_READ_TOKEN="test-token-value-long-enough";
 try{
  globalThis.fetch=async()=>{throw Error("network detail must not escape");};
  await assert.rejects(queryCloudflareAnalytics("query{}",{}),
   error=>error.message==="RELEASE_GRAPHQL_PROVIDER_UNAVAILABLE");
  globalThis.fetch=async()=>({ok:false,redirected:false,status:403,
   json:async()=>({errors:[{message:"Forbidden"}]})});
  await assert.rejects(queryCloudflareAnalytics("query{}",{}),
   error=>error.message==="RELEASE_GRAPHQL_ACCESS_DENIED");
 }finally{
  globalThis.fetch=originalFetch;
  if(originalToken===undefined)delete process.env.CLOUDFLARE_BILLING_READ_TOKEN;
  else process.env.CLOUDFLARE_BILLING_READ_TOKEN=originalToken;
 }
});

test("candidate override checks health SHA and the actual D1 readiness contract",async()=>{
 const sha="a".repeat(40),candidate="11111111-1111-4111-8111-111111111111";
 const seen=[];
 const payloads=[{ok:true,deployed_source_sha:sha},{status:"ready",paid_launch_approved:false,
  execution_authorized:false,checks:{database:true,audit_store:true,
   isolated_partner_credential:true,progressive_decision_ed25519_signer_configured:true}}];
 await checkSource(candidate,sha,async(url,init)=>{
  seen.push({url,init});
  return {status:200,json:async()=>payloads.shift()};
 });
 assert.match(seen[0].url,/\/health$/u);
 assert.match(seen[1].url,/\/v1\/public\/risk-gate-d1-readiness$/u);
 for(const item of seen){
  assert.equal(item.init.headers["Cloudflare-Workers-Version-Overrides"],
   `geomacro-control-plane="${candidate}"`);
  assert.equal(item.init.redirect,"error");
 }
});

test("no-zone Worker telemetry tolerates delayed samples and selects the exact version without an unsupported filter",async()=>{
 let queryText="",queryVariables;
 const delayed=await verifiedLiveObservability("2026-11-15T00:00:00.000Z",
  "2026-11-15T00:15:00.000Z","11111111-1111-4111-8111-111111111111",true,{
   env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_ZONE_ID:""},
   query:async(query,variables)=>{queryText=query;queryVariables=variables;return {viewer:{accounts:[{workersInvocationsAdaptive:[]}]}};},
   log:()=>{}
  });
 assert.equal(delayed,null);
 assert.match(queryText,/workersInvocationsAdaptive/u);
 assert.match(queryText,/limit:100/u);
 assert.doesNotMatch(queryText,/scriptVersion:\$version/u);
 assert.equal(queryVariables.version,undefined);
 assert.doesNotMatch(queryText,/zones\(/u);
 const lowVolume=await verifiedLiveObservability("2026-11-15T00:00:00.000Z",
  "2026-11-15T00:15:00.000Z","11111111-1111-4111-8111-111111111111",true,{
   env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_ZONE_ID:""},
   query:async()=>({viewer:{accounts:[{workersInvocationsAdaptive:[{
    dimensions:{scriptVersion:"11111111-1111-4111-8111-111111111111"},
    sum:{requests:12,errors:0},quantiles:{wallTimeP95:1000,wallTimeP99:2000}
   }]}]}}),log:()=>{}
  });
 assert.equal(lowVolume,null);
 const incomplete=await verifiedLiveObservability("2026-11-15T00:00:00.000Z",
  "2026-11-15T00:15:00.000Z","11111111-1111-4111-8111-111111111111",true,{
   env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_ZONE_ID:""},
   query:async()=>({viewer:{accounts:[{workersInvocationsAdaptive:[{
    dimensions:{scriptVersion:"11111111-1111-4111-8111-111111111111"},sum:{requests:0}
   }]}]}}),log:()=>{}
  });
 assert.equal(incomplete,null);
 const wanted="11111111-1111-4111-8111-111111111111";
 const exact=await verifiedLiveObservability("2026-11-15T00:00:00.000Z",
  "2026-11-15T00:15:00.000Z",wanted,true,{
   env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_ZONE_ID:""},
   query:async()=>({viewer:{accounts:[{workersInvocationsAdaptive:[
    {dimensions:{scriptVersion:"22222222-2222-4222-8222-222222222222"},
     sum:{requests:90000,errors:90},quantiles:{wallTimeP95:11000,wallTimeP99:22000}},
    {dimensions:{scriptVersion:wanted},sum:{requests:120000,errors:12},
     quantiles:{wallTimeP95:9000,wallTimeP99:18000}}
   ]}]}})
  });
 assert.equal(exact.worker_script_version,wanted);
 assert.equal(exact.worker_requests,120000);
 assert.equal(exact.worker_error_ratio_under_0_5pct,true);
 assert.equal(exact.worker_wall_time_p95_ms,9);
});

test("no-zone GraphQL provider and access failures emit safe diagnostics and fall back to directed gates",async()=>{
 for(const code of ["RELEASE_GRAPHQL_PROVIDER_ERRORS","RELEASE_GRAPHQL_PROVIDER_UNAVAILABLE",
  "RELEASE_GRAPHQL_RATE_OR_COST_LIMIT","RELEASE_GRAPHQL_ACCESS_DENIED",
  "RELEASE_GRAPHQL_UNVERIFIED_403","RELEASE_GRAPHQL_SCHEMA_REJECTED"]){
  const logs=[];
  const fallback=await verifiedLiveObservability("2026-11-15T00:00:00Z",
   "2026-11-15T00:15:00Z","11111111-1111-4111-8111-111111111111",true,{
    env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_ZONE_ID:""},
    query:async()=>{throw Error(code);},
    log:entry=>logs.push(entry)
   });
  assert.equal(fallback,null,code);
  // Preserve the underlying safe provider code before emitting the fixed
  // fallback receipt; secret-bearing provider text is never accepted here.
  assert.equal(logs.length,2,code);
  const underlying=JSON.parse(logs[0]);
  assert.equal(underlying.event,"CANARY_PROVIDER_RETRY_OR_HOLD");
  assert.equal(underlying.error_message,code);
  const diagnostic=JSON.parse(logs[1]);
  assert.deepEqual(diagnostic,{status:"DEGRADED",code:"CANARY_WORKER_TELEMETRY_UNAVAILABLE",
   diagnostic_code:code,version:"11111111-1111-4111-8111-111111111111",
   fallback:"DIRECTED_HEALTH_READINESS_D1_MONTHLY_HEADROOM_SIGNED_B2_D1_PROOFS"});
  assert.doesNotMatch(logs.join("\\n"),/DO_NOT_LOG_PROVIDER_MESSAGE/u);
 }
});

test("GraphQL telemetry errors remain fail-closed when zone analytics is configured",async()=>{
 await assert.rejects(verifiedLiveObservability("2026-11-15T00:00:00Z",
  "2026-11-15T00:15:00Z","11111111-1111-4111-8111-111111111111",true,{
   env:{CLOUDFLARE_ACCOUNT_ID:"a".repeat(32),CLOUDFLARE_ZONE_ID:"b".repeat(32)},
   query:async()=>{throw Error("RELEASE_GRAPHQL_PROVIDER_ERRORS");},log:()=>{}
  }),/RELEASE_GRAPHQL_PROVIDER_ERRORS/u);
});

test("held versioned rollout timeout exceeds all six stage windows with setup margin",()=>{
 const flow=readFileSync(new URL("../../.github/workflows/deploy-d1-control-plane.yml",import.meta.url),"utf8");
 assert.match(flow,/held-versioned-canary-rollout:[\s\S]{0,500}timeout-minutes: 150/u);
 assert.equal(15+30+15+15+15+15,105);
});

test("all ten reviewed rollout secrets are wired into candidate creation and attestation",()=>{
 const names=["GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",
  "GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64",
  "GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64","RISK_STREAM_INDEX_LEAD_BEARER",
  "RISK_STREAM_MACHINE_FACTS_SPKI_B64","RISK_STREAM_MACHINE_RIGHTS_SPKI_B64",
  "RISK_STREAM_GRO_SIGN_PKCS8_B64","RISK_STREAM_GRO_VERIFY_SPKI_B64",
  "PREDGE_PAID_RISK_GATE_TOKEN","RISK_STREAM_AES256_KEY_B64"];
 const workflow=readFileSync(new URL("../../.github/workflows/deploy-d1-control-plane.yml",import.meta.url),"utf8");
 const attest=readFileSync(new URL("../ops/attest-canary-additive-secrets.mjs",import.meta.url),"utf8");
 for(const name of names){
  assert.ok(REVIEWABLE_ADDITIVE_SECRETS.includes(name),`${name} missing from review allowlist`);
  assert.match(workflow,new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`,"u"));
 }
 assert.match(attest,/REVIEWABLE_ADDITIVE_SECRETS/u);
 assert.match(attest,/reviewed\.every\(s=>REVIEWABLE_ADDITIVE_SECRETS\.includes\(s\)\)/u);
});

test("--verify remains pinned to the reviewed 0204-0211 physical schema set",()=>{
 const source=readFileSync(new URL("../apply-d1-migrations.ts",import.meta.url),"utf8");
 const plan=readFileSync(new URL("../ops/protected-d1-repair-plan.mjs",import.meta.url),"utf8");
 assert.match(source,/verifiedSql\(\);const mainSha=assertOfficialMain\(\)/u);
 assert.match(source,/if\(apply\)\{/u);
 assert.match(source,/const proof=await verifySchema\(db\.uuid\)/u);
 assert.match(plan,/\['0204_d1_read_hotspot_optimization\.sql'/u);
 assert.match(plan,/\['0211_p0b_daily_committed_count\.sql'/u);
 assert.match(source,/found\.length===8&&REPAIR_PLANS\.every\(p=>found\.includes\(p\.file\)\)/u);
});

test("Risk Stream attester service bindings require the explicit queue review flag",()=>{
 const runtime={...researchRuntime,GEOMACRO_RISK_STREAM_QUEUES_BIND:"1"};
 const queues=[
  {name:"RISK_STREAM_QUEUE",type:"queue",queue_name:"geomacro-risk-stream"},
  {name:"RISK_STREAM_DELIVERY_QUEUE",type:"queue",queue_name:"geomacro-risk-stream-delivery"}
 ];
 const attesters=[
  {name:"RISK_STREAM_FACTS_ATTESTER",type:"service",
   service:"geomacro-risk-stream-facts-attester"},
  {name:"RISK_STREAM_RIGHTS_ATTESTER",type:"service",
   service:"geomacro-risk-stream-rights-attester"}
 ];
 const base=version(streamBaseline);
 const candidate=version([...streamCandidate,...queues,...attesters]);
 const result=assessReviewedHot50BindingParity(base,candidate,sha,
  REVIEWABLE_ADDITIVE_SECRETS,runtime);
 assert.equal(result.status,"PASS_REVIEWED_HOT50_PARITY");
 for(const row of attesters)assert.ok(result.additions.includes(row.name));
 const delta=diagnoseReviewedHot50BindingDelta(base,candidate,sha,
  REVIEWABLE_ADDITIVE_SECRETS,runtime);
 assert.equal(delta.status,"NO_UNEXPECTED_BINDING_NAMES");
 assert.deepEqual(delta.expected_additions_missing,[]);
 for(const row of attesters)assert.ok(delta.expected_additions.includes(row.name));

 const unflagged=version([...streamCandidate,...attesters]);
 assert.throws(()=>assessReviewedHot50BindingParity(base,unflagged,sha,
  REVIEWABLE_ADDITIVE_SECRETS,researchRuntime),
  /RISK_STREAM_ATTESTER_BINDING_UNREVIEWED_RISK_STREAM_FACTS_ATTESTER/u);
 assert.equal(diagnoseReviewedHot50BindingDelta(base,unflagged,sha,
  REVIEWABLE_ADDITIVE_SECRETS,researchRuntime).status,"UNREVIEWED_BINDING_DELTA_HOLD");

 const wrongService=version([...streamCandidate,...queues,
  {...attesters[0],service:"wrong-attester"},attesters[1]]);
 assert.throws(()=>assessReviewedHot50BindingParity(base,wrongService,sha,
  REVIEWABLE_ADDITIVE_SECRETS,runtime),
  /RISK_STREAM_ATTESTER_BINDING_MISMATCH_RISK_STREAM_FACTS_ATTESTER/u);
 assert.equal(diagnoseReviewedHot50BindingDelta(base,wrongService,sha,
  REVIEWABLE_ADDITIVE_SECRETS,runtime).status,"UNREVIEWED_BINDING_DELTA_HOLD");

 const wrongType=version([...streamCandidate,...queues,
  {...attesters[0],type:"queue"},attesters[1]]);
 assert.throws(()=>assessReviewedHot50BindingParity(base,wrongType,sha,
  REVIEWABLE_ADDITIVE_SECRETS,runtime),
  /RISK_STREAM_ATTESTER_BINDING_MISMATCH_RISK_STREAM_FACTS_ATTESTER/u);
 const extraMetadata=version([...streamCandidate,...queues,
  {...attesters[0],service_account_id:"unexpected"},attesters[1]]);
 assert.throws(()=>assessReviewedHot50BindingParity(base,extraMetadata,sha,
  REVIEWABLE_ADDITIVE_SECRETS,runtime),
  /RISK_STREAM_ATTESTER_BINDING_MISMATCH_RISK_STREAM_FACTS_ATTESTER/u);
});
