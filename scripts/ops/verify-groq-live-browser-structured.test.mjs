import test from "node:test";
import assert from "node:assert/strict";
import {runProtectedGroqBrowserAcceptance} from "./verify-groq-live-browser-structured.mjs";
const key="nonprinting-test-key";
const env={GROQ_API_KEY:key,GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_ACTIONS:"true"};
const now=new Date("2026-10-22T08:00:00Z");
const sample=JSON.stringify({schema:"geomacro.groq.browser-research-leads.v1",
 leads:[{category:"MACRO",
  what_changed:"A recent official report describes material monetary policy developments for economic monitoring.",
  why_it_matters:"The new statement may affect expectations, but the exact primary source is not yet authenticated.",
  source_domain:"example.gov",source_date:"2026-10-22"}]});
const response=content=>({status:200,json:async()=>({choices:[{message:{
 content,executed_tools:[{type:"browser_search"}]
}}]})});
test("actual browser response direct strict output remains honest without exposing source or key",async()=>{
 let calls=0;
 const result=await runProtectedGroqBrowserAcceptance({env,now,realFetch:async()=>{
  calls++;return response(sample);
 }});
 assert.equal(calls,1);
 assert.equal(result.provider_browser_http_200,true);
 assert.equal(result.provider_calls,1);
 assert.equal(result.schema_validated_by_production_validator,true);
 assert.equal(result.accepted_provisional_leads,1);
 assert.equal(result.signed_commercial_intelligence,false);
 assert.equal(result.real_payments,0);
 assert.equal(result.b2_requests,0);
 assert.equal(JSON.stringify(result).includes(key),false);
 assert.equal(JSON.stringify(result).includes("example.gov"),false);
});
test("real browser citation prose converts via a separate NO-TOOLS strict schema call",async()=>{
 let calls=0;
 const result=await runProtectedGroqBrowserAcceptance({env,now,realFetch:async()=>{
  calls++;
  return response(calls===1?"Browser found a central bank bulletin. 〖2†L6-10〗":sample);
 }});
 assert.equal(calls,2);
 assert.equal(result.converter_http_200,true);
 assert.equal(result.schema_validated_by_production_validator,true);
});
test("strict schema empty list accepted as NO FRESH EVIDENCE, not invented intelligence",async()=>{
 const empty=JSON.stringify({schema:"geomacro.groq.browser-research-leads.v1",leads:[]});
 const x=await runProtectedGroqBrowserAcceptance({env,now,realFetch:async()=>response(empty)});
 assert.equal(x.accepted_provisional_leads,0);
 assert.equal(x.signed_commercial_intelligence,false);
});
test("Groq namespaced executed browser tool type proves search without requiring exact bare name",async()=>{
 const namespaced={status:200,json:async()=>({choices:[{message:{
  content:sample,executed_tools:[{type:"groq.internal.browser_search"}]
 }}]})};
 const answer=await runProtectedGroqBrowserAcceptance({env,now,realFetch:async()=>namespaced});
 assert.equal(answer.provider_executed_tools_marker_observed,true);
 assert.equal(answer.schema_validated_by_production_validator,true);
 assert.equal(answer.signed_commercial_intelligence,false);
});
test("fake structured JSON without actual Groq browser tool execution is NOT accepted",async()=>{
 let calls=0;
 const fake={status:200,json:async()=>({choices:[{message:{content:sample,executed_tools:[]}}]})};
 await assert.rejects(runProtectedGroqBrowserAcceptance({env,now,
  realFetch:async()=>{calls++;return fake;}
 }),/GROQ_BROWSER_LIVE_STRICT_ACCEPTANCE_NOT_VERIFIED/);
 assert.equal(calls,1);
});
test("bad key/scope, 429, invalid conversion or invalid final leads fail-closed",async()=>{
 let calls=0;
 await assert.rejects(runProtectedGroqBrowserAcceptance({env:{...env,GROQ_API_KEY:""},
  now,realFetch:async()=>{calls++;return response(sample)}}),
  /GROQ_BROWSER_LIVE_STRICT_ACCEPTANCE_NOT_VERIFIED/);
 assert.equal(calls,0);
 await assert.rejects(runProtectedGroqBrowserAcceptance({env,now,
  realFetch:async()=>({status:429})}),
  /GROQ_BROWSER_LIVE_STRICT_ACCEPTANCE_NOT_VERIFIED/);
 await assert.rejects(runProtectedGroqBrowserAcceptance({env,now,
  realFetch:async()=>response("No valid structured response, despite browser results")}),
  /GROQ_BROWSER_LIVE_STRICT_ACCEPTANCE_NOT_VERIFIED/);
});
