import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planSourceWebsiteHandoff,selectSourceWebsitePublicationCohort,SOURCE_WEBSITE_HANDOFF_LIMIT_PER_CATEGORY}
 from "../lib/source-only-website-handoff.mjs";
const now=new Date("2026-11-02T07:00:00.000Z");
const row=(i,category="geopolitics",at="2026-11-02T06:00:00.000Z")=>({
 category,title:"United Nations announces new sanctions measure "+i,
 articleUrl:"https://press.un.org/en/2026/sc"+i+".doc.htm",
 publishedAt:at,sourceUrl:"https://press.un.org/en/rss.xml",
});
test("fresh native original observations get bounded, newest-first source-private handoff",()=>{
 const rows=[...Array.from({length:140},(_,i)=>row(i+10)),
  ...Array.from({length:3},(_,i)=>row(i+100,"macro")),
  row(200,"rare_earth")];
 const h=planSourceWebsiteHandoff(rows,{now});
 assert.equal(SOURCE_WEBSITE_HANDOFF_LIMIT_PER_CATEGORY,120);
 assert.equal(h.rows.length,SOURCE_WEBSITE_HANDOFF_LIMIT_PER_CATEGORY+4);
 assert.deepEqual(Object.fromEntries(Object.entries(h.by_category).map(([k,v])=>[k,v.selected])),
   {geopolitics:120,macro:3,rare_earth:1});
 assert.equal(h.requires_full_research_admission,true);
 assert.equal(h.source_fetched_once,true);
});
test("expired/future/untrusted/same-key contradictory metadata cannot advance news clock",()=>{
 const good=row(3);
 const changed={...good,title:"United Nations contradicts first published event identity"};
 const h=planSourceWebsiteHandoff([good,changed,row(4,"macro","2026-10-29T01:00:00Z"),
  row(5,"macro","2026-11-03T01:00:00Z"),{...good,articleUrl:"http://example.com/bad"},
  row(6,"rare_earth")],{now});
 assert.equal(h.by_category.geopolitics.conflict_quarantined,1);
 assert.equal(h.by_category.geopolitics.selected,0);
 assert.equal(h.by_category.rare_earth.selected,1);
 assert.equal(h.stale_or_future_dropped,2);
 assert.ok(h.unsafe_dropped>=1);
});
test("existing source-only sweep remains source-only and research publisher is a separate guarded step",()=>{
 const script=readFileSync("scripts/ops/phase2i-source-only-raw-tick.ts","utf8");
 const publisher=readFileSync("scripts/ops/publish-source-only-website-derived.ts","utf8");
 const workflow=readFileSync(".github/workflows/private-global-osint-15m.yml","utf8");
 assert.match(script,/stagePhase2iOsintFairRaw/);
 assert.doesNotMatch(script,/publishPrivateOsintWebsiteSignals/);
 assert.match(script,/planSourceWebsiteHandoff/);
 assert.match(publisher,/publishPrivateOsintWebsiteSignals/);
 assert.match(workflow,/needs.quota-admission.outputs.research == 'true'/);
 assert.match(workflow,/needs.quota-admission.outputs.critical == 'true'/);
 assert.match(workflow,/bun scripts\/ops\/publish-source-only-website-derived.ts/);
 assert.match(workflow,/GEOMACRO_SOURCE_WEBSITE_HANDOFF:/);
 assert.match(workflow,/cron: "\*\/15 \* \* \* \*"/);
 assert.match(publisher,/canonicalOriginToken:token/);
 assert.match(publisher,/isPermanentArchiveSignal/);
 assert.match(publisher,/permanent-archive-candidates\.json/);
 assert.match(publisher,/PER_CATEGORY_LIMIT=12/);
 assert.match(workflow,/verifyConvergedPublicStaticArchiveReadback/);
 assert.match(workflow,/scripts\/ops\/publish-permanent-derived-news-archive\.mjs/);
 assert.match(workflow,/npx -y wrangler@4\.136\.3 deploy/);
 assert.match(workflow,/contents: write/);
 const lane=workflow.slice(workflow.indexOf("  collect-source-intake-only:"),
  workflow.indexOf("  stage-private-sources-when-d1-held:"));
 assert.match(lane,/if: needs\.quota-admission\.outputs\.critical == 'true' && needs\.quota-admission\.outputs\.research == 'true'/);
 assert.match(lane,/private source candidates after same-run projection/);
 assert.doesNotMatch(lane,/GEOMACRO_OSINT_RESEARCH_PRIVATE_ONLY: "0"/);

});

