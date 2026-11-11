import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash,sign} from "node:crypto";
import {readFileSync} from "node:fs";
import {validateRealOriginalManifest}
 from "../lib/risk-stream-original-manifest.mjs";
import {riskStreamOriginalClaims}
 from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
const roles={GEOPOLITICS:["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"],
 MACRO_FX:["OFFICIAL_STATISTICS","MARKET_PRICE"],
 CRITICAL_MINERALS:["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]};
const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
const toB64=k=>k.export({format:"der",type:"spki"}).toString("base64");
const keys={factsPublicB64:toB64(facts.publicKey),rightsPublicB64:toB64(rights.publicKey)};
function fixture(){
 const now=new Date(),time=new Date(now.getTime()-30*60000).toISOString();
 const categories=["GEOPOLITICS","GEOPOLITICS","GEOPOLITICS","GEOPOLITICS",
  "MACRO_FX","MACRO_FX","MACRO_FX",
  "CRITICAL_MINERALS","CRITICAL_MINERALS","CRITICAL_MINERALS"];
 return categories.flatMap((category,i)=>[0,1].map(j=>{
  const source_id="local_test_issuer_"+i+"_"+j;
  const raw_payload="UNIT_TEST_ONLY_NOT_A_GENUINE_ORIGINAL_PUBLICATION_"+i+"_"+j;
  const event={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",
   country_iso3:"USA",category,feed_origin:"OFFICIAL_API",
   event_key:"OFFLINE_TEST_EVENT_"+i,
   event_fingerprint:createHash("sha256").update("OFFLINE_TEST_"+i).digest("hex"),
   entities:["COUNTRY:USA","EVENT:OFFLINE"+i],
   source_id,source_url:"https://publisher"+i+j+".research.net/report",
   publisher_root_domain:"publisher"+i+j+".research.net",
   parent_media_entity:"offline_parent_"+i+"_"+j,
   source_role:roles[category][j],published_at:time,
   original_page_sha256:createHash("sha256").update(raw_payload).digest("hex"),
   derived:{what:"Unit test original data only",why:"Offline unit test confidence is limited",
    market:"No actual market event is claimed here",
    watch:"Require external independent verification"},
   raw_payload,proof:{},
   rights_verification:{registry_source_id:source_id,
    registry_enabled:true,registry_commercial_rights_approved:true,
    authorization_reference:"UNIT_TEST_UNVERIFIED_OPERATOR_ONLY",
    independent_reviewer_id:"test_operator_not_independent",
    checked_at_utc:time,rights_expires_at_utc:null}};
  const claim=riskStreamOriginalClaims(event);
  event.proof.facts_signature_b64=sign(null,Buffer.from(
   "geomacro.machine-original-facts.v1\n"+claim),facts.privateKey).toString("base64");
  event.proof.rights_signature_b64=sign(null,Buffer.from(
   "geomacro.machine-commercial-rights.v1\n"+claim),rights.privateKey).toString("base64");
  return event;
 }));
}
test("local 20 signed records form exactly ten role-correct independently named pairs",()=>{
 const receipt=validateRealOriginalManifest(fixture(),keys);
 assert.equal(receipt.independent_pairs,10);
 assert.equal(receipt.local_cryptographic_signatures_verified,20);
 assert.equal(receipt.actual_production_rights_registry_verified,false);
});
test("a missing genuine source, changed original bytes or claimed rights cannot be admitted",()=>{
 let items=fixture();
 assert.throws(()=>validateRealOriginalManifest(items.slice(1),keys),/EXACTLY_TWENTY/);
 items=fixture();items[0].raw_payload+="tamper";
 assert.throws(()=>validateRealOriginalManifest(items,keys),/SHADOW_ORIGINAL_BYTES_HASH_MISMATCH/);
 items=fixture();items[0].rights_verification.registry_commercial_rights_approved=false;
 assert.throws(()=>validateRealOriginalManifest(items,keys),/RIGHTS_OPERATOR_REVIEW_METADATA/);
 items=fixture();items[1].parent_media_entity=items[0].parent_media_entity;
 assert.throws(()=>validateRealOriginalManifest(items,keys),
  /SHADOW_ATTESTATION_INVALID|INDEPENDENT_SAME_EVENT/);
});
test("checked-in twenty-line specimen is deliberately INVALID as a real original",()=>{
 const text=readFileSync(new URL("../../docs/examples/risk-stream-real-originals.UNVERIFIED.template.jsonl",import.meta.url),"utf8");
 const lines=text.trim().split("\n").map(JSON.parse);
 assert.equal(lines.length,20);
 assert.ok(lines.every(x=>x.source_url.endsWith(".invalid/replace-with-real-original")));
 assert.throws(()=>validateRealOriginalManifest(lines,keys));
});
