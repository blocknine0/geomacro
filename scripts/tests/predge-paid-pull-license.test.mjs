import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {issueGeoMacroCommercialLicense,canonicalLicensedJson,licensedSha}
 from "../../workers/control-plane/src/risk-stream-commercial-license.mjs";
import {readPredgePullLicense}
 from "../../workers/control-plane/src/predge-risk-gate-d1.mjs";
import {stagePredgePullLicense}
 from "../../workers/control-plane/src/risk-stream-commercial-issuer.mjs";

const now=Date.parse("2026-11-14T12:00:00Z"),sha=s=>createHash("sha256").update(s).digest("hex");
const spki=k=>k.export({format:"der",type:"spki"}).toString("base64");
const pkcs8=k=>k.export({format:"der",type:"pkcs8"}).toString("base64");
async function fixture(){
 const gro=generateKeyPairSync("ed25519"),license=generateKeyPairSync("ed25519"),
  release=generateKeyPairSync("ed25519");
 const source={schema:"geomacro.event-stream-gro.v1",subject:{type:"COUNTRY",id:"USA"},
  category:"GEOPOLITICS",event_fingerprint:sha("event"),
  source_originals:[sha("original-1"),sha("original-2")],
  what_happened:"A dated sanctions measure was announced",why_it_matters:"The measure may affect cross-border trade",
  market_relevance:"Derived exposure is assessed separately",what_to_watch:"Monitor enforcement and trade flows",
  evidence_and_confidence:{source_rights_and_origins:"DUAL_MACHINE_ATTESTED",raw_sources_not_republished:true},
  generated_at:new Date(now-60000).toISOString(),expires_at:new Date(now+3600000).toISOString(),
  customer_delivery_authorized:true,charged:false,execution_authorized:false,certified_risk_index:false};
 const sourceJson=JSON.stringify(source),sourceHash=sha(sourceJson);
 const record={gro_id:sha("source-gro-id"),payload_json:sourceJson,payload_sha256:sourceHash,
  signature_b64:sign(null,Buffer.from(sourceJson),gro.privateKey).toString("base64")};
 const approval={schema:"geomacro.commercial-release-accepted.v1",
  client_id:"predge-paid-risk-gate-addendum-v2",production_release_verified:true,
  independent_source_rights_verified:true,customer_entitlement_verified:true,go_live_approved:true,
  canary_hold_cleared:true,validated_gro_sha256:sourceHash,
  signed_release_receipt_sha256:sha("release-receipt"),reviewed_at:new Date(now-1000).toISOString(),
  customer_entitlement_expires_at:new Date(now+1800000).toISOString()};
 const unsigned={...approval};
 approval.signature_b64=sign(null,Buffer.from("geomacro.commercial-independent-release-review.v1\n"+
  canonicalLicensedJson(unsigned)),release.privateKey).toString("base64");
 const envelope=await issueGeoMacroCommercialLicense({record,
  groPublicSpkiB64:spki(gro.publicKey),licensePrivatePkcs8B64:pkcs8(license.privateKey),
  licensePublicSpkiB64:spki(license.publicKey),releasePublicSpkiB64:spki(release.publicKey),
  eligibleDerivedScore:{country_iso3:"USA",category:"GEOPOLITICS",value_0_100:62,
   provenance:"TWO_ORIGINALS",derived_only:true,licensed_source_text_included:false,
   independent_accuracy_certified:false},approval,now});
 const candidate={...source,customer_delivery_authorized:true,
  commercial_origin_gro_id:record.gro_id};
 const candidateJson=JSON.stringify(candidate),candidateHash=await licensedSha(candidateJson);
 const candidateRow={payload_json:candidateJson,payload_sha256:candidateHash,
  signature_b64:sign(null,Buffer.from(candidateJson),gro.privateKey).toString("base64")};
 const row={gro_id:await licensedSha("geomacro.authorized-gro.v1\n"+record.gro_id),
  country_iso3:"USA",category:"GEOPOLITICS",
  license_envelope_json:JSON.stringify(envelope),
  release_approval_json:JSON.stringify(approval),
  license_payload_sha256:envelope.license_proof.payload_sha256,
  release_receipt_sha256:approval.signed_release_receipt_sha256,
  expires_at:envelope.payload.expires_at,
  entitlement_expires_at:approval.customer_entitlement_expires_at};
 const env={GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:spki(license.publicKey),
  GEOMACRO_RELEASE_REVIEW_PUBLIC_KEY_SPKI_B64:spki(release.publicKey),
  RISK_STREAM_GRO_VERIFY_SPKI_B64:spki(gro.publicKey),DB:{prepare(sql){
   return {bind(...args){this.args=args;return this},async first(){
    if(sql.includes("FROM risk_stream_predge_pull_licenses"))return row;
    if(sql.includes("WHERE payload_sha256=?"))return {gro_id:record.gro_id,payload_sha256:sourceHash};
    if(sql.includes("WHERE gro_id=?"))return candidateRow;
    throw Error("UNEXPECTED_D1_QUERY");
   }};
  }}};
 return {env,row,approval,candidateRow};
}
const parsed={subject:{type:"country",id:"USA"},tier:"standard",category:"geopolitics"};

