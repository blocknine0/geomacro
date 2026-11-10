import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectResearchSupplementalRegistry,probeResearchSupplements}
 from "../ops/probe-hot50-research-supplemental-atoms.mjs";
const registry=JSON.parse(readFileSync(new URL(
 "../../config/research-hot50-supplemental-govuk-atoms.v1.json",import.meta.url),"utf8"));
const atom='<feed xmlns="http://www.w3.org/2005/Atom">'+
 '<entry><title>Official headline</title><published>2026-11-10T17:00:00Z</published></entry></feed>';
const fetchOk=async()=>new Response(atom,{status:200,headers:{"content-type":"application/atom+xml"}});
test("four supplemental original-publisher candidates remain isolated from historical global source registry",()=>{
 const sources=inspectResearchSupplementalRegistry(registry);
 assert.equal(sources.length,4);
 assert.equal(new Set(sources.map(x=>x.feed_url)).size,4);
 assert.equal(registry.commercial_risk_gate_eligible,false);
 assert.equal(registry.license_or_transport_proven_by_registration,false);
 for(const source of sources){
  assert.equal(source.private_research_only,true);
  assert.equal(source.commercial_promotion_requires_separate_main_gates,true);
 }
});
test("only real HTTP200 Atom source may pass transport, never infer qualified GRO or rights",async()=>{
 const result=await probeResearchSupplements({doc:registry,fetchImpl:fetchOk,
  now:Date.parse("2026-11-10T17:30:00Z")});
 assert.equal(result.transport_valid,4);
 assert.equal(result.all_transport_valid,true);
 assert.equal(result.native_originals_inferred,false);
 assert.equal(result.signed_gro_verified,false);
 assert.equal(result.commercial_rights_verified,false);
 assert.equal(result.paid_delivery_authorized,false);
 assert.ok(result.results.every(x=>x.original_page_verified===false&&x.rights_verified===false));
});
for(const [title,body,status] of [
 ["HTML masquerading as Atom","<html><body>Feed blocked</body></html>",200],
 ["unverified broken XML","<feed><entry></entry>",200],
 ["oversize payload",atom.repeat(20000),200],
 ["denied publisher",atom,403],
 ]){
 test("reject "+title,async()=>{
  const result=await probeResearchSupplements({doc:registry,
   fetchImpl:async()=>new Response(body,{status}),now:Date.parse("2026-11-10T17:30:00Z")});
  assert.equal(result.transport_valid,0);
  assert.equal(result.all_transport_valid,false);
  assert.equal(result.results.length,4);
 });
}
test("do not trust forged source identities, non-government HTTP or commercial privilege",()=>{
 for(const mutate of [
  d=>d.sources[0].feed_url="https://untrusted.example.com/feed",
  d=>d.sources[0].private_research_only=false,
  d=>d.sources[0].commercial_promotion_requires_separate_main_gates=false,
  d=>d.sources[0].source_id=d.sources[1].source_id,
  d=>d.commercial_risk_gate_eligible=true,
 ]){
  const doc=structuredClone(registry);mutate(doc);
  assert.throws(()=>inspectResearchSupplementalRegistry(doc),/HOT50_RESEARCH_SUPPLEMENTAL_/);
 }
});
