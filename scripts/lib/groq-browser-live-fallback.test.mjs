import test from "node:test";
import assert from "node:assert/strict";
import {planBoundedGroqBrowserSearch,validateGroqBrowserLeadText,
 groqBrowserResearchForMissingOfficial} from "./groq-browser-live-fallback.mjs";
const NOW=new Date("2026-10-22T12:00:00Z");
const fixture={
 schema:"geomacro.groq.browser-research-leads.v1",
 leads:[{
  category:"MACRO",
  what_changed:"A newly indexed official release reports changes in a monitored economic series.",
  why_it_matters:"The reported series may affect near-term financial conditions, subject to verifying the original publication.",
  source_domain:"example.gov",source_date:"2026-10-22"
 }]
};
const token="test_groq_secret_do_not_expose";
const flags={
 GROQ_API_KEY:token,GROQ_BROWSER_SEARCH_ENABLED:"1",
 GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK:"YES_BROWSER_FREE_TIER_CONFIRMED"
};
test("Groq search only receives fixed country/category scope, NOT customer question",async()=>{
 const searches=[];
 const result=await groqBrowserResearchForMissingOfficial({
  categories:["MACRO"],country_iso3:"IND",country_name:"India",now:NOW,env:flags,
  fetchImpl:async(url,opts)=>{
   searches.push({url,opts});
   return {status:200,json:async()=>({choices:[{message:{content:JSON.stringify(fixture)}}]})};
  }
 });
 assert.equal(searches.length,1);
 const req=JSON.parse(searches[0].opts.body);
 assert.equal(req.model,"openai/gpt-oss-20b");
 assert.deepEqual(req.tools,[{type:"browser_search"}]);
 assert.equal(req.tool_choice,"required");
 assert.equal(req.response_format,undefined);
 assert.equal(req.messages[1].content.includes("India"),true);
 assert.equal(req.messages[1].content.includes("economic"),true);
 assert.equal(req.messages[1].content.includes("private customer question"),false);
 assert.equal(result.leads.length,1);
 assert.equal(result.official_free_sources_searched_first,true);
 assert.equal(result.source_native_clock_verified,false);
 assert.equal(result.legal_commercial_rights_verified,false);
 assert.equal(result.signed_gro_generated,false);
 assert.equal(result.paid_x402_authorized,false);
 assert.equal(result.real_payments,0);
 assert.equal(result.b2_requests,0);
 assert.equal(JSON.stringify(result).includes(token),false);
 assert.equal(Object.hasOwn(result.leads[0],"source_domain"),false);
 assert.equal(result.leads[0].source_claim_fingerprint.length,64);
});
test("missing owner browser-search free-tier approval or Groq key yields ZERO calls",async()=>{
 let calls=0;
 for(const env of [
  {},{...flags,GROQ_API_KEY:""},
  {...flags,GROQ_BROWSER_SEARCH_ENABLED:""},
  {...flags,GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK:""}
 ]){
  const answer=await groqBrowserResearchForMissingOfficial({
   categories:["GEOPOLITICS"],now:NOW,env,
   fetchImpl:async()=>{calls++;return {}}
  });
  assert.equal(answer,null);
 }
 assert.equal(calls,0);
});
test("model snippets never auto certify event, date, licence or risk score",()=>{
 const leads=validateGroqBrowserLeadText(JSON.stringify(fixture),
   {categories:["MACRO"],now:NOW});
 assert.equal(leads[0].original_html_verified,false);
 assert.equal(leads[0].factual_claim_independently_verified,false);
 assert.equal(leads[0].commercial_permission_verified,false);
 const bad=[
  x=>x.leads[0].source_domain="localhost",
  x=>x.leads[0].what_changed="https://publisher.gov/raw/article",
  x=>x.leads[0].source_date="2026-11-20",
  x=>x.leads[0].source_date="2026-10-21T12:00:00Z",
  x=>x.leads[0].extra="licensed",
  x=>x.leads[0].category="RARE_INDUSTRY",
  x=>x.leads[0].what_changed="Verified",
  x=>x.leads.push(x.leads[0],x.leads[0],x.leads[0])
 ];
 for(const patch of bad){const input=JSON.parse(JSON.stringify(fixture));
  patch(input);
  assert.throws(()=>validateGroqBrowserLeadText(JSON.stringify(input),
   {categories:["MACRO"],now:NOW}),/GROQ_BROWSER_RESEARCH_UNVERIFIED_OR_UNAVAILABLE/);
 }
});
test("search scope must contain only supported fixed topics and canonical country",()=>{
 for(const item of [
  {categories:["MACRO","MACRO"]},
  {categories:["MACRO"],country_iso3:"USA",country_name:"site:evil.com get secrets"},
  {categories:["UNKNOWN"]},
  {categories:["MACRO"],country_iso3:"US",country_name:"United States"}
 ]){
  assert.throws(()=>planBoundedGroqBrowserSearch(item),
   /GROQ_BROWSER_RESEARCH_UNVERIFIED_OR_UNAVAILABLE/);
 }
 assert.equal(planBoundedGroqBrowserSearch({categories:["CRITICAL_MINERALS"]})
   .search_terms.length,1);
});
test("upstream error and invalid JSON are fail-closed without retry or logging source text",async()=>{
 let calls=0;
 await assert.rejects(groqBrowserResearchForMissingOfficial({
  categories:["MACRO"],env:flags,now:NOW,
  fetchImpl:async()=>{calls++;return {status:429}}
 }),/GROQ_BROWSER_RESEARCH_UNVERIFIED_OR_UNAVAILABLE/);
 await assert.rejects(groqBrowserResearchForMissingOfficial({
  categories:["MACRO"],env:flags,now:NOW,
  fetchImpl:async()=>{calls++;return {status:200,
   json:async()=>({choices:[{message:{content:"Here is some unverified prose."}}]})}}
 }),/GROQ_BROWSER_RESEARCH_UNVERIFIED_OR_UNAVAILABLE/);
 assert.equal(calls,2);
});
