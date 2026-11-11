import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,sign,createHash} from "node:crypto";
import {verifyGeoMacroSevenDayHistory}
 from "../../workers/control-plane/src/risk-stream-seven-day-chain.mjs";
import {canonicalLicensedJson} from "../../workers/control-plane/src/risk-stream-commercial-license.mjs";
const now=Date.parse("2026-11-12T01:00:00Z"),digest=s=>createHash("sha256").update(s).digest("hex");
const key=generateKeyPairSync("ed25519");
const spki=key.publicKey.export({type:"spki",format:"der"}).toString("base64");
const zero="0".repeat(64),iso=n=>new Date(n).toISOString();
function seeded(days=7){
 const storage=new Map(),rows=[];let prev=zero;
 for(let i=6;i>=7-days;i--){
  const t=now-i*86400000-1800000,day=iso(t).slice(0,10);
  const payload={schema:"geomacro.commercial-risk-history-entry.v1",
   country_iso3:"USA",category:"GEOPOLITICS",day_utc:day,observed_at:iso(t),
   previous_entry_sha256:prev,
   licensed_payload_sha256:digest("fixture-licensed-"+i),
   score_0_100:60+i,
   geo_licensed_source_gro_sha256:digest("gro-source-"+i),
   original_publisher_text_stored:false,execution_authorized:false};
  const canonical=canonicalLicensedJson(payload),h=digest(canonical);
  const signature=sign(null,Buffer.from(
   "geomacro.commercial-derived-risk-history.v1\n"+canonical),key.privateKey).toString("base64");
  const url="risk-stream/commercial-seven-day/v1/USA/GEOPOLITICS/"+day+"/"+h+".json";
  storage.set(url,canonicalLicensedJson({schema:"geomacro.commercial-risk-history-r2.v1",
   entry_sha256:h,payload,signature_b64:signature}));
  rows.push({entry_sha256:h,country_iso3:"USA",category:"GEOPOLITICS",
   day_utc:day,observed_at:iso(t),previous_entry_sha256:prev,
   licensed_payload_sha256:payload.licensed_payload_sha256,
   score_0_100:payload.score_0_100,payload_json:canonical,
   signature_b64:signature,private_r2_object_key:url});
  prev=h;
 }
 const env={RISK_STREAM_ACTIVE:"1",STREAM_INGESTION_ENABLED:"true",
  GEOMACRO_COMMERCIAL_STREAM_RELEASE:"1",RISK_STREAM_CANARY_HOLD_CLEARED:"1",
  RISK_STREAM_SEVEN_DAY_ARCHIVE_APPROVED:"1",
  GEOMACRO_LICENSE_ED25519_PUBLIC_KEY_SPKI_B64:spki,
  RISK_STREAM_GRO_VERIFY_SPKI_B64:spki,
  DB:{prepare(sql){return {bind(...args){this.args=args;return this},
   async all(){return {results:rows}}}}},
  RISK_STREAM_PRIVATE_R2:{
   async get(k){if(!storage.has(k))return null;return {async text(){return storage.get(k)}}},
   async put(){throw Error("READ_ONLY_TEST")}}
 };
 return {env,storage,rows};
}
test("seven genuine chronological signed calendar-day entries with R2 readback verify",async()=>{
 const {env}=seeded();
 const r=await verifyGeoMacroSevenDayHistory(env,{country_iso3:"USA",
  category:"GEOPOLITICS",now});
 assert.equal(r.status,"PROVIDER_BACKED_SEVEN_DAY_SIGNED_CHAIN_PASS");
 assert.equal(r.verified_days,7);
 assert.equal(r.history.length,7);
 assert.equal(r.customer_delivery_authorized_by_history_alone,false);
});
test("six days cannot become Complex history, and missing R2 object holds",async()=>{
 const {env}=seeded(6);
 const r=await verifyGeoMacroSevenDayHistory(env,{country_iso3:"USA",category:"GEOPOLITICS",now});
 assert.equal(r.status,"HOLD_SEVEN_REAL_UTC_DAYS_NOT_PRESENT");
 assert.equal(r.verified_days,6);
 const z=seeded();z.storage.clear();
 await assert.rejects(verifyGeoMacroSevenDayHistory(z.env,{
  country_iso3:"USA",category:"GEOPOLITICS",now}),/HISTORY_R2_MISSING/);
});
test("tampered chain link fails even with a valid signature on each entry",async()=>{
 const z=seeded();z.rows[2].previous_entry_sha256=zero;
 await assert.rejects(verifyGeoMacroSevenDayHistory(z.env,{
  country_iso3:"USA",category:"GEOPOLITICS",now}),
  /HISTORY_LINK_BREAK_OR_INTERLEAVED_ENTRY|D1_CHAIN_SIGNATURE_INVALID/);
});
test("no protected release means history cannot be served",async()=>{
 const {env}=seeded();
 env.RISK_STREAM_CANARY_HOLD_CLEARED="0";
 const r=await verifyGeoMacroSevenDayHistory(env,{country_iso3:"USA",category:"GEOPOLITICS",now});
 assert.equal(r.status,"HOLD_HISTORY_BINDINGS_UNAVAILABLE");
});
