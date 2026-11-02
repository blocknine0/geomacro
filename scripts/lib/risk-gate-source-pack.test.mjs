import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RG_VARIANTS,RG_PRICE_CATALOG,buildRiskGateSourcePack,validateRiskGateSourceRefs}
 from "../../lib/risk-gate-source-pack.mjs";
import {putPrivateRiskGateSourcePack,readPrivateRiskGateSourcePack,materializeCanonicalRiskGateSourcePack}
 from "../../workers/control-plane/src/corridor-risk-gate-source-pack.mjs";
import {riskGatePackFromPrivateSourceReceipts,publishRiskGateSourcePacks,publishCanonicalRiskGateSourcePacks}
 from "../ops/publish-private-risk-gate-source-packs.mjs";
const clock="2026-11-02T12:06:00.000Z",now=Date.parse(clock);
const nativeAt="2026-11-02T11:40:00.000Z",cryptoAt="2026-11-02T11:55:00.000Z";
const receipt=()=>({channel:"CORRIDOR_ONLY",checked_at:clock,
 news_candidates:[{id:"a".repeat(64),source_id:"cointelegraph_rss",published_at:nativeAt}],
 crypto_news_candidates:[{id:"b".repeat(64),source_id:"cryptocompare_news",published_at:cryptoAt}],
 official_reference_observations:[{id:"c".repeat(64),source_id:"fred_api",observation_period:"2026-11-01"}]});
