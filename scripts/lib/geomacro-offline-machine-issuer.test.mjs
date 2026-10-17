import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {sameEventClaimHash} from "./independent-same-event-qualification.mjs";
import {issueOfflineMachineAuthority,assembleOfflineMachineCommercialRequest,
 canonicalMachineProofBytes} from "./geomacro-offline-machine-issuer.mjs";

const sha=x=>createHash("sha256").update(x).digest("hex");
const now=new Date("2026-10-17T11:00:00.000Z");
const keys=[generateKeyPairSync("ed25519"),generateKeyPairSync("ed25519"),
 generateKeyPairSync("ed25519")];
const pem=(k)=>k.publicKey.export({type:"spki",format:"pem"}).toString();
const pin=(k)=>sha(k.publicKey.export({type:"spki",format:"der"}));
const spki=k=>k.publicKey.export({type:"spki",format:"der"}).toString("base64");
const privatePem=k=>k.privateKey.export({type:"pkcs8",format:"pem"}).toString();
const eventIdentity={country_iso3:"USA",event_type:"central_bank_policy",
 actor_id:"federal_reserve",target_id:"us_rates",location_id:"washington_dc",
 occurred_at:"2026-10-17T09:55:00Z"};
const claim=sameEventClaimHash("macro",eventIdentity);
const html=date=>'<!DOCTYPE html><html><head><meta property="article:published_time" content="'+
 date+'"></head><body>Independent synthetic issuer for unit test only.</body></html>';
const pages=[html("2026-10-17T10:05:00Z"),html("2026-10-17T10:10:00Z")];
const candidates=[
 {org:"federal_reserve",source:"fed_monetary_original_press_rss_review",
  url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261017a.htm",
  native:"2026-10-17T10:05:00.000Z"},
 {org:"ecb",source:"ecb",
  url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261017.en.html",
  native:"2026-10-17T10:10:00.000Z"},
].map((x,i)=>({
 category:"macro",event:eventIdentity,same_event_claim_sha256:claim,
 original_article_url:x.url,publisher_host:new URL(x.url).hostname,
 publisher_organization_id:x.org,originating_reporting_organization_id:x.org,
 source_registry_id:x.source,private_only:true,native_published_at_verified:true,
 original_article_content_verified:true,original_publisher_url_verified:true,
 independently_authored_reporting_verified:true,syndicated_from:null,
 commercial_eligible:false,reporting_position:"confirms",
 original_article_sha256:sha(pages[i]),original_published_at:x.native,
}));
const docs=candidates.map((c,i)=>({
 source_registry_id:c.source_registry_id,
 bytes:Buffer.from("SYNTHETIC EXPLICIT PERMISSION RECORD NOT ACTUAL LEGAL RIGHTS "+i+
 " unit test fixture; no attribution, derived only."),
}));
const event={id:"synthetic-test-event-not-news",domain:"macro",
  event_type:"central_bank_policy",primary_country:"USA",
  material_evidence_at:eventIdentity.occurred_at};
const reviewDocumentBytes=Buffer.from("Reviewed synthetically for an issuer unit test; NOT a real legal permission or source.");
const proof={
 schema:"geomacro.automated-commercial-proof.v1",
 profile:"GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1",
 country_iso3:"USA",category:"macro",event_id:event.id,
 exact_evidence_sha256:sha(canonicalMachineProofBytes([event])),
 same_event_claim_sha256:claim,
 exact_original_evidence_set_sha256:sha(JSON.stringify(candidates.map(c=>({
  article_bytes_sha256:c.original_article_sha256,
  original_published_at:c.original_published_at,
  same_event_claim_sha256:c.same_event_claim_sha256,
 })).sort((a,b)=>String(a.article_bytes_sha256).localeCompare(String(b.article_bytes_sha256))))),
 attested_at:"2026-10-17T10:40:00Z",expires_at:"2026-10-17T11:25:00Z",
 semantic_same_event_verified:true,independent_original_issuers_verified:true,
 counterevidence_checked:true,unresolved_material_contradictions:0,retractions_detected:0,
 source_permissions:candidates.map((c,i)=>({
  source_registry_id:c.source_registry_id,
  originating_reporting_organization_id:c.originating_reporting_organization_id,
  original_article_sha256:c.original_article_sha256,
  licensed_article_scope_sha256:sha("synthetic article scope "+i),
  permission_record_sha256:sha(docs[i].bytes),
  licensed_derived_use:true,raw_redistribution_allowed:false,
  attribution_required:false,permission_verified_at:"2026-10-17T10:30:00Z",
  permission_expires_at:"2026-10-18T10:30:00Z",
 })),
};
function review(role,p=proof){
 const common={schema:"geomacro.offline-issuer-review.v1",role,decision:"APPROVED",
  proof_sha256:sha(canonicalMachineProofBytes(p)),
  original_evidence_set_sha256:p.exact_original_evidence_set_sha256,
  original_pages_reviewed:true,same_event_independence_reviewed:true,
  retraction_and_contradiction_reviewed:true,
  reviewed_at:"2026-10-17T10:50:00Z",
  review_document_sha256:sha(reviewDocumentBytes)};
 return role==="rights"?{...common,article_scope_and_no_attribution_approved:true,
  third_party_material_excluded:true,
  license_basis:candidates.map(c=>({
   source_registry_id:c.source_registry_id,
   original_article_sha256:c.original_article_sha256,
   basis:"ARTICLE_SPECIFIC_WRITTEN_PERMISSION",attribution_required:false,
   licensed_article_scope_sha256:p.source_permissions.find(x=>x.source_registry_id===c.source_registry_id).licensed_article_scope_sha256,
   permission_record_sha256:p.source_permissions.find(x=>x.source_registry_id===c.source_registry_id).permission_record_sha256,
  }))}:common;
}
const fetchImpl=async url=>new Response(pages[url.includes("federalreserve")?0:1],
 {status:200,headers:{"content-type":"text/html"}});
