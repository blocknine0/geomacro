import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto,createPublicKey,verify as verifySignature} from "node:crypto";
import {canonicalLicensedJson} from "../../workers/control-plane/src/risk-stream-commercial-license.mjs";
import {buildRiskStreamDualAudience,validRiskStreamDualAudience}
 from "../../workers/control-plane/src/risk-stream-dual-audience.mjs";
import {fetch as reviewerFetch} from "../../workers/geomacro-release-reviewer/src/index.mjs";

const enc=new TextEncoder();
const b64=value=>Buffer.from(value).toString("base64");
const sha=async value=>Buffer.from(await webcrypto.subtle.digest("SHA-256",
 typeof value==="string"?enc.encode(value):value)).toString("hex");
function canonical(value){
 if(value===null||typeof value!=="object")return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
}
const roles={GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]};

async function fixture(category="GEOPOLITICS",sourceCount=2,{
 internalCorroboration=null,duplicateSourceRole=false
}={}){
 const now=Date.parse("2026-11-15T10:00:00.000Z");
 const groKeys=await webcrypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
 const reviewKeys=await webcrypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
 const independentRoles=sourceCount>1&&!duplicateSourceRole;
 // Private OSINT/Telegram radar is discovery-only; Standard needs two legal originals.
 const standardReady=independentRoles;
 const eligibleTiers=["basic_focused",...(standardReady?["standard"]:[]),
  ...(independentRoles?["complex_full"]:[])];
 const audience=buildRiskStreamDualAudience({category,eventClass:"POLICY_CHANGE",
  score:37,confidence:0.7,tier:standardReady?"STANDARD":"BASIC",
  corroborationReady:standardReady});
 const score={country_iso3:"USA",category,value_0_100:37,
  provenance:"SIGNED_DERIVED_RISK_SCORE",derived_only:true,
  licensed_source_text_included:false,independent_accuracy_certified:false,
  raw_source_redacted:true,eligible_tiers:eligibleTiers,
  ...(internalCorroboration?{internal_corroboration:internalCorroboration}:{}),...audience};
 const gro={schema:"geomacro.event-stream-gro.v1",subject:{type:"COUNTRY",id:"USA"},category,
  event_fingerprint:"a".repeat(64),source_originals:["b".repeat(64),"c".repeat(64)].slice(0,sourceCount),
  what_happened:"Two independent original sources report a test event.",
  why_it_matters:"This fixture exercises release review without asserting a real event.",
  market_relevance:"No actual market exposure is asserted by this synthetic fixture.",
  what_to_watch:"Wait for independently verifiable real-world confirmation.",
  evidence_and_confidence:{source_rights_and_origins:"DUAL_MACHINE_ATTESTED",
   raw_sources_not_republished:true,raw_source_redacted:true,
   ...(internalCorroboration?{internal_corroboration:internalCorroboration}:{})},
  eligible_derived_score:score,
  generated_at:new Date(now-1000).toISOString(),expires_at:new Date(now+3600000).toISOString(),
  execution_authorized:false,charged:false,certified_risk_index:false,customer_delivery_authorized:false};
 const groJson=JSON.stringify(gro),groHash=await sha(groJson);
 const groSignature=b64(await webcrypto.subtle.sign("Ed25519",groKeys.privateKey,enc.encode(groJson)));
 const groSpki=b64(await webcrypto.subtle.exportKey("spki",groKeys.publicKey));
 const reviewPrivate=b64(await webcrypto.subtle.exportKey("pkcs8",reviewKeys.privateKey));
 const reviewPublic=b64(await webcrypto.subtle.exportKey("spki",reviewKeys.publicKey));
 const receipt="d".repeat(64),sourceGroId=await sha(JSON.stringify(gro.source_originals.slice().sort()));
 const candidate={...gro,customer_delivery_authorized:true,commercial_origin_gro_id:sourceGroId};
 const candidateJson=JSON.stringify(candidate),candidateHash=await sha(candidateJson);
 const authorizedGroId=await sha("geomacro.authorized-gro.v1\n"+sourceGroId);
 const evidenceRows=roles[category].slice(0,sourceCount).map((source_role,index)=>({
  observation_id:gro.source_originals[index],original_verified:1,
  publisher_root_domain:index?"publisher-b.example":"publisher-a.example",
  parent_media_entity:index?"publisher_b":"publisher_a",
  source_role:duplicateSourceRole&&index>0?roles[category][0]:source_role,
  enabled:1,commercial_rights_approved:1,rights_expire_at:"2027-11-14"}));
 const db={prepare(sql){return {bind(){return {first:async()=>({client_id:"predge-paid-risk-gate-addendum-v2",
   enabled:1,entitlement_expires_at:new Date(now+1800000).toISOString(),release_receipt_sha256:receipt}),
   all:async()=>({results:evidenceRows})}}}}};
 const env={DB:db,GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",RISK_STREAM_CANARY_HOLD_CLEARED:"1",
  RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:"1",PREDGE_PAID_CUSTOMER_ENTITLEMENT_VERIFIED:"1",
  PREDGE_PAID_GO_LIVE_APPROVED:"1",RISK_STREAM_COMMERCIAL_RELEASE_RECEIPT_SHA256:receipt,
  GEOMACRO_RELEASE_REVIEW_PRIVATE_PKCS8_B64:reviewPrivate,
  GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64:reviewPublic,
  RISK_STREAM_GRO_VERIFY_SPKI_B64:groSpki};
 const body={schema:"geomacro.commercial-review-request.v1",client_id:"predge-paid-risk-gate-addendum-v2",
  source_gro_id:sourceGroId,source_gro_sha256:groHash,proposed_gro_id:authorizedGroId,
  proposed_gro_sha256:candidateHash,country_iso3:"USA",category,
  original_observation_ids:gro.source_originals,source_gro_payload_json:groJson,
  source_gro_signature_b64:groSignature,eligible_derived_score:score,
  original_content_not_transmitted:true,no_funds:true};
 return {now,env,body,reviewKeys,receipt};
}
const request=body=>new Request("https://reviewer.internal/v1/commercial/review",{
 method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});


