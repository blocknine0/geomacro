import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {gzipSync} from "node:zlib";
import {auditAll} from "./audit-b2-d1-current-hot-readonly.mjs";

const sha=v=>createHash("sha256").update(v).digest("hex");
const NOW=Date.parse("2026-10-13T08:00:00Z");
const SOURCE=new Date(NOW-20*60000).toISOString();
const GENERATE=new Date(NOW-10*60000).toISOString();
const cases=[
  ["intelligence","public-intelligence","geomacro.public-intelligence-live.v1","geomacro.public-intelligence-live-proof.v1"],
  ["global-risk","global-risk","geomacro.public-global-risk-live.v1","geomacro.public-global-risk-live-proof.v1"],
  ["risk-indices","risk-indices-independent","geomacro.public-risk-indices-live.v1","geomacro.public-risk-indices-live-proof.v1"],
];
const objects=new Map(),hot=new Map();
for(const [name,folder,schema,proofSchema] of cases){
  const key="geomacro-evidence/v1/live/"+folder+"/latest.json.gz";
  const proofKey="geomacro-evidence/v1/live/"+folder+"/latest-proof.json";
  const risk={snapshotAsOf:SOURCE,verificationStatus:"verified",
    methodologyVersion:"gri-v1.2.0",auditPersisted:true,
    proofHash:"e".repeat(64),parentMethodologyVersion:"gri-v1.2.0",
    indices:[{status:"available"},{status:"available"},{status:"available"}]};
  const value={schema,generated_at:GENERATE,source_project:"ldpwajisioljyjtojvfx"};
  if(name==="intelligence")value.rows=["geopolitics","macro","rare_earth"].map(
    category=>({category,published_at:SOURCE,public_status:"verified_b2",severity:50}));
  else value.data=risk;
  const raw=JSON.stringify(value),z=gzipSync(raw,{level:9});
  const proof={schema:proofSchema,live_key:key,compressed_sha256:sha(z),
    compressed_bytes:z.length,full_b2_readback_verified:true,
    exact_gzip_restore_verified:true,generated_at:GENERATE,
    commercial_multi_source_verified:true,
    current_source_id:"qualified_independent_original_publishers_v1",
    current_evidence_contract:"geomacro.qualified-original-event-claims.v1"};
  objects.set(key,z);objects.set(proofKey,Buffer.from(JSON.stringify(proof)));
  hot.set(name,{ok:true,product:name,schema,proof_schema:proofSchema,
    b2_object_key:key,b2_sha256:sha(z),payload_sha256:sha(raw),
    payload_json:raw,source_as_of:SOURCE,
    expires_at:new Date(NOW+40*60000).toISOString(),
    full_b2_readback_verified:true,exact_gzip_restore_verified:true});
}
const get=async key=>{assert.ok(objects.has(key));return objects.get(key);};
const fetchOk=async (url,opt)=>{
  assert.equal(opt.method,"GET");assert.equal(opt.redirect,"error");
  return Response.json(hot.get(url.split("/").at(-1)));
};
test("#2124 exact B2 gzip/readback and D1 bytes agree for all three families",async()=>{
  const r=await auditAll({get,fetchImpl:fetchOk,now:NOW});
  assert.equal(r.ok,true);
  assert.ok(Object.values(r.products).every(x=>x.d1_hash_and_clock_match));
  assert.equal(r.b2_puts,0);assert.equal(r.d1_writes,0);
  assert.equal(r.payments,0);assert.equal(r.commercial_acceptance,false);
  assert.equal(JSON.stringify(r).includes('"rows"'),false);
});
test("#2124 old original data never becomes current by B2 restore",async()=>{
  const r=await auditAll({get,fetchImpl:fetchOk,now:NOW+7*3600000});
  assert.equal(r.ok,false);
  assert.equal(r.products.intelligence.reason,"B2_ORIGINAL_EVIDENCE_STALE");
  assert.ok(Object.values(r.products).every(x=>x.original_current===false));
});
test("#2124 proof hash tampering prevents success",async()=>{
  const key="geomacro-evidence/v1/live/global-risk/latest-proof.json";
  const saved=objects.get(key);
  objects.set(key,Buffer.from(JSON.stringify({
    ...JSON.parse(saved.toString()),compressed_sha256:"f".repeat(64)})));
  const r=await auditAll({get,fetchImpl:fetchOk,now:NOW});
  assert.equal(r.products["global-risk"].reason,"B2_PROOF_OR_PAYLOAD_BINDING_INVALID");
  objects.set(key,saved);
});
test("#2124 no D1 hot or wrong payload hash remains red with no raw output",async()=>{
  const f=async(url,opt)=>{
    if(url.endsWith("/risk-indices"))return Response.json({raw:"NEVER_LOG"},{status:503});
    if(url.endsWith("/global-risk"))
      return Response.json({...hot.get("global-risk"),payload_sha256:"0".repeat(64)});
    return fetchOk(url,opt);
  };
  const r=await auditAll({get,fetchImpl:f,now:NOW});
  assert.equal(r.ok,false);
  assert.equal(r.products["global-risk"].reason,"D1_MISSING_OR_HASH_UNMATCHED");
  assert.equal(r.products["risk-indices"].reason,"D1_MISSING_OR_HASH_UNMATCHED");
  assert.equal(JSON.stringify(r).includes("NEVER_LOG"),false);
});
