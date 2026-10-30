import test from "node:test";
import assert from "node:assert/strict";
import {PHASE2H_COUNTRIES_195,phase2hHeadlineCountryCandidate}
 from "../lib/phase2h-country-originals-195.mjs";
import {planPhase2iOsintCountryFairRaw,stagePhase2iOsintFairRaw}
 from "../lib/phase2i-osint-country-fair-raw-staging.mjs";
const now=new Date("2026-10-30T12:00:00.000Z");
const cats=["geopolitics","macro","rare_earth"];
const derive=items=>items.map(item=>({
 category:item.category,published_at:item.publishedAt,
 topic:item.category==="rare_earth"?"lithium mineral supply":
  item.category==="macro"?"monetary policy rates":"trade sanctions",
 what_changed:"Issuer reports "+item.title,
 why_it_matters:"Observed issuer development concerns "+item.title+
  "; realized implications are not independently verified.",
}));
const mk=(country,category,i)=>({
 category,sourceId:"official_"+category,credit:null,
 title:country.name+" announces "+(category==="geopolitics"?"trade sanctions":
  category==="macro"?"monetary policy rates":"lithium mineral supply")+" notice",
 articleUrl:"https://official.example.org/news/"+i+"-"+category,
 publishedAt:"2026-10-30T10:00:00.000Z",
});
test("585 country/category cells all reach the fair private-D1 admission plan over delivered ticks",()=>{
 const candidates=PHASE2H_COUNTRIES_195.flatMap((country,i)=>
  cats.map(category=>mk(country,category,i)));
 const visited=new Set();
 for(let tick=0;tick<195;tick++){
  const date=new Date(now.getTime()+tick*900_000);
  const plan=planPhase2iOsintCountryFairRaw(candidates,
   {now:date,derive,maxRows:5});
  assert.equal(plan.available_originals,585);
  assert.equal(plan.selected_count,5);
  assert.equal(plan.selected_by_category.geopolitics,2);
  assert.equal(plan.selected_by_category.macro,2);
  assert.equal(plan.selected_by_category.rare_earth,1);
  assert.equal(plan.paid_eligible,false);
  for(const row of plan.records){
   const iso=phase2hHeadlineCountryCandidate(row.original.original_title);
   if(iso)visited.add(iso+":"+row.category);
  }
 }
 assert.equal(visited.size,585);
});
test("same immutable news key with inconsistent original bytes is quarantined, not a full-batch failure",()=>{
 const india=PHASE2H_COUNTRIES_195.find(c=>c.iso3==="IND");
 const base=mk(india,"macro",1);
 const x=planPhase2iOsintCountryFairRaw([base,{...base,title:"Different headline"},
  mk(india,"rare_earth",2)],{now,derive});
 assert.equal(x.same_original_ambiguous_dropped,1);
 assert.equal(x.selected_count,1);
 assert.equal(x.selected_by_category.macro,0);
 assert.equal(x.selected_by_category.rare_earth,1);
});
test("one real native-dated original is enough to generate five-part private structured research",()=>{
 const india=PHASE2H_COUNTRIES_195.find(c=>c.iso3==="IND");
 const plan=planPhase2iOsintCountryFairRaw([mk(india,"rare_earth",9)],{now,derive});
 assert.equal(plan.selected_count,1);
 const row=plan.records[0];
 assert.deepEqual(Object.keys(row.analysis).sort(),
 ["schema","what_happened","why_it_matters","market_relevance",
  "what_to_watch","evidence_and_confidence"].sort());
 assert.match(row.analysis.what_happened.text,/India announces lithium/u);
 assert.match(row.analysis.why_it_matters.text,/India announces lithium/u);
 assert.equal(row.analysis.evidence_and_confidence.paid_eligible,false);
 assert.equal(row.original.full_article_html_collected,false);
});
test("one immutable conflict cannot drop clean geopolitical or minerals originals",async()=>{
 const india=PHASE2H_COUNTRIES_195.find(c=>c.iso3==="IND");
 const c=cats.map((category,i)=>mk(india,category,i+30));
 const calls=[];
 const post=async({records})=>{
  calls.push(records.length);
  if(records.some(r=>r.category==="macro"))
   throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION");
  return {stored:records.length,duplicate:0,readback_verified:true};
 };
 const r=await stagePhase2iOsintFairRaw({candidates:c,derive,now,post});
 assert.equal(r.d1_inserted,2);
 assert.equal(r.d1_rejected_conflicts,1);
 assert.equal(r.rejected_conflicts_by_category.macro,1);
 assert.equal(r.d1_readback_verified,true);
 assert.equal(r.b2_verified,false);
 assert.ok(calls.length<=5);
});
test("all conflicts cannot fabricate a positive D1 receipt; unrelated failure still fatal",async()=>{
 const c=mk(PHASE2H_COUNTRIES_195.find(c=>c.iso3==="USA"),"macro",11);
 const bad=await stagePhase2iOsintFairRaw({candidates:[c],derive,now,
  post:async()=>{throw Error("PHASE2H_PRIVATE_RAW_IDENTITY_COLLISION")}});
 assert.equal(bad.d1_inserted,0);
 assert.equal(bad.d1_readback_verified,false);
 assert.equal(bad.status,"NO_POSITIVE_D1_READBACK");
 await assert.rejects(stagePhase2iOsintFairRaw({candidates:[c],derive,now,
  post:async()=>{throw Error("PHASE2H_PRIVATE_D1_PERSIST_UNAVAILABLE")}}),
  /PHASE2H_PRIVATE_D1_PERSIST_UNAVAILABLE/u);
});