function args(role,changes={}){
 const idx=role==="facts"?0:1,other=role==="facts"?1:0;
 return {role,proof,candidates,review:review(role),reviewDocumentBytes,
   permissionDocumentBytes:role==="rights"?docs:[],
   privateKeyPem:privatePem(keys[idx]),publicKeyPem:pem(keys[idx]),
   pinnedPublicSha256:pin(keys[idx]),otherAuthorityPublicSha256:pin(keys[other]),
   groPublicSpkiB64:spki(keys[2]),fetchImpl,now,...changes};
}
test("independent offline fact and rights issuers produce exact verifiable distinct signatures",async()=>{
 const facts=await issueOfflineMachineAuthority(args("facts"));
 const rights=await issueOfflineMachineAuthority(args("rights"));
 assert.equal(facts.original_html_and_native_clock_reread,true);
 assert.equal(rights.payment_authorized,false);
 assert.notEqual(facts.signature_b64,rights.signature_b64);
 const input=assembleOfflineMachineCommercialRequest({
   proof,candidates,event,attestations:[rights,facts],
   factsPublicPem:pem(keys[0]),rightsPublicPem:pem(keys[1]),
   factsPublicSha256:pin(keys[0]),rightsPublicSha256:pin(keys[1]),
   groPublicSpkiB64:spki(keys[2]),now,
 });
 assert.equal(input.schema,"geomacro.private-machine-commercial-request.v1");
 assert.equal(input.envelope.proof.exact_original_evidence_set_sha256,
   proof.exact_original_evidence_set_sha256);
 assert.equal(input.envelope.facts_signature_b64,facts.signature_b64);
 assert.equal(input.envelope.rights_signature_b64,rights.signature_b64);
 assert.equal(JSON.stringify(facts).includes("federalreserve.gov"),false);
 assert.equal(JSON.stringify(rights).includes("ecb.europa.eu"),false);
});
test("invalid legally scoped rights cannot be signed or passed to GRO",async()=>{
 for(const altered of [
  {permissionDocumentBytes:[{...docs[0],bytes:Buffer.from("fake rights statement long enough 123456789123456789")},docs[1]]},
  {review:{...review("rights"),third_party_material_excluded:false}},
  {review:{...review("rights"),license_basis:review("rights").license_basis.map(x=>({...x,attribution_required:true}))}},
  {proof:{...proof,source_permissions:proof.source_permissions.map(p=>({...p,attribution_required:true}))}},
  {proof:{...proof,expires_at:"2026-10-17T10:45:00Z"}},
 ]){
  await assert.rejects(issueOfflineMachineAuthority(args("rights",altered)),
   /MACHINE_OFFLINE_ISSUER_REJECTED/);
 }
});
test("attester pin, duplicate issuer, wrong data and disallowed approval fail",async()=>{
 const edited=[
  {pinnedPublicSha256:pin(keys[1])},
  {otherAuthorityPublicSha256:pin(keys[0])},
  {groPublicSpkiB64:spki(keys[0])},
  {review:{...review("facts"),decision:"PENDING"}},
  {candidates:[candidates[0],candidates[0]]},
  {candidates:[candidates[0],{...candidates[1],original_article_sha256:sha("changed bytes")}]},
 ];
 for(const x of edited)await assert.rejects(issueOfflineMachineAuthority(args("facts",x)),
   /MACHINE_OFFLINE_ISSUER_REJECTED|GEOMACRO_MACHINE_ORIGINAL_BINDING_REJECTED/);
});
test("signed envelope cannot be forged, swapped or used after expiry",async()=>{
 const facts=await issueOfflineMachineAuthority(args("facts"));
 const rights=await issueOfflineMachineAuthority(args("rights"));
 const base={proof,candidates,event,attestations:[facts,rights],
  factsPublicPem:pem(keys[0]),rightsPublicPem:pem(keys[1]),
  factsPublicSha256:pin(keys[0]),rightsPublicSha256:pin(keys[1]),
  groPublicSpkiB64:spki(keys[2]),now};
 for(const x of [
  {attestations:[facts,{...rights,signature_b64:facts.signature_b64}]},
  {attestations:[facts,{...rights,proof_sha256:sha("changed")}]},
  {event:{...event,id:"forged"}},
  {factsPublicPem:pem(keys[1])},
  {now:new Date("2026-10-17T11:26:00Z")},
 ])assert.throws(()=>assembleOfflineMachineCommercialRequest({...base,...x}),
  /MACHINE_OFFLINE_ISSUER_REJECTED/);
});
