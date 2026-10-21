import test from "node:test";
import assert from "node:assert/strict";
import {inspectKnownRightsTerms,runSourceRightsTermsAudit}
 from "./monitor-commercial-source-rights.mjs";
import {buildCommercialRightsRemediationInventory}
 from "../lib/commercial-rights-remediation.mjs";
const source=buildCommercialRightsRemediationInventory().rows.find(x=>x.source_id==="usgs_mcs");
function response(body="public official terms"){
 return {
  status:200,ok:true,headers:new Headers({"content-type":"text/html"}),
  body:new Response(body).body,
 };
}
test("bodies are hashed but never converted into article-use grants",async()=>{
 const v=await inspectKnownRightsTerms(source,async()=>response());
 assert.equal(v.status,"TERMS_BYTES_RETRIEVED_FOR_REVIEW");
 assert.match(v.terms_sha256,/^[a-f0-9]{64}$/);
 assert.equal(v.article_specific_permission_certified,false);
});
test("301 redirect and refused upstream terms are REVIEW_PENDING not approved",async()=>{
 const v=await inspectKnownRightsTerms(source,async()=>({
  status:301,ok:false,headers:new Headers({"location":"https://evil.example"}),
 }));
 assert.equal(v.status,"TERMS_REDIRECT_REVIEW_REQUIRED");
 assert.equal(v.terms_sha256,null);
});
test("no SSRF when registry terms URL is modified",async()=>{
 await assert.rejects(inspectKnownRightsTerms({...source,
  terms_url:"https://127.0.0.1/private"},async()=>response()),/INVALID/);
});
test("every source is monitored and no rights signatures are invented",async()=>{
 const audit=await runSourceRightsTermsAudit(async()=>response());
 assert.equal(audit.sources_examined,buildCommercialRightsRemediationInventory().registered_sources_examined);
 assert.equal(audit.sources_with_terms_bytes_retrieved,audit.sources_examined);
 assert.equal(audit.no_attribution_permission_automatically_issued,false);
 assert.equal(audit.rights_issuer_signatures,0);
 assert.equal(audit.payments,0);
});
