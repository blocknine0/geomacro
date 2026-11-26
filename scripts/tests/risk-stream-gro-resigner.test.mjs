import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync,createHash} from "node:crypto";
import {resignExpiredRiskStreamGro} from "../../workers/control-plane/src/risk-stream-gro-resigner.mjs";
import {verifyHot50SignedGroReadbacks} from "../../workers/control-plane/src/risk-stream-autonomous-hot50.mjs";

const now=Date.parse("2026-11-26T12:00:00.000Z");
const sha=value=>createHash("sha256").update(value).digest("hex");
const keyPair=generateKeyPairSync("ed25519");
const b64=key=>key.export({type:"pkcs8",format:"der"}).toString("base64");
const spki=key=>key.export({type:"spki",format:"der"}).toString("base64");
const ids=["a".repeat(64),"b".repeat(64)];
function oldRow(){
 const payload={schema:"geomacro.event-stream-gro.v1",subject:{type:"COUNTRY",id:"USA"},
  category:"GEOPOLITICS",event_fingerprint:"c".repeat(64),source_originals:ids,
  eligible_derived_score:{derived_only:true,independent_accuracy_certified:false,
   raw_source_redacted:true,licensed_source_text_included:false,eligible_tiers:["basic_focused","standard"]},
  evidence_and_confidence:{corroborated_originals:2,independent_parent_entities:2,
   source_rights_and_origins:"DUAL_MACHINE_ATTESTED",raw_source_redacted:true,
   raw_sources_not_republished:true},
  generated_at:new Date(now-4*3600000).toISOString(),expires_at:new Date(now-3600000).toISOString(),
  customer_delivery_authorized:false,charged:false,execution_authorized:false,
  certified_risk_index:false};
 const json=JSON.stringify(payload);
 return {gro_id:"d".repeat(64),country_iso3:"USA",category:"GEOPOLITICS",
  event_fingerprint:payload.event_fingerprint,payload_json:json,payload_sha256:sha(json),
  signature_b64:"",created_at:payload.generated_at,expires_at:payload.expires_at};
}
class FakeDB{
 constructor(row,evidence){this.rows=new Map([[row.gro_id,row]]);this.evidence=evidence;this.outbox=new Set()}
 prepare(sql){const query={sql,args:[],bind(...args){this.args=args;return this},
  async first(){
   if(this.sql.includes("WHERE gro_id=?"))return this.rows.get(this.args[0])??null;
   if(this.sql.includes("AND event_fingerprint=? AND expires_at>?"))
    return [...this.rows.values()].find(r=>r.country_iso3===this.args[0]&&
     r.category===this.args[1]&&r.event_fingerprint===this.args[2]&&
     Date.parse(r.expires_at)>Date.parse(this.args[3]))??null;
   return null;
  },async all(){return {results:this.evidence}},};
  query.rows=this.rows;query.evidence=this.evidence;
  return query;
 }
 async batch(statements){
  for(const statement of statements){
   if(statement.sql.startsWith("INSERT OR IGNORE INTO risk_stream_signed_gro")){
    const [gro_id,country_iso3,category,event_fingerprint,payload_json,payload_sha256,
     signature_b64,created_at,expires_at]=statement.args;
    this.rows.set(gro_id,{gro_id,country_iso3,category,event_fingerprint,payload_json,
     payload_sha256,signature_b64,created_at,expires_at});
   }else if(statement.sql.startsWith("INSERT OR IGNORE INTO risk_stream_delivery_outbox")){
    this.outbox.add(statement.args[0]);
   }
  }
  return statements.map(()=>({success:true}));
 }
}
function evidenceRows({publishedAt=new Date(now-3600000).toISOString(),enabled=1,
 approved=1,rightsExpiry="2027-12-31T00:00:00.000Z"}={}){
 return ["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"].map((source_role,index)=>({
  observation_id:ids[index],country_iso3:"USA",category:"GEOPOLITICS",
  event_fingerprint:"c".repeat(64),source_id:"source_"+index,
  publisher_root_domain:index?"regional.example":"official.example",
  parent_media_entity:index?"regional_parent":"official_parent",source_role,
  original_verified:1,published_at:publishedAt,enabled,
  commercial_rights_approved:approved,rights_expire_at:rightsExpiry
 }));
}
async function fixture(options={}){
 const row=oldRow();row.signature_b64=Buffer.from(await crypto.subtle.sign(
  "Ed25519",await crypto.subtle.importKey("pkcs8",Buffer.from(b64(keyPair.privateKey),"base64"),
   {name:"Ed25519"},false,["sign"]),Buffer.from(row.payload_json))).toString("base64");
 const db=new FakeDB(row,evidenceRows(options));
 const env={DB:db,RISK_STREAM_GRO_SIGN_PKCS8_B64:b64(keyPair.privateKey),
  RISK_STREAM_GRO_VERIFY_SPKI_B64:spki(keyPair.publicKey)};
 return {row,db,env};
}

test("expired GRO re-signs to a new immutable Ed25519 row only with fresh approved evidence",async()=>{
 const {row,db,env}=await fixture();
 const result=await resignExpiredRiskStreamGro(env,row.gro_id,{now});
 assert.equal(result.status,"GRO_RESIGNED_WITH_CURRENT_EVIDENCE");
 assert.notEqual(result.gro_id,row.gro_id);
 assert.equal(Date.parse(result.payload.expires_at)-Date.parse(result.payload.generated_at),10800000);
 assert.equal(result.payload.customer_delivery_authorized,false);
 assert.equal(result.payload.charged,false);
 assert.equal(result.payload.execution_authorized,false);
 assert.equal(result.payload.eligible_derived_score.raw_source_redacted,true);
 assert.equal(result.payload.eligible_derived_score.licensed_source_text_included,false);
 const verified=await verifyHot50SignedGroReadbacks([result.row],env,now);
 assert.equal(verified.length,1,"re-signed ID and signature must pass the normal Hot50 verifier");
 assert.equal(db.rows.get(row.gro_id).payload_json,row.payload_json);
 assert.ok(db.outbox.has(result.gro_id));
});

test("expired GRO is held when evidence is outside retention and writes no new signature",async()=>{
 const {row,db,env}=await fixture({publishedAt:new Date(now-73*3600000).toISOString()});
 await assert.rejects(resignExpiredRiskStreamGro(env,row.gro_id,{now}),
  /CURRENT_INDEPENDENT_EVIDENCE_OR_RIGHTS_MISSING/u);
 assert.equal(db.rows.size,1);
 assert.equal(db.outbox.size,0);
});
test("expired GRO is held after source rights are revoked and makes no write",async()=>{
 const {row,db,env}=await fixture({approved:0});
 await assert.rejects(resignExpiredRiskStreamGro(env,row.gro_id,{now}),
  /CURRENT_INDEPENDENT_EVIDENCE_OR_RIGHTS_MISSING/u);
 assert.equal(db.rows.size,1);
 assert.equal(db.outbox.size,0);
});

test("repeat expiry-trigger returns the same current re-signing without duplicate writes",async()=>{
 const {row,db,env}=await fixture();
 const first=await resignExpiredRiskStreamGro(env,row.gro_id,{now});
 const second=await resignExpiredRiskStreamGro(env,row.gro_id,{now});
 assert.equal(second.status,"GRO_ALREADY_RESIGNED");
 assert.equal(second.gro_id,first.gro_id);
 assert.equal(db.rows.size,2);
 assert.equal(db.outbox.size,1);
});
