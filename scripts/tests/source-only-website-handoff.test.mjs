import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {planSourceWebsiteHandoff,SOURCE_WEBSITE_HANDOFF_LIMIT_PER_CATEGORY}
 from "../lib/source-only-website-handoff.mjs";
const now=new Date("2026-11-02T07:00:00.000Z");
const row=(i,category="geopolitics",at="2026-11-02T06:00:00.000Z")=>({
 category,title:"United Nations announces new sanctions measure "+i,
 articleUrl:"https://press.un.org/en/2026/sc"+i+".doc.htm",
 publishedAt:at,sourceUrl:"https://press.un.org/en/rss.xml",
});
test("fresh native original observations get bounded, newest-first source-private handoff",()=>{
 const rows=[...Array.from({length:50},(_,i)=>row(i+10)),
  ...Array.from({length:3},(_,i)=>row(i+100,"macro")),
  row(200,"rare_earth")];
 const h=planSourceWebsiteHandoff(rows,{now});
 assert.equal(h.rows.length,SOURCE_WEBSITE_HANDOFF_LIMIT_PER_CATEGORY+4);
 assert.deepEqual(Object.fromEntries(Object.entries(h.by_category).map(([k,v])=>[k,v.selected])),
   {geopolitics:40,macro:3,rare_earth:1});
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
});
