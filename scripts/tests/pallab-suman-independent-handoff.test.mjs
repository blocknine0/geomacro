import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash,sign} from "node:crypto";
import {signOwnerReviewedCandidate} from "../ops/sign-pallab-owner-gri-candidate.mjs";
import {signSumanIndependentReview} from "../ops/sign-suman-independent-reviewed-gri.mjs";
import {validatePallabSumanPrivateHandoff}
 from "./pallab-suman-reviewed-handoff.mjs";
const now=new Date("2026-10-22T12:00:00Z");
const sha=x=>createHash("sha256").update(x).digest("hex");
const maker=()=>{
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const der=publicKey.export({format:"der",type:"spki"});
 return {privateKey,pem:publicKey.export({format:"pem",type:"spki"}).toString(),pin:sha(der)};
};
const seeds=()=>[maker(),maker(),maker(),maker(),maker()];
const inputs=keys=>{
 const [pallab,suman,facts,rights,gro]=keys;
 const evidence={schema:"geomacro.gri-v12-reviewed-current-input.v1",
  private_only:false,publication_review_authorized:true,
  customerRows:[{id:"A"},{id:"B"},{id:"C"}],
  events:[{id:"A"},{id:"B"},{id:"C"}]};
 const certs=["geopolitics","macro","rare_earth"].map((category,i)=>({
  schema:"geomacro.current-country-category-certification.v1",
  certification_state:"CERTIFIED",country_iso3:["IND","USA","CHL"][i],
  category,source_ids:["first_source","second_source"]
 }));
 const reviewed=signSumanIndependentReview({
  privateKey:suman.privateKey,reviewerPublicKeyPem:suman.pem,
  reviewerApprovedSpkiSha256:suman.pin,unsignedGri:evidence,
  unsignedCountryCertificates:certs});
 const griBytes=Buffer.from(JSON.stringify(reviewed.reviewedGri));
 const certBytes=Buffer.from(JSON.stringify(reviewed.countryCertificates));
 const approval=signOwnerReviewedCandidate({
  privateKey:pallab.privateKey,publicKeyPem:pallab.pem,
  publicKeySpkiSha256:pallab.pin,candidateSha256:sha(griBytes),
  evidenceSha256:sha(certBytes),nonceHex:"0".repeat(32),now});
 return {approval:Buffer.from(JSON.stringify(approval)),
  griBytes,certBytes,pallab,suman,facts,rights,gro};
};
const attempt=(x,override={})=>validatePallabSumanPrivateHandoff({
 ownerApprovalBytes:x.approval,
 reviewedGriBytes:x.griBytes,
 countryCertificateBytes:x.certBytes,
 ownerPublicKeyPem:x.pallab.pem,
 ownerPublicKeySpkiSha256:x.pallab.pin,
 reviewerPublicKeyPem:x.suman.pem,
 reviewerPublicKeySpkiSha256:x.suman.pin,
 groSignerPublicSpkiSha256:x.gro.pin,
 otherAuthoritySpkiSha256:[x.facts.pin,x.rights.pin],
 historicalB2Bytes:Buffer.from("not-real-gzip-historical-proof-aaaaaaaaaa"),
 intelligence:{rows:[],eventPackages:[]},now,
 ...override
});
test("Pallab exact owner authorization and Suman signed GRI envelopes are distinct",()=>{
 const x=inputs(seeds());
 assert.notEqual(x.pallab.pin,x.suman.pin);
 assert.equal(x.certBytes.includes(Buffer.from("review_signature_base64")),true);
 // Even with both mathematically correct simulated signatures, absent true
 // originals and B2 baseline MUST fail canonical independent-review gate.
 assert.throws(()=>attempt(x),/THREE_DOMAIN_REVIEW_HANDOFF_/);
});
test("unapproved owner/reviewer, swapped package, and reused authority fail before any signed GRI",()=>{
 const x=inputs(seeds()),other=maker();
 assert.throws(()=>attempt(x,{ownerPublicKeyPem:other.pem,
   ownerPublicKeySpkiSha256:other.pin}),/HUMAN_SIGNATURE_INVALID/);
 assert.throws(()=>attempt(x,{reviewerPublicKeyPem:other.pem,
   reviewerPublicKeySpkiSha256:other.pin}),/THREE_DOMAIN_REVIEW_HANDOFF_/);
 assert.throws(()=>attempt(x,{reviewerPublicKeyPem:x.pallab.pem,
   reviewerPublicKeySpkiSha256:x.pallab.pin}),/AUTHORITIES_NOT_INDEPENDENT/);
 assert.throws(()=>attempt(x,{groSignerPublicSpkiSha256:x.suman.pin}),
   /AUTHORITIES_NOT_INDEPENDENT/);
 assert.throws(()=>attempt(x,{otherAuthoritySpkiSha256:[x.pallab.pin]}),
   /AUTHORITIES_NOT_INDEPENDENT/);
 assert.throws(()=>attempt(x,{otherAuthoritySpkiSha256:[]}),
   /AUTHORITIES_NOT_INDEPENDENT/);
 assert.throws(()=>attempt(x,{otherAuthoritySpkiSha256:[x.facts.pin,x.facts.pin]}),
   /AUTHORITIES_NOT_INDEPENDENT/);
 assert.throws(()=>attempt(x,{countryCertificateBytes:Buffer.from("tampered-signed-certificates")}),
   /PRIVATE_SIGNED_JSON_INVALID/);
 assert.throws(()=>attempt(x,{reviewedGriBytes:Buffer.concat([x.griBytes,Buffer.from("\n")])}),
   /PUBLISHED_B2_BYTES_NOT_EXACT_OWNER_APPROVED_BYTES/);
});
test("reviewer cannot automatically sign empty or fictional input; owner approval not current GRI",()=>{
 const [pallab,suman]=seeds();
 assert.throws(()=>signSumanIndependentReview({
  privateKey:suman.privateKey,reviewerPublicKeyPem:suman.pem,
  reviewerApprovedSpkiSha256:suman.pin,unsignedGri:{},
  unsignedCountryCertificates:[]
 }),/ACTUAL_REVIEWED_INPUT_STRUCTURE_REQUIRED/);
 assert.throws(()=>signSumanIndependentReview({
  privateKey:pallab.privateKey,reviewerPublicKeyPem:suman.pem,
  reviewerApprovedSpkiSha256:suman.pin,
  unsignedGri:{schema:"geomacro.gri-v12-reviewed-current-input.v1",
  private_only:false,publication_review_authorized:true,
  customerRows:[1,2,3],events:[1,2,3]},
  unsignedCountryCertificates:[]
 }),/APPROVED_SUMAN_SIGNER_KEY_NOT_MATCHED/);
});
test("fail closed on stale owner signature, future clock and missing B2 history",()=>{
 const x=inputs(seeds());
 assert.throws(()=>attempt(x,{now:new Date(now.getTime()+91*60_000)}),
   /OWNER_HUMAN_APPROVAL_HUMAN_APPROVAL_STALE_OR_FUTURE/);
 assert.throws(()=>attempt(x,{now:new Date("invalid")}),/INVALID_CLOCK/);
 assert.throws(()=>attempt(x,{historicalB2Bytes:null}),
   /THREE_DOMAIN_REVIEW_HANDOFF_/);
});
