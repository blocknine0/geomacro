import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyWebsitePublicationFollowup as verify} from
  "./assert-website-publication-followup.mjs";
const sha="a".repeat(40),previous="b".repeat(40);
const trusted={repository:"blocknine0/geomacro",eventName:"workflow_run",
  eventSha:sha,checkoutSha:sha,parentSha:previous,
  parentRepository:"blocknine0/geomacro",parentBranch:"main",
  parentWorkflow:"GRI v1.2 Supabase-Free Current Promotion",
  parentEvent:"repository_dispatch",parentConclusion:"success",isAncestor:true};
test("trusts successful signed publisher ancestor even after main advances; still independently tests real HTTP 200",()=>{
  const r=verify(trusted);
  assert.equal(r.allowed,true);
  assert.equal(r.parent_workflow_verified,true);
  assert.equal(r.public_signed_product_verified,false);
  assert.equal(r.public_deep_health_http_200_verified,false);
  assert.equal(r.payments+r.d1_writes+r.b2_requests,0);
});
test("valid direct health events do not claim signed publisher completion",()=>{
  for(const eventName of ["push","workflow_dispatch","schedule"]){
    const r=verify({repository:"blocknine0/geomacro",eventName,
      eventSha:sha,checkoutSha:sha});
    assert.equal(r.parent_workflow_verified,false);
    assert.equal(r.public_deep_health_http_200_verified,false);
  }
});
test("accepts only reviewed or dual-authority publisher types with their real dispatch origins",()=>{
  for(const parentWorkflow of ["Supabase-Free Reviewed Intelligence Publication",
      "Machine Dual-Authority Intelligence Publication"]){
    assert.equal(verify({...trusted,parentWorkflow,
      parentEvent:"workflow_dispatch"}).allowed,true);
  }
  assert.equal(verify({...trusted,
    parentWorkflow:"Risk Indices from Verified D1 Global Risk (No Funds)",
    parentEvent:"workflow_run"}).allowed,true);
});
test("rejects unrelated branch, forks, failed/skipped publishers and SHA replay",()=>{
  for(const delta of [
   {repository:"wrong/repo"},{eventName:"pull_request"},
   {eventSha:previous},{checkoutSha:previous},
   {parentSha:"main"},{parentSha:undefined},
   {parentBranch:"feature"},{parentRepository:"somefork/geomacro"},
   {parentConclusion:"skipped"},{parentConclusion:"failure"},
   {parentWorkflow:"Auto Ingest News"},
   {parentWorkflow:"Risk Indices from Verified D1 Global Risk (No Funds)",
    parentEvent:"repository_dispatch"},
   {parentWorkflow:"Machine Dual-Authority Intelligence Publication",
    parentEvent:"workflow_run"},
   {parentEvent:"push"},{isAncestor:false},{isAncestor:undefined},
  ])assert.throws(()=>verify({...trusted,...delta}),
    /WEBSITE_HEALTH_TRUSTED_PUBLISHER_ANCESTRY_REQUIRED/);
});
test("production workflow retains real independent site, B2/D1 and exact build checks",()=>{
  const w=readFileSync(".github/workflows/production-website-health.yml","utf8");
  assert.match(w,/scripts\/ops\/assert-website-publication-followup\.mjs/);
  assert.match(w,/fetch-depth: 0/);
  assert.match(w,/TRUSTED_PUBLISHER_PARENT_SHA/);
  assert.match(w,/github\.event\.workflow_run\.head_sha != ''/);
  assert.doesNotMatch(w,/github\.event\.workflow_run\.head_sha == github\.sha/);
  assert.match(w,/\/api\/health\?deep=1/);
  assert.match(w,/Verify live build marker matches canonical main/);
  assert.match(w,/Verify independent Global Risk and Risk Indices edges/);
  assert.match(w,/Verify Lovable mirror source parity/);
});
