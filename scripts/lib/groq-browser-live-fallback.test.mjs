import test from "node:test";
import assert from "node:assert/strict";
import {planBoundedGroqBrowserSearch,validateGroqBrowserLeadText,
 groqBrowserResearchForMissingOfficial,reserveBoundedFreeBrowserSlot} from "./groq-browser-live-fallback.mjs";
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
test("missing existing key or explicit runtime opt-out yields ZERO browser calls",async()=>{
 let calls=0;
 for(const env of [
  {},{...flags,GROQ_API_KEY:""},
  {...flags,GROQ_BROWSER_SEARCH_ENABLED:"0"},
  {...flags,GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK:"DENY"}
 ]){
  const answer=await groqBrowserResearchForMissingOfficial({
   categories:["GEOPOLITICS"],now:NOW,env,
   fetchImpl:async()=>{calls++;return {}}
  });
  assert.equal(answer,null);
 }
 assert.equal(calls,0);
});
test("owner-confirmed Free Plan uses existing Groq key even without Lovable variable edits",async()=>{
 let calls=0;
 const out=await groqBrowserResearchForMissingOfficial({
  categories:["MACRO"],now:NOW,env:{GROQ_API_KEY:token},
  fetchImpl:async()=>{
   calls++;
   return {status:200,json:async()=>({choices:[{message:{content:JSON.stringify(fixture)}}]})};
  }
 });
 assert.equal(calls,1);
 assert.equal(out.leads.length,1);
 assert.equal(out.paid_x402_authorized,false);
 assert.equal(out.legal_commercial_rights_verified,false);
});
test("bounded Free Plan budget refuses requests after hourly/daily allowance",()=>{
 const b={hourStart:0,hourCount:0,dayStart:0,dayCount:0};
 const now=NOW.getTime();
 for(let n=0;n<6;n++)assert.equal(reserveBoundedFreeBrowserSlot(now,b),true);
 assert.equal(reserveBoundedFreeBrowserSlot(now,b),false);
 assert.equal(reserveBoundedFreeBrowserSlot(now+3600_000,b),true);
 for(let hour=2;hour<=6;hour++){
  assert.equal(reserveBoundedFreeBrowserSlot(now+hour*3600_000,b),true);
 }
 // Values are exact 6+1+5 = 12; new hour but same UTC day budget closed.
 assert.equal(reserveBoundedFreeBrowserSlot(now+7*3600_000,b),false);
 assert.equal(reserveBoundedFreeBrowserSlot(now+24*3600_000,b),true);
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

test("actual browser-style cited prose receives SECOND strict schema model call only",async()=>{
 let calls=0;
 const out=await groqBrowserResearchForMissingOfficial({
  categories:["MACRO"],country_iso3:"IND",country_name:"India",now:NOW,env:flags,
  fetchImpl:async(url,opts)=>{
   assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");
   const body=JSON.parse(opts.body);calls++;
   if(calls===1){
    assert.deepEqual(body.tools,[{type:"browser_search"}]);
    assert.equal(body.response_format,undefined);
    return {status:200,json:async()=>({choices:[{message:{
     content:"Recent economic announcements discussed; official data cited below. 〖2†L6-L10〗"
    }}]})};
   }
   assert.equal(body.tools,undefined);
   assert.equal(body.response_format.type,"json_schema");
   assert.equal(body.response_format.json_schema.strict,true);
   assert.equal(body.response_format.json_schema.schema.additionalProperties,false);
   assert.equal(body.messages[1].content.includes("private customer question"),false);
   return {status:200,json:async()=>({choices:[{message:{content:JSON.stringify(fixture)}}]})};
  }
 });
 assert.equal(calls,2);
 assert.equal(out.strict_validator_version,"geomacro.groq-browser-validator.v2");
 assert.equal(out.conversion_mode,"SEPARATE_GROQ_STRICT_JSON_CONVERSION");
 assert.equal(out.leads.length,1);
 assert.equal(out.legal_commercial_rights_verified,false);
 assert.equal(out.paid_x402_authorized,false);
});
test("empty strict list is valid but withheld instead of inventing current facts",async()=>{
 assert.deepEqual(validateGroqBrowserLeadText(
  JSON.stringify({schema:fixture.schema,leads:[]}),{categories:["MACRO"],now:NOW}),[]);
 let calls=0;
 const r=await groqBrowserResearchForMissingOfficial({
  categories:["MACRO"],now:NOW,env:flags,
  fetchImpl:async()=>{
   calls++;
   return {status:200,json:async()=>({choices:[{message:{
    content:JSON.stringify({schema:fixture.schema,leads:[]})
   }}]})};
  }
 });
 assert.equal(r,null);
 assert.equal(calls,1);
});
test("invalid strict conversion fails closed and never returns licensed or signed response",async()=>{
 let calls=0;
 await assert.rejects(groqBrowserResearchForMissingOfficial({
  categories:["MACRO"],now:NOW,env:flags,
  fetchImpl:async()=>{
   calls++;
   return calls===1?
     {status:200,json:async()=>({choices:[{message:{content:"browser citations and prose"}}]})}:
     {status:200,json:async()=>({choices:[{message:{content:JSON.stringify({
      schema:fixture.schema,leads:[{...fixture.leads[0],license_granted:true}]
     })}}]})};
  }
 }),/GROQ_BROWSER_RESEARCH_UNVERIFIED_OR_UNAVAILABLE/);
 assert.equal(calls,2);
});
