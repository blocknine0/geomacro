import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign} from "node:crypto";
import {buildCandidate,prepareRiskStreamCandidate} from "../lib/risk-stream-candidate-builder.mjs";
import {riskStreamOriginalClaims,inspectRiskStreamCandidates} from "../../workers/control-plane/src/risk-stream-pipeline.mjs";

const now=Date.parse("2026-11-14T12:00:00.000Z");
const rightsManifest={schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries:[
 {source_id:"wire_primary",publisher_root_domain:"wire.test",parent_media_entity:"wire_parent",
  source_role:"GOVERNMENT_WIRE",categories:["GEOPOLITICS"],status:"APPROVED",
  rights_evidence:{licence_url:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",terms_url:"https://www.gov.uk/help/terms-conditions",
   reviewed_at:"2026-10-01T00:00:00.000Z",reviewer:"owner-reviewer",notes:"Reviewed legal terms for derived use."},
  rights_expire_at:"2027-10-01"},
 {source_id:"regional_primary",publisher_root_domain:"regional.test",parent_media_entity:"regional_parent",
  source_role:"INDEPENDENT_REGIONAL",categories:["GEOPOLITICS"],status:"APPROVED",
  rights_evidence:{licence_url:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",terms_url:"https://www.gov.uk/help/terms-conditions",
   reviewed_at:"2026-10-01T00:00:00.000Z",reviewer:"owner-reviewer",notes:"Reviewed legal terms for derived use."},
  rights_expire_at:"2027-10-01"}
]};
const sourceRegistry=rightsManifest.entries.map(entry=>({...entry,enabled:1,commercial_rights_approved:1}));
function original(overrides={}){
 return {category:"GEOPOLITICS",country_iso3:"USA",feed_origin:"RSS",
  event_identity:{country_iso3:"USA",event_type:"sanctions_policy",actor_id:"us_treasury",
   target_id:"foreign_bank",location_id:"washington_dc",occurred_at:"2026-11-14T10:00:00.000Z"},
  source_id:"wire_primary",source_url:"https://wire.test/news/item-1",
  published_at:"2026-11-14T11:30:00.000Z",raw_payload:"Verified original factual record. Open Government Licence v3 https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
  item_license_evidence:{license_id:"UK_OGL_V3",license_url:"https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
   terms_url:"https://www.gov.uk/help/terms-conditions",item_url:"https://wire.test/news/item-1",
   item_license_marker:"Open Government Licence v3",publisher_owned_content_only:true,
   third_party_exceptions:false,non_commercial:false,restricted_material:false,
   factual_record_only:true,original_text_republished:false},
  derived:{what:"Treasury announced a new measure.",why:"The target is linked to enforcement.",
   market:"Banking access may tighten.",watch:"Watch implementation details."},reporting_position:"confirms",
  ...overrides};
}
function signProof(candidate){
 const claim=riskStreamOriginalClaims(candidate);
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 return {facts_signature_b64:sign(null,Buffer.from("geomacro.machine-original-facts.v1\n"+claim),facts.privateKey).toString("base64"),
  rights_signature_b64:sign(null,Buffer.from("geomacro.machine-commercial-rights.v1\n"+claim),rights.privateKey).toString("base64")};
}

test("builds a pipeline-valid candidate and binds the original-page digest",async()=>{
 const input=original(),draft=prepareRiskStreamCandidate(input,sourceRegistry,now,{rightsManifest});
 const candidate=buildCandidate(input,sourceRegistry,now,{rightsManifest,proof:signProof(draft)});
 assert.equal(candidate.kind,"VERIFIED_ORIGINAL");
 assert.equal(candidate.original_page_sha256,
  (await import("node:crypto")).createHash("sha256").update(input.raw_payload).digest("hex"));
 assert.deepEqual(candidate.entities,[...candidate.entities].sort());
 assert.equal(candidate.rights_verification.registry_commercial_rights_approved,true);
 assert.deepEqual(await inspectRiskStreamCandidates([candidate],now),[candidate]);
});

test("pending registry source, expired rights, GDELT, stale and future clocks fail closed",()=>{
 const pending={...rightsManifest,entries:rightsManifest.entries.map(entry=>
  entry.source_id==="wire_primary"?{...entry,status:"PENDING",rights_expire_at:null,
   rights_evidence:{...entry.rights_evidence,licence_url:null,terms_url:null,reviewed_at:null,reviewer:null}}:entry)};
 assert.throws(()=>prepareRiskStreamCandidate(original(),sourceRegistry,now,{rightsManifest:pending}),
  /SOURCE_RIGHTS_NOT_APPROVED/u);
 const expired={...rightsManifest,entries:rightsManifest.entries.map(entry=>entry.source_id==="wire_primary"?
  {...entry,rights_expire_at:"2026-11-13"}:entry)};
 assert.throws(()=>prepareRiskStreamCandidate(original(),sourceRegistry,now,{rightsManifest:expired}),
  /APPROVED_RIGHTS_EXPIRED_OR_INVALID/u);
 const staleRegistry=sourceRegistry.map(row=>row.source_id==="wire_primary"?
  {...row,rights_expire_at:"2026-11-13"}:row);
 assert.throws(()=>prepareRiskStreamCandidate(original(),staleRegistry,now,{rightsManifest}),
  /SOURCE_REGISTRY_RIGHTS_EXPIRED/u);
 assert.throws(()=>prepareRiskStreamCandidate(original({feed_origin:"GDELT_INDEX"}),sourceRegistry,now,{rightsManifest}),
  /SOURCE_OR_CATEGORY_INVALID/u);
 assert.throws(()=>prepareRiskStreamCandidate(original({published_at:"2026-11-10T00:00:00.000Z"}),sourceRegistry,now,{rightsManifest}),
  /ORIGINAL_CLOCK_INVALID/u);
 assert.throws(()=>prepareRiskStreamCandidate(original({published_at:"2026-11-14T12:01:00.000Z"}),sourceRegistry,now,{rightsManifest}),
  /ORIGINAL_CLOCK_INVALID/u);
});

test("item-level license exclusions fail closed before candidate admission",()=>{
 for(const change of [
  {third_party_exceptions:true},{non_commercial:true},{restricted_material:true},
  {factual_record_only:false},{original_text_republished:true},
  {license_id:"UNKNOWN_LICENSE"},{license_url:"https://publisher.example/license"}
 ]){
  const input=original({item_license_evidence:{...original().item_license_evidence,...change}});
  assert.throws(()=>prepareRiskStreamCandidate(input,sourceRegistry,now,{rightsManifest}),
   /RISK_STREAM_ITEM_LICENSE_/u);
 }
 const missing=original();delete missing.item_license_evidence;
 assert.throws(()=>prepareRiskStreamCandidate(missing,sourceRegistry,now,{rightsManifest}),
  /RISK_STREAM_ITEM_LICENSE_EVIDENCE_SCHEMA_INVALID/u);
 const restricted=original({raw_payload:original().raw_payload+" All rights reserved."});
 assert.throws(()=>prepareRiskStreamCandidate(restricted,sourceRegistry,now,{rightsManifest}),
  /ITEM_TEXT_SIGNALS_RESTRICTION/u);
 const headline="Treasury announced sanctions against several foreign banks";
 const copied=original({raw_payload:original().raw_payload+" "+headline,
  derived:{...original().derived,what:headline}});
 assert.throws(()=>prepareRiskStreamCandidate(copied,sourceRegistry,now,{rightsManifest}),
  /SOURCE_TEXT_REUSE_DETECTED/u);
});
