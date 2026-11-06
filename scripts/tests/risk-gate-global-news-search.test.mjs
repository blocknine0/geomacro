import test from "node:test";
import assert from "node:assert/strict";
import {RISK_DISCOVERY_PUBLISHER_GROUPS,riskPublisherSearchPlan,isPublisherFullTextRestricted}
 from "../../workers/control-plane/src/risk-gate-global-news-search.mjs";
const t={type:"COUNTRY",id:"IND",name:"India",category:"MACRO_FX"};
test("Google News global search rotates Reuters/ANI/other publishers without paid content ingestion",()=>{
 const first=riskPublisherSearchPlan(t,Date.parse("2026-11-06T00:00:00Z"));
 const query=new URL(first.url).searchParams.get("q");
 assert.match(query,/site:reuters\.com/);
 assert.match(query,/site:aninews\.in/);
 assert.match(query,/"central bank"/);
 assert.equal(first.discovery_only,true);
 assert.equal(first.commercial_reuse_authorized,false);
 assert.equal(first.independent_corroboration,false);
 const families=new Set();
 for(let i=0;i<6;i++){
  const x=riskPublisherSearchPlan(t,Date.parse("2026-11-06T00:00:00Z")+i*20*60000);
  families.add(x.search_family_index);
 }
 assert.equal(families.size,RISK_DISCOVERY_PUBLISHER_GROUPS.length);
});
test("all three categories use market-specific terms and restrict full-text wire fetch",()=>{
 for(const category of ["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]){
  const plan=riskPublisherSearchPlan({...t,category});
  assert.equal(new URL(plan.url).hostname,"news.google.com");
  assert.match(new URL(plan.url).searchParams.get("q"),/when:24h/);
 }
 for(const h of ["reuters.com","www.reuters.com","aninews.in","apnews.com","ft.com"])
  assert.equal(isPublisherFullTextRestricted(h),true);
 assert.equal(isPublisherFullTextRestricted("dw.com"),false);
 assert.throws(()=>riskPublisherSearchPlan({...t,name:"India \" OR site:evil.com"}),/INPUT_INVALID/);
});
