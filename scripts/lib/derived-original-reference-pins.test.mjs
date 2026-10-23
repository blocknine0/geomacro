import test from "node:test";
import assert from "node:assert/strict";
import {pinnedDerivedOriginalReference} from "./derived-original-reference-pins.mjs";
import {auditEveryDerivedNewsOriginal} from "./all-news-original-evidence-audit.mjs";
const at="2026-10-24T00:00:00.000Z",now=new Date("2026-10-24T00:30:00Z");
const gov="https://www.gov.uk/government/news/critical-minerals-publication-test";
const candidate=(sourceId,category,articleUrl=gov)=>({sourceId,category,articleUrl,publishedAt:at});
test("all existing GOV.UK departments get their own category-bound LOW source path, not FCDO impersonation",()=>{
 for(const [sourceId,category] of [["uk_fcdo","geopolitics"],["uk_cabinet","geopolitics"],
  ["uk_mod","geopolitics"],["uk_ofsi_sanctions","geopolitics"],["uk_otsi_trade_sanctions","geopolitics"],
  ["uk_home","geopolitics"],["uk_treasury","macro"],["uk_dbt_macro","macro"],
  ["uk_dbt","rare_earth"],["uk_energy","rare_earth"],["govuk_global_minerals","rare_earth"]])
  assert.equal(pinnedDerivedOriginalReference(candidate(sourceId,category))?.href,gov);
 for(const ref of [candidate("uk_dbt","macro"),candidate("unregistered","rare_earth"),
  candidate("uk_energy","rare_earth",gov+"?redirect=evil"),
  candidate("uk_energy","rare_earth",gov.replace("www.gov.uk","www.gov.uk.evil.test")),
  candidate("uk_energy","rare_earth","https://www.gov.uk/api/content/government/news/forged"),
  candidate("uk_energy","rare_earth","https://www.gov.uk/government/news/%2fadmin")])
  assert.equal(pinnedDerivedOriginalReference(ref),null);
});
test("reuse existing global issuer pins rather than treating arbitrary official-looking hosts as originals",()=>{
 assert.ok(pinnedDerivedOriginalReference(candidate("bis_press","macro","https://www.bis.org/press/p261024.htm")));
 assert.ok(pinnedDerivedOriginalReference(candidate("un_press_global","geopolitics","https://press.un.org/en/2026/sc16314.doc.htm")));
 assert.equal(pinnedDerivedOriginalReference(candidate("bis_press","rare_earth","https://www.bis.org/press/p261024.htm")),null);
 assert.equal(pinnedDerivedOriginalReference(candidate("bis_press","macro","https://www.bis.org/index.htm")),null);
});
test("native Content API rescue counts against the same FOUR real request slots including HTML",async()=>{
 const input=[
  {id:"geopolitics-11111111",category:"geopolitics",sourceId:"un_news",url:"https://news.un.org/en/story/2026/10/1234567"},
  {id:"macro-11111111",category:"macro",sourceId:"fed_press",url:"https://www.federalreserve.gov/newsevents/pressreleases/monetary20261024a.htm"},
  {id:"rare_earth-11111111",category:"rare_earth",sourceId:"uk_dbt",url:gov},
  {id:"macro-22222222",category:"macro",sourceId:"ecb_press",url:"https://www.ecb.europa.eu/press/pr/date/2026/html/ecb.test1234.en.html"},
 ];
 const signals=input.map(r=>({id:r.id,category:r.category,published_at:at,date_precision:"exact",status:"official_release_observed_unscored"}));
 const originalRefs=new Map(input.map(r=>[r.id,candidate(r.sourceId,r.category,r.url)]));
 const calls=[];
 const audit=await auditEveryDerivedNewsOriginal({signals,originalRefs,now,fetchImpl:async(url,init)=>{
  calls.push(url);assert.equal(init.redirect,"error");assert.equal(init.method,"GET");
  if(url===gov)return new Response('<html><body><h1>Critical minerals publication test</h1></body></html>',{headers:{"content-type":"text/html"}});
  if(url==="https://www.gov.uk/api/content"+new URL(gov).pathname)
   return Response.json({title:"Critical minerals publication test",base_path:new URL(gov).pathname,document_type:"news_story",first_published_at:at});
  return new Response('<html><head><meta property="article:published_time" content="'+at+'"></head><body>Offline native timestamp fixture, not a real event.</body></html>',{headers:{"content-type":"text/html"}});
 }});
 assert.equal(calls.length,4);
 assert.equal(audit.bundled_source_quota.readbacks_used,4);
 assert.equal(audit.bundled_source_quota.protected_unused_reserve,2);
 assert.equal(audit.bundled_source_quota.reserve_touched,false);
 assert.equal(audit.exact_page_byte_rereads_attempted,3);
 assert.equal(audit.verified_original_page_bytes_and_native_time,3);
 assert.equal(audit.rows.find(r=>r.id==="macro-22222222").original_page_evidence_status,"ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA");
 for(const r of audit.rows){assert.equal(r.source_rights_verified,false);assert.equal(r.signed_commercial_input,false)}
});