test("Predge pull reads and verifies a current, reviewer-bound Ed25519 Standard license from D1",async()=>{
 const {env,row}=await fixture();
 const result=await readPredgePullLicense(env,parsed,now);
 assert.equal(result.gro_id,row.gro_id);
 assert.equal(result.license_payload_sha256,row.license_payload_sha256);
 assert.equal(result.envelope.license_proof.signature_scheme,"Ed25519");
 assert.equal(result.envelope.payload.tier,"STANDARD");
 assert.equal(result.envelope.payload.execution_authorized,false);
});

test("reviewer-approved Predge license stages durably to the pull table with readback, no webhook",async()=>{
 const {env,row,approval}=await fixture();
 let saved=null,sqlSeen=[];
 env.DB={prepare(sql){sqlSeen.push(sql);return {bind(...args){this.args=args;return this},
  async run(){saved={license_id:this.args[0],license_envelope_json:this.args[5],
   release_approval_json:this.args[6],license_payload_sha256:this.args[7],
   release_receipt_sha256:this.args[8],entitlement_expires_at:this.args[11]};
   return {success:true,meta:{changes:1}}},
  async first(){return saved}}}};
 const result=await stagePredgePullLicense(env,{groId:row.gro_id,envelope:JSON.parse(row.license_envelope_json),
  approval,now});
 assert.equal(result,"PREDGE_PULL_LICENSE_STAGED");
 assert.equal(sqlSeen.length,2);
 assert.ok(sqlSeen.every(x=>x.includes("risk_stream_predge_pull_licenses")));
 assert.equal(sqlSeen.some(x=>x.includes("risk_stream_commercial_outbox")),false);
 await assert.rejects(stagePredgePullLicense(env,{groId:row.gro_id,
  envelope:JSON.parse(row.license_envelope_json),approval:{...approval,canary_hold_cleared:false},now}),
  /PREDGE_PULL_ENTITLEMENT_OR_RELEASE_UNVERIFIED/u);
});

test("one reviewer-bound redistribution license supports all Addendum v2 product tiers",async()=>{
 const {env,row,candidateRow}=await fixture();
 assert.equal(await readPredgePullLicense(env,{...parsed,category:"macro"},now),null);
 for(const tier of ["basic_focused","standard","complex_full"]){
  const result=await readPredgePullLicense(env,{...parsed,tier},now);
  assert.equal(result.gro_id,row.gro_id);
  assert.equal(result.envelope.payload.tier,"STANDARD");
 }
 const original=row.license_payload_sha256;
 row.license_payload_sha256="f".repeat(64);
 assert.equal(await readPredgePullLicense(env,parsed,now),null);
 row.license_payload_sha256=original;
 const originalSignature=candidateRow.signature_b64;
 candidateRow.signature_b64="AA==";
 assert.equal(await readPredgePullLicense(env,parsed,now),null);
 candidateRow.signature_b64=originalSignature;
 row.expires_at=new Date(now-1).toISOString();
 assert.equal(await readPredgePullLicense(env,parsed,now),null);
});