class D1{
 constructor(valid=true){
  this.good=valid;this.snapshot=null;
 }
 prepare(query){return {bind:(...args)=>({
  all:async()=>{
   if(query.includes("FROM corridor_native_news_candidates"))
    return {results:this.good?[query.includes("SELECT candidate_id")?
      {candidate_id:"a".repeat(64),source_id:"cointelegraph_rss",
       native_published_at:nativeAt}:
      {reference_id:"a".repeat(64),source_id:"cointelegraph_rss",source_period:nativeAt}]:[]};
   if(query.includes("FROM corridor_crypto_individual_research"))
    return {results:[query.includes("SELECT article_id")?
      {article_id:"b".repeat(64),published_at:cryptoAt}:
      {reference_id:"b".repeat(64),source_id:"cryptocompare_news",source_period:cryptoAt}]};
   if(query.includes("FROM corridor_official_reference_context"))
    return {results:[query.includes("SELECT reference_id,source_id,observation_period")?
      {reference_id:"c".repeat(64),source_id:"fred_api",observation_period:"2026-11-01"}:
      {reference_id:"c".repeat(64),source_id:"fred_api",source_period:"2026-11-01"}]};
   if(query.includes("FROM corridor_risk_gate_source_packs"))
    return {results:this.snapshot?[this.snapshot]:[]};
   throw Error("unexpected SELECT");
  },
  first:async()=>this.snapshot,
  run:async()=>{
   if(query.startsWith("INSERT INTO corridor_risk_gate_source_packs")){
    this.snapshot={snapshot_id:args[0],checked_at:args[1],
     content_sha256:args[2],source_ref_count:args[3],structured_json:args[4]};
   }
   return {success:true};
  }
 })}}
}
test("Risk Gate packs use exact existing 3 variants but never create payable decisions",()=>{
 const pack=riskGatePackFromPrivateSourceReceipts(receipt());
 assert.equal(pack.price_variants.length,3);
 assert.deepEqual(pack.price_variants.map(x=>x.price_variant),[...RG_VARIANTS]);
 assert.equal(pack.price_variants.every(x=>x.pricing_catalog_version===RG_PRICE_CATALOG),true);
 assert.equal(pack.price_variants.every(x=>x.eligible_for_quote===false&&
  x.action_decision===null&&x.execution_authorized===false&&
  x.chargeable===false),true);
 assert.equal(pack.source_refs.length,3);
 assert.equal(pack.price_variants.every(x=>x.what_happened.length>40&&
  x.evidence_and_confidence.source_independent_events_verified===0),true);
 const prices=readFileSync(new URL("../../src/lib/capability-pricing-catalog.ts",import.meta.url),"utf8");
 const block=prices.split("risk_gate_bundle:{")[1]?.split("}")[0];
 assert.ok(block);
 for(const variant of RG_VARIANTS)assert.ok(block.includes(variant+':"0.'),"founder price variant missing");
 assert.match(prices,/if\(capability==="risk_gate_bundle"\)return "COMING_SOON";/u);
});
test("GDELT export batch indices are never used as Risk Gate event evidence",()=>{
 const result=riskGatePackFromPrivateSourceReceipts({
  ...receipt(),news_candidates:[],crypto_news_candidates:[],
  official_reference_observations:[
   {id:"d".repeat(64),source_id:"gdelt_v2_15m",
    metric_id:"gdelt_export_batch_bytes",observation_period:clock},
   {id:"e".repeat(64),source_id:"fred_api",
    metric_id:"treasury_10y_yield",observation_period:"2026-11-01"}
  ]
 });
 assert.equal(result.source_refs.length,1);
 assert.equal(result.source_refs[0].source_id,"fred_api");
 assert.equal(result.verified_event_count,0);
 assert.equal(result.chargeable,false);
});
test("empty sources create safe zero-evidence preflight packs, no zero-data sale",()=>{
 const pack=riskGatePackFromPrivateSourceReceipts({...receipt(),
  news_candidates:[],crypto_news_candidates:[],official_reference_observations:[]});
 assert.equal(pack.source_refs.length,0);
 assert.equal(pack.price_variants[0].eligible_for_quote,false);
 assert.equal(pack.price_variants[2].action_decision,null);
});
test("source reference tampering, invalid times, forged verification or excessive counts fail",()=>{
 const pack=riskGatePackFromPrivateSourceReceipts(receipt());
 assert.throws(()=>validateRiskGateSourceRefs([...pack.source_refs,...pack.source_refs],now),
  /RG_SOURCE_REFS_INVALID/);
 assert.throws(()=>buildRiskGateSourcePack({checked_at:clock,refs:[{
  ...pack.source_refs[1],source_id:"malicious_crypto_source"}]}),/RG_SOURCE_REFS_INVALID/);
 assert.throws(()=>buildRiskGateSourcePack({checked_at:clock,refs:[{
  ...pack.source_refs[0],source_period:"2026-10-01T00:00:00.000Z"}]}),/RG_SOURCE_REFS_INVALID/);
});
test("Worker checks D1 upstream facts and performs exact three-variant readback",async()=>{
 const pack=riskGatePackFromPrivateSourceReceipts(receipt()),db=new D1();
 const badDb=new D1(false);
 assert.equal((await putPrivateRiskGateSourcePack({DB:badDb},pack,now)).status,409);
 assert.equal((await putPrivateRiskGateSourcePack({},pack,now)).status,503);
 const mutated=structuredClone(pack);mutated.price_variants[0].eligible_for_quote=true;
 assert.equal((await putPrivateRiskGateSourcePack({DB:db},mutated,now)).status,422);
 const good=await putPrivateRiskGateSourcePack({DB:db},pack,now);
 assert.equal(good.status,200);
 const got=await good.json();
 assert.equal(got.reference_rows_crosschecked,3);
 assert.equal(got.pricing_variant_count,3);
 assert.equal(got.chargeable,false);
 const read=await readPrivateRiskGateSourcePack({DB:db},
  new URLSearchParams("limit=3"),now);
 const readBody=await read.json();
 assert.equal(readBody.count,1);
 assert.deepEqual(readBody.records[0].price_variants.map(x=>x.variant),[...RG_VARIANTS]);
});
test("production publisher verifies authenticated D1 write AND private GET",async()=>{
 const db=new D1(),pack=riskGatePackFromPrivateSourceReceipts(receipt());
 const result=await publishRiskGateSourcePacks({pack,now:new Date(clock),
  rootToken:"a".repeat(64),
  fetchImpl:async(url,options)=>{
   assert.match(options.headers.Authorization,/^Bearer [a-f0-9]{64}$/u);
   if(options.method==="PUT")
    return putPrivateRiskGateSourcePack({DB:db},JSON.parse(options.body),now);
   return readPrivateRiskGateSourcePack({DB:db},
    new URLSearchParams("limit=3"),now);
  }});
 assert.equal(result.d1_put_readback,true);
 assert.equal(result.d1_get_readback,true);
 assert.equal(result.source_references_crosschecked,3);
 assert.equal(result.paid_quote_enabled,false);
});
test("canonical D1 source-local Risk Gate materialization verifies all three original table schemas",async()=>{
 const db=new D1();
 const result=await materializeCanonicalRiskGateSourcePack({DB:db},now);
 assert.equal(result.status,200);
 const body=await result.json();
 assert.equal(body.selection,"CANONICAL_D1_SOURCE_LOCAL");
 assert.equal(body.reference_rows_crosschecked,3);
 assert.deepEqual(body.source_classes,{native_rss:1,crypto_individual:1,
  official_reference:1});
 assert.equal(body.independent_events_verified,0);
 assert.equal(body.chargeable,false);
 assert.equal(body.new_sales_enabled,false);
});
test("production publisher uses D1-local canonical POST and separately verifies GET",async()=>{
 const db=new D1(),root="A".repeat(64);
 const result=await publishCanonicalRiskGateSourcePacks({
  rootToken:root,fetchImpl:async(url,options)=>{
   assert.match(options.headers.Authorization,/^Bearer [a-f0-9]{64}$/u);
   if(options.method==="POST")
    return materializeCanonicalRiskGateSourcePack({DB:db},now);
   return readPrivateRiskGateSourcePack({DB:db},new URLSearchParams("limit=3"),now);
  }
 });
 assert.equal(result.selection,"CANONICAL_D1_SOURCE_LOCAL");
 assert.equal(result.priced_variants_prepared,3);
 assert.equal(result.source_references_crosschecked,3);
 assert.equal(result.canonical_d1_get_readback,true);
 assert.equal(result.credits_debited,0);
});
test("live route is internal-admin-only; no PREDGE, x402 or Risk Gate engine rewrites",()=>{
 const worker=readFileSync(new URL("../../workers/control-plane/src/index.mjs",import.meta.url),"utf8");
 assert.ok(worker.indexOf("const auth = authorized(request, env)")<
  worker.indexOf('if(url.pathname==="/v1/internal/corridor-risk-gate-source-pack")'));
 const workflow=readFileSync(new URL("../..//.github/workflows/direct-global-corridor-intake.yml",import.meta.url),"utf8");
 assert.ok(workflow.includes("publish-private-risk-gate-source-packs.mjs"));
 assert.ok(workflow.includes("risk-gate-source-d1-readback.json"));
});
