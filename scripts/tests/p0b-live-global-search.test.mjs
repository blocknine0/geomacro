import test from "node:test";
import assert from "node:assert/strict";
import {p0bHeadlineEvent,p0bProjectEvidenceBounded} from "../lib/p0b-event-grounded-projection.mjs";
import {p0bGlobalNewsFallback} from "../lib/p0b-live-global-search.mjs";
import {p0aAuditOriginal} from "../lib/p0a-evidence-quality.mjs";
import {buildPhase2hPrivateRawRecords} from "../lib/phase2h-raw-original-records.mjs";
const now=Date.parse("2026-10-30T09:00:00.000Z");
test("all three category originals allow bounded event-specific fact and implication",()=>{
 for(const [category,title] of [
  ["geopolitics","United Nations announces sanctions on export shipments"],
  ["macro","India reports inflation data for October 2026"],
  ["rare_earth","India announces lithium recycling programme"]
 ]){
  const e=p0bHeadlineEvent(title,category);
  assert.ok(e,category);
  assert.notEqual(e.what,e.why);
  assert.ok(e.why.length>45);
 }
 assert.equal(p0bHeadlineEvent("A story about lithium","rare_earth"),null);
});
test("canonical original SHA remains immutable through read-time projection",()=>{
 const item=buildPhase2hPrivateRawRecords([{
  category:"rare_earth",title:"India announces lithium recycling programme",
  publishedAt:"2026-10-30T08:00:00.000Z",sourceId:"gov_ind",
  articleUrl:"https://official.example.org/lithium",credit:null,
 }],{now:new Date(now),derive:()=>[]}).records[0];
 const old=JSON.stringify(item);
 const five=p0bProjectEvidenceBounded(item);
 assert.ok(five);
 assert.equal(p0aAuditOriginal({...item,analysis:five}).status,"PASS");
 assert.equal(JSON.stringify(item),old);
 assert.equal(five.evidence_and_confidence.paid_eligible,false);
});
test("latest world discovery is not substituted for original publisher proof",async()=>{
 const calls=[];
 const fetchImpl=async url=>{
  const u=new URL(url);calls.push(u.hostname+u.pathname);
  const data=u.hostname==="api.gdeltproject.org"?
   {articles:[{title:"Article",url:"https://example.org/world"}]}:
   u.pathname==="/api/search.json"?
   {results:[{link:"/government/news/india-lithium-recycling"}]}:
   {title:"India announces lithium recycling programme",
    first_published_at:"2026-10-30T08:00:00.000Z"};
  return {status:200,redirected:false,headers:{get:()=>"application/json"},
   text:async()=>JSON.stringify(data)};
 };
 const r=await p0bGlobalNewsFallback({question:"India lithium recycling programme",
  countryIso3:"IND",category:"rare_earth",fetchImpl,now});
 assert.equal(r.attempted,true);
 assert.equal(r.first_party_matches.length,1);
 assert.equal(r.gdelt_discovery_count,1);
 assert.equal(r.first_party_matches[0].paid_eligible,false);
 assert.equal(r.exhaustive_global_search,false);
 assert.ok(calls.includes("www.gov.uk/api/content/government/news/india-lithium-recycling"));
});


test("real upstream failures expose bounded statuses, not publisher URLs or response data",async()=>{
 const fetchImpl=async url=>({
  status:new URL(url).hostname==="www.gov.uk"?403:429,
  redirected:false,headers:{get:()=> "application/json"},
  text:async()=> "untrusted upstream content"
 });
 const result=await p0bGlobalNewsFallback({
  question:"Ukraine sanctions update",countryIso3:"UKR",
  category:"geopolitics",now,fetchImpl
 });
 assert.equal(result.first_party_matches.length,0);
 assert.deepEqual(result.provider_diagnostics,{govuk:"HTTP_403",gdelt:"HTTP_429",rss:"FEED_UNAVAILABLE"});
 assert.equal(result.provider_errors,2);
 assert.equal(result.status,"GLOBAL_PROVIDER_UNAVAILABLE");
 assert.doesNotMatch(JSON.stringify(result),/untrusted upstream content|https?:\/\//u);
});


test("Workers-compatible manual redirects preserve fail-closed 3xx source policy",async()=>{
 const seen=[];
 const fetchImpl=async (_url,opts)=>{
  seen.push(opts?.redirect);
  return {status:302,redirected:false,headers:{get:()=> "text/html"},
   text:async()=> "redirect body must never become evidence"};
 };
 const r=await p0bGlobalNewsFallback({
  question:"Ukraine sanctions update",countryIso3:"UKR",
  category:"geopolitics",now,fetchImpl
 });
 assert.deepEqual(seen,["manual","manual","manual"]);
 assert.deepEqual(r.provider_diagnostics,{govuk:"REDIRECT_DENIED",gdelt:"REDIRECT_DENIED",rss:"FEED_UNAVAILABLE"});
 assert.equal(r.status,"GLOBAL_PROVIDER_UNAVAILABLE");
 assert.equal(r.first_party_matches.length,0);
 assert.doesNotMatch(JSON.stringify(r),/redirect body must never become evidence/u);
});
