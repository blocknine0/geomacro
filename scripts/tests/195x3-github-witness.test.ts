import {test,expect} from "bun:test";
import {buildCanonical195x3CoverageMatrix} from "../../src/lib/canonical-195-country-coverage-matrix";
import {createRedactedGithubAuditWitness,publishGithubAuditWitness}
  from "../ops/publish-195x3-github-audit-witness.mjs";
const SHA40="a".repeat(40);
const ENV={GITHUB_REPOSITORY:"blocknine0/geomacro",GITHUB_REF:"refs/heads/main",
 GITHUB_SHA:SHA40,GITHUB_RUN_ID:"123456",GITHUB_RUN_ATTEMPT:"1",
 GITHUB_TOKEN:"test-only-token-not-real-000000000000"};
function fixture(ok=false){
 return JSON.stringify({
  schema:"geomacro.supabase-free-country-runtime-audit.v1",
  checked_at:"2026-10-29T13:00:00.000Z",
  country_count:195,category_count:3,routing_cell_count:585,
  audit_state:ok?"GLOBAL_RUNTIME_READ_VERIFIED":"SOURCE_RUNTIME_UNAVAILABLE",
  audit_ok:ok,
  source_runtime:ok?{secret:"PRIVATE_PUBLISHER_B2_KEY_SHOULD_NOT_LEAK",
    contexts:[{},{},{}]}:null,
  automated_finds_categories:ok?[{},{},{}]:[],
  paid_country_readiness_assessed:false,
  current_signed_country_delivery_verified_count:0,
  country_current_evidence_not_inferred_from_global_feeds:true,
  blocked_scope:ok?undefined:"GLOBAL_SOURCE_READ_NOT_PER_COUNTRY_NEGATIVE_PROOF",
  boundaries:{supabase_requests:0,b2_requests:0,payments:0,
   raw_source_urls_emitted:false,raw_source_material_emitted:false,execution_authorized:false},
  country_category_matrix:buildCanonical195x3CoverageMatrix(),
 });
}
test("witness contains only digest/status, not original source or private data",()=>{
 const witness=createRedactedGithubAuditWitness(fixture(true),{
  sha:SHA40,runId:"123456",attempt:"1"});
 expect(witness.body).toContain("195 × 3 = 585");
 expect(witness.body).toContain("GLOBAL_RUNTIME_READ_VERIFIED");
 expect(witness.body).not.toContain("PRIVATE_PUBLISHER_B2_KEY");
 expect(witness.body).not.toContain("country_iso3");
 expect(witness.body).not.toContain("source_runtime");
 expect(witness.paid_delivery_implied).toBe(false);
});
test("unavailable sources produce red timestamp/digest without claiming payable delivery",()=>{
 const r=createRedactedGithubAuditWitness(fixture(false),{
   sha:SHA40,runId:"123456",attempt:"1"});
 expect(r.audit_ok).toBe(false);
 expect(r.body).toContain("SOURCE_RUNTIME_UNAVAILABLE");
 expect(r.body).toContain("0 claimed");
});
test("GitHub witness POST creates one long-retention independent receipt",async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{
  calls.push({url,init});
  if(init.method==="GET")return Response.json([]);
  if(init.method==="POST")return Response.json({
   id:777,html_url:"https://github.com/blocknine0/geomacro/issues/3102#issuecomment-777"});
  throw Error("UNEXPECTED_CALL");
 };
 const r=await publishGithubAuditWitness({raw:fixture(false),env:ENV,fetcher});
 expect(r.ok).toBe(true);
 expect(r.already_witnessed).toBe(false);
 expect(calls).toHaveLength(2);
 const body=JSON.parse(calls[1].init.body).body;
 expect(body).not.toContain("PRIVATE_PUBLISHER");
 expect(body).not.toContain("0x");
 expect(calls[1].url).toContain("/issues/3102/comments");
});
test("already anchored proof cannot post duplicate",async()=>{
 const p=createRedactedGithubAuditWitness(fixture(false),{
  sha:SHA40,runId:"123456",attempt:"1"});
 let posts=0;
 const r=await publishGithubAuditWitness({raw:fixture(false),env:ENV,
  fetcher:async(url,init)=>{
   if(init.method==="GET")return Response.json([{body:p.body}]);
   posts++;throw Error("POST_NOT_ALLOWED");
  }});
 expect(r.already_witnessed).toBe(true);
 expect(posts).toBe(0);
});
test("wrong ref, fake 585-cell proof and missing token cannot publish",async()=>{
 for(const env of [
   {...ENV,GITHUB_REF:"refs/heads/feature"},
   {...ENV,GITHUB_TOKEN:""},
   {...ENV,GITHUB_REPOSITORY:"someone/other"}]){
  await expect(publishGithubAuditWitness({
   raw:fixture(false),env,fetcher:async()=>{throw Error("NOT_CALLED")}}))
   .rejects.toThrow();
 }
 const incorrect=JSON.parse(fixture(false));incorrect.country_category_matrix.cells.pop();
 expect(()=>createRedactedGithubAuditWitness(JSON.stringify(incorrect),{
  sha:SHA40,runId:"123456",attempt:"1"})).toThrow();
});