test("dual-audience mold emits deterministic institutional signals for all risk categories",()=>{
 const cases=[
  ["GEOPOLITICS","SANCTIONS_POLICY",["maritime_chokepoints","shipping_routes"]],
  ["MACRO_FX","FX_STRESS",["fx_pairs","energy_commodities"]],
  ["CRITICAL_MINERALS","MINERAL_SUPPLY_SHOCK",["critical_minerals","industrial_inputs"]]
 ];
 for(const [category,eventClass,expectedAssets] of cases){
  const product=buildRiskStreamDualAudience({category,eventClass,score:68.25,
   confidence:.82,deltaVs7d:-4.5,deltaBaselineVerified:true,horizonHours:48,
   tier:"BASIC",corroborationReady:true,
   contagionCorridors:["USA>IND"]});
  assert.equal(validRiskStreamDualAudience(product),true);
  assert.equal(product.agent_decision.gate_state,product.agent_decision.action_posture);
  assert.equal(product.agent_decision.value_0_100,68.25);
  assert.equal(product.agent_decision.delta_vs_7d,-4.5);
  assert.equal(product.agent_decision.confidence,.82);
  assert.equal(product.agent_decision.horizon,"72h");
  assert.equal(product.agent_decision.tier,"BASIC");
  assert.equal(product.agent_decision.upgrade_available,true);
  assert(expectedAssets.every(asset=>product.agent_decision.affected_assets.includes(asset)));
  assert.equal(product.raw_source_redacted,true);
  assert.equal(product.licensed_source_text_included,false);
  assert.equal(product.analyst_brief.raw_source_redacted,true);
  assert.equal(product.analyst_brief.licensed_source_text_included,false);
  assert.match(product.analyst_brief.causal_summary,
   /^Trigger: .*\. Transmission Mechanism: .* Direct Price\/Supply Impact: /u);
  assert.doesNotMatch(JSON.stringify(product),/publisher|telegram|https?:|headline/iu);
  // Prior signed audience payloads remain accepted by the validator.
  const legacy={raw_source_redacted:true,
   agent_decision:Object.fromEntries(["action_posture","risk_score_0_100","confidence_0_1",
    "horizon_hours","affected_assets","price_direction_bias","contagion_corridors","ttl_seconds"]
     .map(key=>[key,product.agent_decision[key]])),
   analyst_brief:Object.fromEntries(["risk_mechanism","downstream_effects",
    "price_impact_summary","cross_category_outlook"]
     .map(key=>[key,product.analyst_brief[key]]))};
  assert.equal(validRiskStreamDualAudience(legacy),true);
 }
});

test("redacted internal corroboration cannot upgrade one legal original above Basic",async()=>{
 const internal={raw_source_redacted:true,signal_count:1,
  families:["PRIVATE_OSINT"],max_severity_weight_0_100:61,
  max_corroboration_weight_0_1:.72,categories:["GEOPOLITICS"],corridors:[]};
 const f=await fixture("GEOPOLITICS",1,{internalCorroboration:internal});
 const response=await reviewerFetch(request(f.body),f.env,f.now);
 const result=await response.json();
 assert.equal(response.status,200);
 assert.equal(result.status,"REVIEW_APPROVED");
 assert.deepEqual(result.grants[0].approval.eligible_tiers,["basic_focused"]);
 assert.deepEqual(result.grants[0].eligible_derived_score.eligible_tiers,
  ["basic_focused"]);
 assert.equal(result.grants[0].eligible_derived_score.agent_decision.tier,"BASIC");
 assert.equal(result.grants[0].eligible_derived_score.licensed_source_text_included,false);
 assert.doesNotMatch(JSON.stringify(result),/source title|watch confirms policy|https?:|www[.]|@/iu);
});

