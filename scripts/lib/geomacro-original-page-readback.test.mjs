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


const officialNow=new Date("2026-10-24T11:00:00Z");
const exactTime="2026-10-24T10:22:00.000Z";
const officialReleaseBody=(at=exactTime)=>'<html><head>'+
  '<meta property="article:published_time" content="'+at+'">'+
  '</head><body><h1>Official statement on developments</h1></body></html>';
const institutional=[
 {category:"geopolitics",org:"un_geneva",
  url:"https://www.ungeneva.org/en/news-media/press-release/2026/10/security-council-meeting-summary"},
 {category:"geopolitics",org:"eu_council",
  url:"https://www.consilium.europa.eu/en/press/press-releases/2026/10/24/council-adopts-new-sanctions/"},
 {category:"rare_earth",org:"us_doe",
  url:"https://www.energy.gov/articles/critical-minerals-supply-chain-announcement"},
];
test("already registered institutional original HTML routes reach exact private byte/clock readback",async()=>{
 for(const issuer of institutional){
  let count=0,endpoint;
  const r=await verifyGeomacroUnclaimedOriginalPage({now:officialNow,
   original:{category:issuer.category,
    originating_reporting_organization_id:issuer.org,
    original_article_url:issuer.url,original_published_at:exactTime},
   fetchImpl:async(url,init)=>{
    endpoint=String(url);count++;
    assert.equal(init.method,"GET");
    assert.equal(init.redirect,"error");
    return new Response(officialReleaseBody(),
     {headers:{"content-type":"text/html"}});
   }});
  assert.equal(endpoint,issuer.url);
  assert.equal(count,1);
  assert.equal(r.accepted,true);
  assert.equal(r.original_native_published_at,exactTime);
  assert.equal(r.original_article_sha256,sha(officialReleaseBody()));
  assert.equal(r.source_article_rights_verified,false);
  assert.equal(r.facts_signature_verified,false);
  assert.equal(r.rights_signature_verified,false);
  assert.equal(r.payment_authorized,false);
  assert.doesNotMatch(JSON.stringify(r),/ungeneva\.org|energy\.gov|consilium\.europa\.eu/);
 }
});
test("distinct UN Geneva and EU Council original pages are still not commercial same-event review",async()=>{
 let requests=0;
 const proof=await verifyGeomacroOriginalPages({
  now:officialNow,
  originals:institutional.slice(0,2).map(issuer=>({
   category:"geopolitics",same_event_claim_sha256:claim,
   originating_reporting_organization_id:issuer.org,
   original_article_url:issuer.url,original_published_at:exactTime,
   reporting_position:"confirms",
  })),
  fetchImpl:async()=>{requests++;return new Response(officialReleaseBody(),
    {headers:{"content-type":"text/html"}});}
 });
 assert.equal(requests,2);
 assert.equal(proof.original_pages_authenticity_and_clock_verified,true);
 assert.equal(proof.licensed_commercial_use_verified,false);
 assert.equal(proof.source_content_match_claim_semantically_verified,false);
 assert.equal(proof.external_independent_reviewer_attested,false);
 assert.equal(proof.signed_gro_verified,false);
 assert.equal(proof.payment_authorized,false);
});
test("new exact institutional pins never admit feed index, other host, old story or misleading updated clock",async()=>{
 const bad=[
  {...institutional[0],url:"https://www.ungeneva.org/news-media/press-releases-list/rss.xml"},
  {...institutional[0],url:"https://www.ungeneva.org/en/news-media/press-release/2026/10/security-council-meeting-summary?tracking=1"},
  {...institutional[1],url:"https://www.consilium.europa.eu/en/rss/pressreleases.ashx"},
  {...institutional[1],url:"https://www.consilium.europa.eu/en/press/press-releases/2026/10/24/council-adopts-new-sanctions"},
  {...institutional[2],url:"https://www.energy.gov/rss/energygov/2193718"},
  {...institutional[2],url:"https://www.energy.gov.invalid/articles/critical-minerals-supply-chain-announcement"},
  {...institutional[0],org:"eu_council"},
  {...institutional[2],category:"macro"},
 ];
 for(const issuer of bad){
  let requests=0;
  await assert.rejects(verifyGeomacroUnclaimedOriginalPage({
   now:officialNow,
   original:{category:issuer.category,original_article_url:issuer.url,
    originating_reporting_organization_id:issuer.org,original_published_at:exactTime},
   fetchImpl:async()=>{requests++;return new Response(officialReleaseBody(),
      {headers:{"content-type":"text/html"}});}
  }),/GEOMACRO_PRIVATE_PAGE_READBACK_INPUT_INVALID/);
  assert.equal(requests,0);
 }
 let requested=0;
 const missingNative=await verifyGeomacroUnclaimedOriginalPage({
  now:officialNow,
  original:{category:"geopolitics",original_article_url:institutional[0].url,
   originating_reporting_organization_id:"un_geneva",original_published_at:exactTime},
  fetchImpl:async()=>{requested++;return new Response('<html><h1>News statement</h1>'+
   '<meta property="article:modified_time" content="'+exactTime+'"></html>',
   {headers:{"content-type":"text/html"}});}
 });
 assert.equal(requested,1);
 assert.equal(missingNative.accepted,false);
 assert.equal(missingNative.status,"ORIGINAL_NATIVE_CLOCK_NOT_PROVEN");
 assert.equal(missingNative.source_article_rights_verified,false);
});
