import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync} from "node:crypto";
import {attestFacts} from "../../workers/risk-stream-facts-attester/src/index.mjs";
import {attestRights} from "../../workers/risk-stream-rights-attester/src/index.mjs";
import {checkMachineProof,inspectRiskStreamCandidates,riskStreamOriginalClaims}
 from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import {prepareRiskStreamCandidate} from "../lib/risk-stream-candidate-builder.mjs";

const now=Date.parse("2026-11-14T12:00:00.000Z");
const token="ephemeral-test-bearer-token-value-0123456789";
const manifest={schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries:[
 {source_id:"wire_primary",publisher_root_domain:"wire.test",parent_media_entity:"wire_parent",
  source_role:"GOVERNMENT_WIRE",categories:["GEOPOLITICS"],status:"APPROVED",
  rights_evidence:{licence_url:"https://wire.test/licence",terms_url:"https://wire.test/terms",
   reviewed_at:"2026-10-01T00:00:00.000Z",reviewer:"owner-reviewer",notes:"test-only reviewed fixture"},
  rights_expire_at:"2027-10-01"}
]};
const registryRow={source_id:"wire_primary",publisher_root_domain:"wire.test",
 parent_media_entity:"wire_parent",source_role:"GOVERNMENT_WIRE",enabled:1,
 commercial_rights_approved:1,rights_expire_at:"2027-10-01"};
const factsKeys=generateKeyPairSync("ed25519");
const rightsKeys=generateKeyPairSync("ed25519");
const b64=value=>Buffer.from(value).toString("base64");
const factsPrivate=b64(factsKeys.privateKey.export({format:"der",type:"pkcs8"}));
const rightsPrivate=b64(rightsKeys.privateKey.export({format:"der",type:"pkcs8"}));
const factsPublic=b64(factsKeys.publicKey.export({format:"der",type:"spki"}));
const rightsPublic=b64(rightsKeys.publicKey.export({format:"der",type:"spki"}));
const factsKeyPromise=crypto.subtle.importKey("spki",Buffer.from(factsPublic,"base64"),
 {name:"Ed25519"},false,["verify"]);
const rightsKeyPromise=crypto.subtle.importKey("spki",Buffer.from(rightsPublic,"base64"),
 {name:"Ed25519"},false,["verify"]);
function fixture(overrides={}){
 const raw="Verified original article bytes; synthetic test fixture only.";
 const normalized={category:"GEOPOLITICS",country_iso3:"USA",feed_origin:"RSS",
  event_identity:{country_iso3:"USA",event_type:"sanctions_policy",actor_id:"us_treasury",
   target_id:"foreign_bank",location_id:"washington_dc",occurred_at:"2026-11-14T10:00:00.000Z"},
  source_id:"wire_primary",source_url:"https://wire.test/news/item-1",
  published_at:"2026-11-14T11:30:00.000Z",raw_payload:raw,
  derived:{what:"Treasury announced a new measure.",why:"The target is linked to enforcement.",
   market:"Banking access may tighten.",watch:"Watch implementation details."},...overrides};
 const registry=[{...registryRow}];
 return prepareRiskStreamCandidate(normalized,registry,now,{rightsManifest:manifest});
}
function request(event,authorization=`Bearer ${token}`){
 return new Request("https://internal.invalid/v1/attest",{method:"POST",
  headers:{authorization,"content-type":"application/json"},body:JSON.stringify(event)});
}
function rightsEnv(row=registryRow){
 return {RIGHTS_ATTESTER_BEARER_TOKEN:token,RIGHTS_ATTESTER_PKCS8_B64:rightsPrivate,
  SOURCE_REGISTRY_READONLY:{prepare(sql){
   assert.match(sql,/^SELECT\s/u);
   assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP)\b/iu);
   return {bind(sourceId){assert.equal(sourceId,"wire_primary");return this},
    async first(){return row}};
  }}};
}
async function result(response){return response.json()}

test("both independent signatures use pipeline claims and pass end-to-end inspection",async()=>{
 const candidate=fixture();
 const facts=await result(await attestFacts(request(candidate),
  {FACTS_ATTESTER_BEARER_TOKEN:token,FACTS_ATTESTER_PKCS8_B64:factsPrivate},now));
 const rights=await result(await attestRights(request(candidate),rightsEnv(),now));
 assert.equal(facts.ok,true);assert.equal(rights.ok,true);
 assert.notEqual(factsPublic,rightsPublic,"facts and rights attesters must use different keys");
 candidate.proof={facts_signature_b64:facts.proof.facts_signature_b64,
  rights_signature_b64:rights.proof.rights_signature_b64};
 assert.deepEqual(await inspectRiskStreamCandidates([candidate],now),[candidate]);
 assert.equal(await checkMachineProof(candidate,{},await factsKeyPromise,await rightsKeyPromise),true);
 assert.ok(riskStreamOriginalClaims(candidate).includes(candidate.event_fingerprint));
});

test("facts attester refuses a modified payload and stale or future originals",async()=>{
 const env={FACTS_ATTESTER_BEARER_TOKEN:token,FACTS_ATTESTER_PKCS8_B64:factsPrivate};
 const altered=fixture();altered.raw_payload+=" tampered";
 const tampered=await attestFacts(request(altered),env,now);
 assert.equal(tampered.status,400);
 assert.equal((await result(tampered)).error,"ORIGINAL_PAGE_HASH_MISMATCH");
 for(const published_at of ["2026-11-10T00:00:00.000Z","2026-11-14T12:01:00.000Z"]){
  const candidate=fixture();candidate.published_at=published_at;
  candidate.original_page_sha256=createHash("sha256").update(candidate.raw_payload).digest("hex");
  const response=await attestFacts(request(candidate),env,now);
  assert.equal(response.status,400);
  assert.equal((await result(response)).error,"PUBLICATION_CLOCK_OUT_OF_WINDOW");
 }
});

test("rights attester refuses unapproved and expired registry rows",async()=>{
 const candidate=fixture();
 const unapproved=await attestRights(request(candidate),rightsEnv({...registryRow,
  commercial_rights_approved:0}),now);
 assert.equal(unapproved.status,403);
 assert.equal((await result(unapproved)).error,"SOURCE_RIGHTS_UNVERIFIED_OR_EXPIRED");
 const expired=await attestRights(request(candidate),rightsEnv({...registryRow,
  rights_expire_at:"2026-11-13"}),now);
 assert.equal(expired.status,403);
 assert.equal((await result(expired)).error,"SOURCE_RIGHTS_UNVERIFIED_OR_EXPIRED");
});

test("missing key, missing read binding, and unauthorized calls fail closed",async()=>{
 const candidate=fixture();
 assert.equal((await attestFacts(request(candidate),{FACTS_ATTESTER_BEARER_TOKEN:token},now)).status,503);
 assert.equal((await attestRights(request(candidate),{RIGHTS_ATTESTER_BEARER_TOKEN:token,
  RIGHTS_ATTESTER_PKCS8_B64:rightsPrivate},now)).status,503);
 assert.equal((await attestFacts(request(candidate,"Bearer wrong"),
  {FACTS_ATTESTER_BEARER_TOKEN:token,FACTS_ATTESTER_PKCS8_B64:factsPrivate},now)).status,401);
});
