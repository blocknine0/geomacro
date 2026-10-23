import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {verifyGeomacroOriginalPages,verifyGeomacroUnclaimedOriginalPage} from "./geomacro-original-page-readback.mjs";
const sha=t=>createHash("sha256").update(t).digest("hex");
const now=new Date("2026-10-10T11:00:00Z");
const claim=sha("synthetic exact monetary-policy claim, not real-world evidence");
const fedUrl="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010a.htm";
const ecbUrl="https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.mp261010.en.html";
const originals=[
  {category:"macro",same_event_claim_sha256:claim,
   originating_reporting_organization_id:"federal_reserve",
   original_article_url:fedUrl,original_published_at:"2026-10-10T10:05:00.000Z",
   reporting_position:"confirms"},
  {category:"macro",same_event_claim_sha256:claim,
   originating_reporting_organization_id:"ecb",
   original_article_url:ecbUrl,original_published_at:"2026-10-10T10:10:00.000Z",
   reporting_position:"confirms"},
];
const originalHtml=(at)=>`<!DOCTYPE html><html><head>
<meta property="article:published_time" content="${at}">
</head><body>Private actual page fixture, never an external attestation</body></html>`;
const htmlFed=originalHtml("2026-10-10T10:05:00Z");
const htmlEcb=originalHtml("2026-10-10T10:10:00Z");
function fakeFetch(counter,overrides={}){
  return async (url,init)=>{
    counter.push({url,method:init.method,redirect:init.redirect});
    const body=overrides.body??(url===fedUrl?htmlFed:htmlEcb);
    return new Response(body,{status:overrides.status??200,
      headers:{"content-type":overrides.type??"text/html"}});
  };
}
const run=(rows,fetchImpl)=>
  verifyGeomacroOriginalPages({originals:rows,now,fetchImpl});

test("two exact publisher HTTPS readbacks bind original bytes and page publication time but no paid rights",async()=>{
  const calls=[];
  const result=await run(originals,fakeFetch(calls));
  assert.deepEqual(calls.map(x=>[x.method,x.redirect]),[
    ["GET","error"],["GET","error"]]);
  assert.deepEqual(calls.map(x=>x.url),[fedUrl,ecbUrl]);
  assert.equal(result.original_pages_authenticity_and_clock_verified,true);
  assert.equal(result.verified_original_count,2);
  assert.equal(result.results[0].article_sha256,sha(htmlFed));
  assert.equal(result.results[1].article_sha256,sha(htmlEcb));
  assert.equal(result.source_content_match_claim_semantically_verified,false);
  assert.equal(result.licensed_commercial_use_verified,false);
  assert.equal(result.external_independent_reviewer_attested,false);
  assert.equal(result.signed_gro_verified,false);
  assert.equal(result.commercial_eligible,false);
  assert.equal(result.payment_authorized,false);
  assert.deepEqual([result.b2_requests,result.d1_writes,
    result.supabase_requests,result.payments],[0,0,0,0]);
  const serialized=JSON.stringify(result);
  assert.ok(!serialized.includes(fedUrl));
  assert.ok(!serialized.includes(ecbUrl));
  assert.ok(!serialized.includes("Private actual page fixture"));
});