test("120 per-domain handoff stays bounded, preserves every native clock and rejects cross-category noise",()=>{
 const rows=["geopolitics","macro","rare_earth"].flatMap((c,i)=>
  Array.from({length:135},(_,n)=>row(1000+i*1000+n,c)));
 const result=planSourceWebsiteHandoff(rows,{now});
 assert.equal(result.rows.length,360);
 assert.equal(new Set(result.rows.map(x=>x.category+"|"+x.article_url+"|"+x.published_at)).size,360);
 assert.deepEqual(Object.fromEntries(Object.entries(result.by_category).map(([c,n])=>[c,n.selected])),
  {geopolitics:120,macro:120,rare_earth:120});
 assert.ok(result.rows.every(x=>x.published_at==="2026-11-02T06:00:00.000Z"));
 assert.equal(result.payments,0);
 assert.equal(result.predge_unchanged,true);
});


test("even under 400 newer same-category originals, older still-native 72h items rotate into publication",()=>{
 const initial=Array.from({length:400},(_,i)=>({
  ...row(i+4000,"geopolitics"),
  publishedAt:new Date(now.getTime()-(i+1)*60_000).toISOString()
 }));
 const first=planSourceWebsiteHandoff(initial,{now});
 const second=planSourceWebsiteHandoff(initial,{now:new Date(now.getTime()+900_000)});
 assert.equal(first.by_category.geopolitics.selected,120);
 assert.equal(first.by_category.geopolitics.newest_native_candidates,24);
 assert.equal(first.by_category.geopolitics.deferred_to_fresh_reobservation,280);
 assert.deepEqual(first.rows.slice(0,24).map(x=>x.article_url),
  second.rows.slice(0,24).map(x=>x.article_url));
 assert.ok(new Set([...first.rows,...second.rows].map(x=>x.article_url)).size>120);
 assert.equal(first.rows.filter(x=>x.category==="geopolitics").length,120);
 assert.ok(first.rows.every(x=>Date.parse(x.published_at)<=now.getTime()));
});

test("each domain publishes its newest four immediately while rotating eight older native IDs",()=>{
 const categories=["geopolitics","macro","rare_earth"];
 const lanes=categories.map((category,c)=>
   Array.from({length:90},(_,i)=>({
     id:category+"-"+(c*1000+i),category,
     published_at:new Date(now.getTime()-(i+1)*60_000).toISOString()
   })));
 const first=selectSourceWebsitePublicationCohort(lanes,now.getTime());
 const second=selectSourceWebsitePublicationCohort(lanes,now.getTime()+900_000);
 for(const category of categories){
   const original=lanes[categories.indexOf(category)];
   const a=first.filter(x=>x.category===category);
   const b=second.filter(x=>x.category===category);
   assert.equal(a.length,12);
   assert.equal(b.length,12);
   assert.deepEqual(a.slice(0,4).map(x=>x.id),original.slice(0,4).map(x=>x.id));
   assert.deepEqual(b.slice(0,4).map(x=>x.id),original.slice(0,4).map(x=>x.id));
   assert.ok(new Set([...a,...b].map(x=>x.id)).size>12);
 }
 assert.equal(first.length,36);
 assert.equal(new Set(first.map(x=>x.id)).size,36);
 assert.throws(()=>selectSourceWebsitePublicationCohort([],now.getTime()),
  /SOURCE_WEBSITE_PUBLICATION_INPUT_INVALID/);
});
test("official-derived selection is independently capped per category, never globally",()=>{
 const publisher=readFileSync("scripts/ops/publish-source-only-website-derived.ts","utf8");
 assert.match(publisher,/const officialSignals=CAT\.flatMap\(category=>/);
 assert.match(publisher,/official\.filter\(row=>row\.category===category\)/);
 assert.match(publisher,/selectSourceWebsitePublicationCohort\(lanes,Date\.now\(\)\)/);
});

test("real static readback runs even when the archive contains zero new IDs",()=>{
 const workflow=readFileSync(".github/workflows/private-global-osint-15m.yml","utf8");
 assert.match(workflow,/if: steps\.static-finds\.outcome == 'success'/);
 assert.match(workflow,/verified_even_on_no_new_ids:true/);
 assert.match(workflow,/GEOMACRO_STATIC_DEPLOY_NEEDED/);
 assert.match(workflow,/geomacro-permanent-finds-archive\/data\//);
});