test("a second distinct approved source_role upgrades while a duplicate role does not",async()=>{
 const distinct=await fixture("MACRO_FX",2);
 const accepted=await reviewerFetch(request(distinct.body),distinct.env,distinct.now);
 assert.deepEqual((await accepted.json()).grants[0].approval.eligible_tiers,
  ["basic_focused","standard","complex_full"]);
 const duplicate=await fixture("MACRO_FX",2,{duplicateSourceRole:true});
 const stillBasic=await reviewerFetch(request(duplicate.body),duplicate.env,duplicate.now);
 const result=await stillBasic.json();
 assert.equal(result.status,"REVIEW_APPROVED");
 assert.deepEqual(result.grants[0].approval.eligible_tiers,["basic_focused"]);
 assert.equal(result.grants[0].eligible_derived_score.agent_decision.tier,"BASIC");
 assert.equal(result.grants[0].eligible_derived_score.agent_decision.upgrade_available,false);
});

test("reviewer signs only current, D1-backed release grants across all three categories",async()=>{
 for(const category of Object.keys(roles)){
  const f=await fixture(category);
  const response=await reviewerFetch(request(f.body),f.env,f.now);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.status,"REVIEW_APPROVED");
  assert.equal(result.grants.length,1);
  const {signature_b64,...approval}=result.grants[0].approval;
  assert.equal(approval.client_id,"predge-paid-risk-gate-addendum-v2");
  assert.equal(approval.validated_gro_sha256,f.body.proposed_gro_sha256);
  assert.equal(approval.customer_entitlement_verified,true);
  const key=createPublicKey({key:Buffer.from(f.env.GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64,"base64"),format:"der",type:"spki"});
  const signature=Buffer.from(signature_b64,"base64");
  assert.equal(verifySignature(null,enc.encode("geomacro.commercial-independent-release-review.v1\n"+canonicalLicensedJson(approval)),key,signature),true);
 }
});

test("single approved original receives a Basic-only release grant",async()=>{
 const f=await fixture("GEOPOLITICS",1);
 const response=await reviewerFetch(request(f.body),f.env,f.now);
 const result=await response.json();
 assert.equal(response.status,200);
 assert.equal(result.status,"REVIEW_APPROVED");
 assert.deepEqual(result.grants[0].approval.eligible_tiers,["basic_focused"]);
});

test("reviewer remains held while protected release approval settings are off",async()=>{
 const f=await fixture();f.env.GEOMACRO_COMMERCIAL_STREAM_RELEASE="0";
 const response=await reviewerFetch(request(f.body),f.env,f.now);
 assert.equal((await response.json()).status,"HOLD_RELEASE_OR_ENTITLEMENT_UNAVAILABLE");
});

test("reviewer refuses missing score, invalid source signature, and mismatched subscription receipt",async()=>{
 const f=await fixture();
 const noScore={...f.body,eligible_derived_score:null};
 assert.equal((await (await reviewerFetch(request(noScore),f.env,f.now)).json()).status,
  "HOLD_EXPLICIT_DERIVED_SCORE_REQUIRED");
 const badSignature={...f.body,source_gro_signature_b64:b64(Buffer.alloc(64))};
 assert.equal((await reviewerFetch(request(badSignature),f.env,f.now)).status,400);
 const rows=roles.GEOPOLITICS.map((source_role,index)=>({
   observation_id:f.body.original_observation_ids[index],original_verified:1,
   publisher_root_domain:index?"publisher-b.example":"publisher-a.example",
   parent_media_entity:index?"publisher_b":"publisher_a",source_role,enabled:1,
   commercial_rights_approved:1,rights_expire_at:"2027-11-14"}));
 f.env.DB={prepare(){return {bind(){return {
  first:async()=>({enabled:1,entitlement_expires_at:new Date(f.now+1800000).toISOString(),release_receipt_sha256:"f".repeat(64)}),
  all:async()=>({results:rows})
 }}}}};
 assert.equal((await (await reviewerFetch(request(f.body),f.env,f.now)).json()).status,
  "HOLD_PREDGE_ENTITLEMENT_UNVERIFIED");
});

test("reviewer exposes only its private service route and POST method",async()=>{
 const f=await fixture();
 assert.equal((await reviewerFetch(new Request("https://reviewer.internal/",{method:"GET"}),f.env,f.now)).status,405);
 assert.equal((await reviewerFetch(new Request("https://reviewer.internal/other",{method:"POST"}),f.env,f.now)).status,404);
});
