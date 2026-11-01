import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign as signBytes,verify as verifyBytes} from "node:crypto";
import {
 buildUnsignedPilotCheck,canonicalJson,toBytes,signablePilotCheck,sha256,
 validatePilotEnvelopeShape,verifySignedPilotCheck,MAX_WIRE_BYTES
} from "../../workers/control-plane/src/predge-pilot-news-context-v2.mjs";
import {predgePilotCheckV2,publishPredgePilotCheckV2}
 from "../../workers/control-plane/src/predge-pilot-check-v2.mjs";
const NOW=Date.parse("2026-11-01T10:00:00.000Z");
const TOKEN="a".repeat(64),ADMIN="c".repeat(64);
const cats=["geopolitics","macro","rare_earth"];
function item(i,category=cats[i%3]){
 return {id:"news-"+String(i).padStart(4,"0"),category,
   original_published_at:new Date(NOW-60*60*1000-i*1000).toISOString(),
   headline:"Genuine official research reference "+i,
   sources_credited:[],attribution_notices:[],
   chargeable:false,payable:false,signed_product_verified:false,
   raw_upstream_delivered:false,commercial_derived_rights_verified:false};
}
function feed(rows){
 return {ok:true,schema:"geomacro.derived-news-structural-feed.v1",
  projection:"attributed_research",retention_hours:72,
  generated_at:new Date(NOW-1000).toISOString(),
  raw_upstream_delivered:false,chargeable:false,signed:false,
  commercial_rights_verified:false,
  partner_resale_or_commercial_redistribution_authorized:false,
  counts:Object.fromEntries(cats.map(c=>[c,rows.filter(x=>x.category===c).length])),
  items:rows};
}
function fakeSigned(){
 const env=buildUnsignedPilotCheck(feed([item(1)]),NOW);
 const {privateKey,publicKey}=generateKeyPairSync("ed25519");
 const bytes=toBytes(signablePilotCheck(env));
 env.integrity.payload_hash=createHash("sha256").update(bytes).digest("hex");
 env.integrity.signature=signBytes(null,Buffer.from(bytes),privateKey).toString("base64");
 assert.equal(verifyBytes(null,Buffer.from(bytes),publicKey,
  Buffer.from(env.integrity.signature,"base64")),true);
 return env;
}
test("selects only 50 per category and reports exactly all omitted counts",()=>{
 const rows=Array.from({length:177},(_,i)=>item(i));
 const envelope=buildUnsignedPilotCheck(feed(rows),NOW);
 assert.equal(envelope.risk_gate.decision,"PAUSE");
 assert.equal(envelope.execution_authorized,false);
 assert.deepEqual(envelope.risk_gate.news_context.available_counts,
  {geopolitics:59,macro:59,rare_earth:59});
 assert.deepEqual(envelope.risk_gate.news_context.delivered_counts,
  {geopolitics:50,macro:50,rare_earth:50});
 assert.deepEqual(envelope.risk_gate.news_context.truncated_counts,
  {geopolitics:9,macro:9,rare_earth:9});
 assert.equal(validatePilotEnvelopeShape(envelope,NOW,false),true);
 assert.ok(JSON.stringify(envelope).length<MAX_WIRE_BYTES);
});
test("deterministic selection preserves mandatory research attribution",()=>{
 const credited={...item(5),attribution_required:true,sources_credited:["Official Statistics"],
   attribution_notices:["Adapted from official release; attribution required"]};
 const f=feed([credited,item(6)]);
 const out=buildUnsignedPilotCheck(f,NOW);
 const row=out.risk_gate.news_context.items_by_category.rare_earth[0];
 assert.deepEqual(row.sources_credited,credited.sources_credited);
 assert.deepEqual(row.attribution_notices,credited.attribution_notices);
 assert.equal(out.risk_gate.news_context.signed_product_verified,false);
 assert.equal(out.risk_gate.news_context.market_relevance_verified,false);
});
test("live bridge omits credit fields when no source credit is due",()=>{
 const row=item(9);delete row.sources_credited;delete row.attribution_notices;
 const out=buildUnsignedPilotCheck(feed([row]),NOW);
 const carried=out.risk_gate.news_context.items_by_category.geopolitics[0];
 assert.equal(Object.hasOwn(carried,"sources_credited"),false);
 assert.equal(Object.hasOwn(carried,"attribution_notices"),false);
});
test("rejects forged authority, duplicate news, mismatched credits, stale and future rows",()=>{
 const original=item(0);
 for(const rows of [[original,original],
   [{...original,chargeable:true}],
   [{...original,original_published_at:new Date(NOW-73*3600_000).toISOString()}],
   [{...original,original_published_at:new Date(NOW+3600_000).toISOString()}],
   [{...original,sources_credited:["Publisher"]}]])
  assert.throws(()=>buildUnsignedPilotCheck(feed(rows),NOW),/PREDGE_PILOT_/);
});
test("caps wire bytes without misreporting delivered or truncated counts",()=>{
 const rows=Array.from({length:180},(_,i)=>({...item(i),headline:"Z".repeat(17000)}));
 const out=buildUnsignedPilotCheck(feed(rows),NOW);
 assert.ok(Buffer.byteLength(JSON.stringify(out))<MAX_WIRE_BYTES);
 const c=out.risk_gate.news_context;
 for(const category of cats){
  assert.equal(c.available_counts[category],
   c.delivered_counts[category]+c.truncated_counts[category]);
  assert.ok(c.delivered_counts[category]<=50);
 }
});
test("signed format and canonical-byte consistency reject an unpinned signer",async()=>{
 const forged=fakeSigned();
 assert.equal(validatePilotEnvelopeShape(forged,NOW,true),true);
 assert.equal(await sha256(toBytes(signablePilotCheck(forged))),
  forged.integrity.payload_hash);
 await assert.rejects(verifySignedPilotCheck(forged,{now:NOW}),/PREDGE_PILOT_INVALID_SIGNATURE/);
 const changed=structuredClone(forged);
 changed.risk_gate.news_context.items_by_category.rare_earth[0].headline="TAMPERED";
 await assert.rejects(verifySignedPilotCheck(changed,{now:NOW}),/PREDGE_PILOT_HASH_MISMATCH/);
 await assert.rejects(verifySignedPilotCheck(forged,{now:NOW,
  registry:{"geomacro-risk-2026-03":{status:"retired",public_key_spki_b64:"malicious"}}}),
  /PREDGE_PILOT_TRUST_REGISTRY/);
});
test("expired and fake CONTINUE envelopes always reject",()=>{
 const body=buildUnsignedPilotCheck(feed([item(0)]),NOW);
 assert.throws(()=>validatePilotEnvelopeShape(body,NOW+3600_001,false),/PREDGE_PILOT_ENVELOPE_EXPIRED/);
 body.risk_gate.decision="CONTINUE";
 assert.throws(()=>validatePilotEnvelopeShape(body,NOW,false),/PREDGE_PILOT_RISK_GATE_BOUNDARY/);
});
test("missing/wrong partner authorization never reads D1 or consumes quota",async()=>{
 let writes=0,reads=0;
 const env={PREDGE_RESEARCH_NEWS_TOKEN:TOKEN,CONTROL_PLANE_TOKEN:ADMIN,
  DB:{batch:async()=>{writes++;return[];},prepare:()=>{reads++;throw Error("unexpected");}}};
 const url="https://control.example/v1/pilot/check";
 for(const request of [
  new Request(url),new Request(url,{headers:{authorization:"Bearer "+"f".repeat(64)}})]){
  const r=await predgePilotCheckV2(request,env,NOW);
  assert.equal(r.status,401);
 }
 assert.equal(writes,0);assert.equal(reads,0);
 const owner=new Request("https://control.example/v1/internal/predge-pilot-news-context-publish",{
  method:"PUT",headers:{authorization:"Bearer "+"f".repeat(64),"content-type":"application/json"},body:"{}"});
 assert.equal((await publishPredgePilotCheckV2(owner,env,NOW)).status,401);
 assert.equal(reads,0);
});
test("owner refuses forged signed envelope before any DB write",async()=>{
 let writes=0;
 const env={CONTROL_PLANE_TOKEN:ADMIN,
  RISK_GATE_VERIFY_KEYS_JSON:JSON.stringify({"geomacro-risk-2026-03":{
   status:"active",public_key_spki_b64:"MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k="}}),
  DB:{prepare(){writes++;throw Error("never should write");}}};
 const put=new Request("https://control.example/v1/internal/predge-pilot-news-context-publish",{
  method:"PUT",headers:{authorization:"Bearer "+ADMIN,"content-type":"application/json"},
  body:JSON.stringify(fakeSigned())});
 const r=await publishPredgePilotCheckV2(put,env,NOW);
 assert.equal(r.status,422);
 assert.equal(writes,0);
});
test("routing keeps preexisting research and Risk Gate handlers unchanged",async()=>{
 const fs=await import("node:fs");
 const source=fs.readFileSync("workers/control-plane/src/index.mjs","utf8");
 assert.ok(source.includes('if(url.pathname==="/v1/pilot/check")return predgePilotCheckV2(request,env);'));
 assert.ok(source.includes("return predgeResearchDerivedNewsFeed(request,env);"));
 assert.ok(source.includes("return predgeRiskGateD1(request,env);"));
});
