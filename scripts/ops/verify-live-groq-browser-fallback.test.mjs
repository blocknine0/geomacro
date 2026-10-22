import test from "node:test";
import assert from "node:assert/strict";
import {assertHostedLiveGroqEnv,classifyLiveGroqBrowserEnvelope,
 verifyRealGroqBrowserOnce} from "./verify-live-groq-browser-fallback.mjs";
const env={
 GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",
 GROQ_API_KEY:"synthetic-do-not-print",
 GROQ_SMOKE_OWNER_FREE_PLAN:"YES_OWNER_CONFIRMED_FREE",
};
const good={
 schema:"geomacro.groq.browser-research-leads.v1",
 leads:[{category:"MACRO",
  what_changed:"A current first party central bank publication was indexed this morning.",
  why_it_matters:"The statement may influence monitoring decisions but it requires exact native HTML readback.",
  source_domain:"example.gov",source_date:"2026-10-22"}]
};
const now=new Date("2026-10-22T12:00:00.000Z");
function response(value=good,status=200){
 return {status,json:async()=>({
  model:"openai/gpt-oss-20b",
  choices:[{message:{content:JSON.stringify(value)}}]
 })};
}
test("one real-browser exact contract integration shape; outputs neither source nor secrets",async()=>{
 let calls=0;
 const x=await verifyRealGroqBrowserOnce({env,now,fetchImpl:async(url,req)=>{
  calls++;
  assert.equal(url,"https://api.groq.com/openai/v1/chat/completions");
  assert.equal(JSON.parse(req.body).tool_choice,"required");
  return response();
 }});
 assert.equal(calls,1);
 assert.equal(x.provider_http_status,200);
 assert.equal(x.fallback_validation,"VALIDATED_PROVISIONAL_LEADS");
 assert.equal(x.structured_provisional_leads,1);
 assert.equal(x.actual_first_party_original_html_readback,false);
 assert.equal(x.gro_signed_product_published,false);
 assert.equal(x.real_payments,0);
 for(const forbidden of [env.GROQ_API_KEY,"example.gov",good.leads[0].what_changed]){
  assert.equal(JSON.stringify(x).includes(forbidden),false);
 }
});
test("200 but snippets or non-JSON tool response is NOT accepted as structured facts",async()=>{
 const x=await verifyRealGroqBrowserOnce({env,now,fetchImpl:async()=>{
  return {status:200,json:async()=>({model:"openai/gpt-oss-20b",
   choices:[{message:{content:"Web snippet: an official publication was found."}}]})};
 }});
 assert.equal(x.provider_http_status,200);
 assert.equal(x.completion_text_received,true);
 assert.equal(x.strict_json_text_received,false);
 assert.equal(x.fallback_validation,"HTTP_200_BUT_MODEL_OUTPUT_NOT_VALID_STRICT_STRUCTURED_LEADS");
 assert.equal(x.structured_provisional_leads,0);
});
test("no Groq key or false free confirmation denies before any external call",async()=>{
 for(const altered of [{GROQ_API_KEY:""},
  {GROQ_SMOKE_OWNER_FREE_PLAN:"NO"},
  {GITHUB_REF:"refs/heads/feature"},
  {COINBASE_API_KEY:"not allowed"},
  {GITHUB_REPOSITORY:"fork/geomacro"}]){
  assert.throws(()=>assertHostedLiveGroqEnv({...env,...altered}));
  let calls=0;
  await assert.rejects(verifyRealGroqBrowserOnce({
   env:{...env,...altered},fetchImpl:async()=>{calls++;return response()}
  }));
  assert.equal(calls,0);
 }
});
test("status 429 is honest rate limit and cannot be marked a product success",async()=>{
 const x=await verifyRealGroqBrowserOnce({env,now,
  fetchImpl:async()=>({status:429,json:async()=>({error:"rate limit"})})
 });
 assert.equal(x.provider_http_status,429);
 assert.equal(x.fallback_validation,"BROWSER_SEARCH_UPSTREAM_UNAVAILABLE");
 assert.equal(x.structured_provisional_leads,0);
});
test("safe receipt shape does not disclose arbitrary provider errors",()=>{
 const x=classifyLiveGroqBrowserEnvelope(400,
  {error:{message:"Never log this source or secret"},model:"secret-provider-model"});
 assert.equal(JSON.stringify(x).includes("Never log"),false);
 assert.equal(JSON.stringify(x).includes("secret-provider"),false);
 assert.equal(x.provider_http_status,400);
});
