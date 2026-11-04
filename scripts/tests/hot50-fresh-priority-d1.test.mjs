import test from "node:test";
import assert from "node:assert/strict";
import {planPhase2iOsintCountryFairRaw}
 from "../lib/phase2i-osint-country-fair-raw-staging.mjs";
import {PHASE2H_COUNTRIES_195,phase2hHeadlineCountryCandidate}
 from "../lib/phase2h-country-originals-195.mjs";
import {HOT50_COUNTRY_SET} from "../lib/hot-50-country-watch.mjs";
const now=new Date("2026-11-04T04:00:00.000Z");
const countries=new Map(PHASE2H_COUNTRIES_195.map(c=>[c.iso3,c]));
const cats=["geopolitics","macro","rare_earth"];
const titles={geopolitics:"trade sanctions",macro:"monetary policy rates",
 rare_earth:"critical minerals lithium supply"};
const mk=(country,category,n,at=new Date(now.getTime()-120*60_000).toISOString())=>({
 category,sourceId:"official_"+category,credit:null,
 title:countries.get(country).name+" announces "+titles[category]+" "+n,
 articleUrl:"https://original-publisher.example.org/news/"+country+"/"+category+"/"+n,
 publishedAt:at,sourceUrl:"https://original-publisher.example.org/rss",
 issuerContextCountryIso3:null,
});
const key=c=>JSON.stringify([c.category,c.articleUrl,c.publishedAt]);
const derive=rows=>rows.map(c=>({
 category:c.category,published_at:c.publishedAt,
 topic:titles[c.category],
 what_changed:"Original publisher reports "+c.title,
 why_it_matters:"Reported policy release requires verification: "+c.title,
}));
const country=row=>phase2hHeadlineCountryCandidate(row.original.original_title);
test("native-20min eligible newly observed Hot-50 originals receive first D1 seats in each of three categories",()=>{
 const observed=[],backlogged=[];
 for(const cat of cats){
  backlogged.push(mk("UGA",cat,10));
  backlogged.push(mk("AFG",cat,11));
  observed.push(mk("IND",cat,20,new Date(now.getTime()-3*60_000).toISOString()));
  observed.push(mk("USA",cat,21,new Date(now.getTime()-6*60_000).toISOString()));
 }
 const all=[...backlogged,...observed];
 const plan=planPhase2iOsintCountryFairRaw(all,{
  now,derive,maxRows:5,priorityMode:"HOT50_FRESH_FIRST",
  observedThisTickKeys:new Set(observed.map(key)),
 });
 assert.equal(plan.selected_count,5);
 assert.equal(plan.selected_native_last_20m,5);
 assert.equal(plan.selected_hot50_title_or_primary_issuer_hints,5);
 assert.deepEqual(plan.selected_by_category,{geopolitics:2,macro:2,rare_earth:1});
 assert.ok(plan.records.every(x=>HOT50_COUNTRY_SET.has(country(x))));
 assert.equal(plan.deferred_count,7);
 assert.equal(plan.source_priority_mode,"HOT50_FRESH_FIRST");
 assert.equal(plan.paid_eligible,false);
 assert.equal(plan.commercial_rights_verified,false);
});
test("never use publication clock beyond actual native time and never overwrite validated backlog",()=>{
 const old=mk("IND","macro",40,new Date(now.getTime()-21*60_000).toISOString());
 const near=mk("UGA","macro",41,new Date(now.getTime()-4*60_000).toISOString());
 const plan=planPhase2iOsintCountryFairRaw([old,near],{
  now,derive,maxRows:5,priorityMode:"HOT50_FRESH_FIRST",
  observedThisTickKeys:new Set([key(old),key(near)]),
 });
 assert.equal(plan.selected_count,2);
 assert.ok(plan.records[0].original.original_url.includes("/UGA/"));
 assert.ok(plan.records[1].original.original_url.includes("/IND/"));
 assert.equal(plan.selected_native_last_20m,1);
 assert.equal(plan.selected_hot50_title_or_primary_issuer_hints,1);
});
test("unobserved historical originals remain eligible when actual source tick has no fresh items",()=>{
 const all=cats.map((cat,i)=>mk("IND",cat,60+i));
 const plan=planPhase2iOsintCountryFairRaw(all,{
  now,derive,maxRows:5,priorityMode:"HOT50_FRESH_FIRST",
  observedThisTickKeys:new Set(),
 });
 assert.equal(plan.selected_count,3);
 assert.equal(plan.selected_native_last_20m,0);
 assert.equal(plan.deferred_count,0);
 assert.deepEqual(plan.selected_by_category,{geopolitics:1,macro:1,rare_earth:1});
});
test("authenticated prior D1 originals are never re-admitted even if newly observed on the next source tick",()=>{
 const acknowledged=mk("USA","geopolitics",71,
  new Date(now.getTime()-60_000).toISOString());
 const newOne=mk("IND","geopolitics",72,
  new Date(now.getTime()-60_000).toISOString());
 const plan=planPhase2iOsintCountryFairRaw([
  {...acknowledged,d1Acknowledged:true},newOne],{
  now,derive,maxRows:5,priorityMode:"HOT50_FRESH_FIRST",
  observedThisTickKeys:new Set([key(acknowledged),key(newOne)]),
 });
 assert.equal(plan.selected_count,1);
 assert.ok(plan.records[0].original.original_url.includes("/IND/"));
 assert.equal(plan.already_d1_verified_excluded,1);
});
test("unrecognized admission mode fails closed; existing country-fair default mode stays supported",()=>{
 const item=mk("IND","rare_earth",80);
 assert.throws(()=>planPhase2iOsintCountryFairRaw([item],{
  now,derive,priorityMode:"UNVERIFIED_BATCH_ALL",
 }),/PHASE2I_OSINT_RAW_PLAN_INVALID/);
 assert.equal(planPhase2iOsintCountryFairRaw([item],{now,derive}).source_priority_mode,"ROTATING_ALL");
});