test("third-party homepage, wrong registered organization, same issuer and stale original are rejected before GET",async()=>{
  const inputs=[
    [originals[0],{...originals[1],
      original_article_url:"https://www.ecb.europa.eu.attacker.invalid/foo"}],
    [originals[0],{...originals[1],
      originating_reporting_organization_id:"federal_reserve"}],
    [originals[0],{...originals[0],
      original_article_url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261010b.htm"}],
    [originals[0],{...originals[1],original_published_at:"2026-10-08T10:10:00Z"}],
    [originals[0],{...originals[1],same_event_claim_sha256:sha("other-event")}],
    [{...originals[0],original_article_sha256:sha(fedUrl)},originals[1]],
    [originals[0],{...originals[1],original_article_url:ecbUrl+"?redirect=1"}],
  ];
  for(const bad of inputs){
    const calls=[];
    await assert.rejects(run(bad,fakeFetch(calls)),
      /GEOMACRO_PRIVATE_PAGE_READBACK_INPUT_INVALID/);
    assert.equal(calls.length,0);
  }
});

test("any 403, HTML clock mismatch, HTML changed or non-HTML response remains non-commercial",async()=>{
  for(const overrides of [
    {status:403},{type:"application/json"},{body:originalHtml("2026-10-10T04:00:00Z")},
    {body:originalHtml("2026-10-09T10:10:00Z")},
    {body:originalHtml("2026-10-10")},{body:"X".repeat(384*1024+1)},
  ]){
    const calls=[];
    const result=await run(originals,fakeFetch(calls,overrides));
    assert.equal(result.original_pages_authenticity_and_clock_verified,false);
    assert.equal(result.commercial_eligible,false);
    assert.equal(result.payment_authorized,false);
    assert.equal(result.raw_source_exposed,false);
  }
  const calls=[];
  const withHash=[{...originals[0],expected_html_sha256:sha("different")},
    originals[1]];
  const changed=await run(withHash,fakeFetch(calls));
  assert.equal(changed.results[0].reason,"ORIGINAL_HTML_HASH_CHANGED");
  assert.equal(changed.original_pages_authenticity_and_clock_verified,false);
});

test("legacy article URL fingerprint cannot be silently substituted for actual HTML hash",async()=>{
  const calls=[];
  const legacy=[{...originals[0],expected_html_sha256:sha(fedUrl)},
    originals[1]];
  const result=await run(legacy,fakeFetch(calls));
  assert.equal(result.results[0].reason,"ORIGINAL_HTML_HASH_CHANGED");
  assert.equal(result.commercial_eligible,false);
});

test("UK original review lead rescues genuine precise GOV.UK Content API clock and exact HTML SHA only",async()=>{
 const url="https://www.gov.uk/government/news/uk-government-publishes-new-critical-minerals-strategy";
 const at="2026-10-23T19:20:00.000Z";
 const actualNow=new Date("2026-10-23T19:50:00.000Z");
 const original={
  category:"rare_earth",original_article_url:url,original_published_at:at,
  originating_reporting_organization_id:"uk_fcdo"
 };
 const headline="UK government publishes new critical minerals strategy";
 const html="<html><head><meta property='article:modified_time' content='2026-10-23T19:40:00Z'></head><body><h1>"+headline+"</h1></body></html>";
 const json=JSON.stringify({base_path:new URL(url).pathname,title:headline,
  document_type:"news_story",first_published_at:at,
  public_updated_at:"2026-10-23T19:40:00Z"});
 const calls=[];
 const fetchImpl=async input=>{
  calls.push(String(input));
  if(String(input)===url)return new Response(html,{headers:{"content-type":"text/html"}});
  if(String(input)==="https://www.gov.uk/api/content"+new URL(url).pathname)
   return new Response(json,{headers:{"content-type":"application/json"}});
  throw Error("UNAPPROVED_HOST");
 };
 const result=await verifyGeomacroUnclaimedOriginalPage({original,now:actualNow,fetchImpl});
 assert.equal(result.accepted,true);
 assert.equal(result.original_article_sha256,sha(Buffer.from(html)));
 assert.equal(result.original_native_published_at,at);
 assert.equal(result.country_and_category_scope_review_pending,true);
 assert.equal(result.source_article_rights_verified,false);
 assert.equal(result.independent_corroboration_verified,false);
 assert.equal(result.signed_gro_created,false);
 assert.equal(result.payment_authorized,false);
 assert.equal(calls.length,2);
 assert.equal(Object.hasOwn(result,"original_article_url"),false);
 assert.equal(Object.hasOwn(result,"publisher_article_url"),false);
 const denied=await verifyGeomacroUnclaimedOriginalPage({
  original,now:actualNow,fetchImpl:async input=>{
   if(String(input)===url)return new Response(html,{headers:{"content-type":"text/html"}});
   return new Response(JSON.stringify({base_path:"/government/news/wrong",
    title:headline,document_type:"news_story",first_published_at:at}),
    {headers:{"content-type":"application/json"}});
  }
 });
 assert.equal(denied.accepted,false);
 assert.equal(denied.status,"ORIGINAL_NATIVE_CLOCK_NOT_PROVEN");
});
