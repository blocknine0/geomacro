import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,it} from "node:test";
import assert from "node:assert/strict";
import {
 ARCHIVE_INDEX_SCHEMA,ARCHIVE_MONTH_SCHEMA,isPermanentArchiveSignal,
 publishPermanentDerivedNewsArchive,selectCurrentArchiveSignals,buildCurrentArchiveEligibility,
} from "./publish-permanent-derived-news-archive.mjs";

const NOW=Date.parse("2026-10-26T00:00:00.000Z");
const tempDirs=[];
function temp(){
 const root=mkdtempSync(join(tmpdir(),"geomacro-permanent-archive-"));
 tempDirs.push(root);
 const archiveDir=join(root,"archive-branch");
 const assetsDir=join(root,"assets");
 const candidatePath=join(root,"candidates.json");
 mkdirSync(join(archiveDir,"data"),{recursive:true});
 writeFileSync(join(archiveDir,"data","index.json"),JSON.stringify({
  schema:ARCHIVE_INDEX_SCHEMA,updated_at:null,months:[],
  categories:["geopolitics","macro","rare_earth"],seed_complete:false,total_signals:0,
 },null,2));
 return {root,archiveDir,assetsDir,candidatePath};
}
function signal(id,month="2026-10",category="macro"){
 const date=month==="2026-10"?"2026-10-25T18:00:00.000Z":"2026-09-10T18:00:00.000Z";
 return {
  id:category+"-"+id,title:"Geomacro finds the central bank announced a policy measure",
  what_changed:"The central bank announced a policy measure in a dated official release.",
  why_it_matters:"The policy announcement may affect the monitored macro context; market impact requires independent evidence.",
  topic:"monetary policy",geography:null,development_type:"monetary policy",
  published_at:date,date_precision:"exact",observed_release_count:1,sources_credited:[],
  status:"official_release_observed_unscored",same_event_corrob_verified:false,severity:null,
  category,
 };
}
function writeCandidates(path,signals){
 writeFileSync(path,JSON.stringify({
  schema:"geomacro.permanent-derived-news-candidates.v1",checked_at:new Date(NOW).toISOString(),
  source_sha:"a".repeat(40),signals,
 },null,2));
}
const failD1=async()=>new Response(JSON.stringify({ok:false,error:"quota"}),{status:503});
afterEach(()=>{for(const dir of tempDirs.splice(0))rmSync(dir,{recursive:true,force:true});});

describe("permanent derived-only website archive",()=>{
 it("round-robins current category records before applying the 250-row feed cap",()=>{
  const rows=[
   ...Array.from({length:300},(_,i)=>({...signal(i.toString(16).padStart(8,"0"),"2026-10","geopolitics"),
     title:"Geomacro finds geopolitical incident number "+i})),
   ...Array.from({length:70},(_,i)=>({...signal((1000+i).toString(16).padStart(8,"0"),"2026-10","macro"),
     title:"Geomacro finds economic release number "+i})),
   ...Array.from({length:14},(_,i)=>({...signal((2000+i).toString(16).padStart(8,"0"),"2026-10","rare_earth"),
     title:"Geomacro finds mineral output report number "+i})),
  ];
  const selected=selectCurrentArchiveSignals(rows,250);
  const counts={geopolitics:0,macro:0,rare_earth:0};
  for(const row of selected)counts[row.category]++;
  assert.equal(selected.length,250);
  assert.deepEqual(counts,{geopolitics:166,macro:70,rare_earth:14});
  assert.equal(new Set(selected.map(row=>row.id)).size,250);
  assert.deepEqual(selected,selected.slice().sort((a,b)=>
   b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id)));
 });
 it("counts all current concrete official stories beyond 250 while separating OSINT and stale records",()=>{
  const originals=Array.from({length:280},(_,i)=>({
    ...signal(i.toString(16).padStart(8,"0"),"2026-10","macro"),
    title:"Geomacro finds central bank policy measure number "+i,
  }));
  const osint={...signal("ffffffff","2026-10","rare_earth"),
    title:"Geomacro finds Chile copper supply report example",
    status:"osint_feed_observed_unverified",
    development_type:"unverified OSINT feed observation",
    sources_credited:["Monitored feed: example.org"]};
  const old={...signal("ffffeeee","2026-09","geopolitics"),
    title:"Geomacro finds historical geopolitics report example"};
  const current=[...originals,osint];
  const preview=selectCurrentArchiveSignals(current,250);
  const stats=buildCurrentArchiveEligibility([...current,old],NOW,preview);
  assert.equal(preview.length,250);
  assert.equal(stats.original_release_eligible_total,280);
  assert.equal(stats.free_displayable_findings_total,281);
  assert.equal(stats.free_displayable_outside_latest_preview,31);
  assert.equal(stats.free_displayable_by_category.rare_earth,1);
  assert.equal(stats.free_displayable_status,"MIXED_OFFICIAL_AND_EXPLICITLY_UNVERIFIED");
  assert.deepEqual(stats.original_release_by_category,{geopolitics:0,macro:280,rare_earth:0});
  assert.equal(stats.pending_osint_total,1);
  assert.equal(stats.eligible_outside_latest_preview,31);
  assert.equal(stats.unique_current_findings,281);
  assert.equal(stats.unverified_promoted,false);
  assert.equal(stats.paid_customer_eligible,false);
  assert.equal(stats.d1_reads,0);
 });
 it("drops generic OSINT placeholders from public latest but does not rewrite the archive",()=>{
  const real=signal("1111aaaa","2026-10","geopolitics");
  const template={...signal("2222bbbb","2026-10","geopolitics"),
   title:"Geomacro finds geopolitical publisher candidate source-feed observation",
   status:"osint_feed_observed_unverified"};
  const macro=signal("3333cccc","2026-10","macro");
  macro.title="Geomacro finds central bank set policy rate";
  const rare=signal("4444dddd","2026-10","rare_earth");
  rare.title="Geomacro finds Taiwan announced plans to build rare earths plant";
  const selected=selectCurrentArchiveSignals([template,real,macro,rare]);
  assert.deepEqual(selected.map(x=>x.id).sort(),[real.id,macro.id,rare.id].sort());
 });
 it("deduplicates normalized headlines across categories and prefers the matching domain",()=>{
  const geo={...signal("1111aaaa","2026-10","geopolitics"),
   title:"Geomacro finds Bulgaria held a presidential election dominated by economic hardship, Ukraine war - The Tribune-Democrat",
   status:"osint_feed_observed_unverified"};
  const macro={...signal("2222bbbb","2026-10","macro"),
   title:"Geomacro finds Bulgaria held a presidential election dominated by economic hardship, Ukraine war",
   status:"osint_feed_observed_unverified"};
  const rare1={...signal("3333cccc","2026-10","rare_earth"),
   title:"Geomacro finds Taiwan announced plans to build rare earths plant"};
  const rare2={...signal("4444dddd","2026-10","rare_earth"),
   title:"Geomacro finds Taiwan announced plans to build rare earths plant"};
  const selected=selectCurrentArchiveSignals([geo,macro,rare1,rare2]);
  assert.equal(selected.length,2);
  assert.ok(selected.some(x=>x.id===geo.id));
  assert.ok(!selected.some(x=>x.id===macro.id));
  assert.ok(selected.some(x=>x.id===rare1.id||x.id===rare2.id));
 });
 it("treats only the exact Google News aggregator credit as aggregator-only",()=>{
  const aggregator={...signal("1111aaaa","2026-10","macro"),
    title:"Geomacro finds central bank announced new monetary policy",
    status:"osint_feed_observed_unverified",
    development_type:"unverified OSINT feed observation",
    sources_credited:["Monitored feed: news.google.com (aggregator; original publisher not verified)"]};
  const directHost={...aggregator,id:"macro-2222bbbb",
    sources_credited:["Monitored feed: news.google.com.evil.example"]};
  const selected=selectCurrentArchiveSignals([aggregator,directHost]);
  assert.equal(selected.length,1);
  assert.equal(selected[0].id,directHost.id);
 });
 it("rejects duplicate IDs and invalid category limits in current-feed selection",()=>{
  const duplicate=signal("1234abcd","2026-10","macro");
  assert.throws(()=>selectCurrentArchiveSignals([duplicate,{...duplicate}],250),
   /PERMANENT_ARCHIVE_LATEST_INPUT_INVALID/);
  assert.throws(()=>selectCurrentArchiveSignals([duplicate],251),
   /PERMANENT_ARCHIVE_LATEST_SELECTION_INVALID/);
 });
 it("keeps old signals forever and adds new signals without D1",async()=>{
  const p=temp();
  writeCandidates(p.candidatePath,[signal("1234abcd")]);
  const result=await publishPermanentDerivedNewsArchive({...p,fetchImpl:failD1,now:NOW});
  assert.equal(result.deploy_needed,true);
  assert.equal(result.new_signals_added,1);
  assert.equal(result.seed_complete,false);
  const month=JSON.parse(readFileSync(join(p.archiveDir,"data/archive/2026-10/macro.json"),"utf8"));
  assert.equal(month.schema,ARCHIVE_MONTH_SCHEMA);
  assert.equal(month.signals.length,1);
  const latest=JSON.parse(readFileSync(join(p.assetsDir,"latest.json"),"utf8"));
  assert.equal(latest.signals.length,1);
  const coverage=JSON.parse(readFileSync(join(p.assetsDir,"coverage-72h.json"),"utf8"));
  assert.equal(coverage.original_release_eligible_total,1);
  assert.equal(coverage.latest_preview_rows,1);
  assert.equal(coverage.paid_customer_eligible,false);
 });
 it("does not expire historical archive items when a later daily batch arrives",async()=>{
  const p=temp();
  writeCandidates(p.candidatePath,[signal("1234abcd")]);
  await publishPermanentDerivedNewsArchive({...p,fetchImpl:failD1,now:NOW});
  const later=NOW+40*24*60*60_000;
  const next={...signal("5678abcd"),published_at:new Date(later-60*60_000).toISOString()};
  writeCandidates(p.candidatePath,[next]);
  const result=await publishPermanentDerivedNewsArchive({...p,fetchImpl:failD1,now:later});
  assert.equal(result.new_signals_added,1);
  assert.equal(result.total_signals,2);
  const index=JSON.parse(readFileSync(join(p.archiveDir,"data/index.json"),"utf8"));
  assert.deepEqual(index.months,["2026-12","2026-10"]);
  assert.equal(index.total_signals,2);
 });
 it("never appends generic OSINT publisher placeholders to the permanent archive",async()=>{
  const p=temp();
  const real=signal("1234abcd","2026-10","macro");
  real.title="Geomacro finds central bank announced a new policy rate";
  const template={...signal("9999eeee","2026-10","geopolitics"),
   title:"Geomacro finds geopolitical publisher candidate source-feed observation",
   topic:"geopolitical publisher candidate",
   development_type:"unverified OSINT feed observation",
   status:"osint_feed_observed_unverified",
   sources_credited:["Monitored feed: example.net"]};
  const nonconcreteOfficial={...signal("8888dddd","2026-10","geopolitics"),
   title:"Geomacro finds official update on border policy",
   topic:"geopolitical security",
   development_type:"official update",
   what_changed:"The dated original release concerns border policy. The published headline does not establish a named actor performing a verifiable action; no outcome is inferred.",
   status:"official_release_observed_unscored"};
  writeCandidates(p.candidatePath,[template,nonconcreteOfficial,real]);
  const result=await publishPermanentDerivedNewsArchive({...p,fetchImpl:failD1,now:NOW});
  assert.equal(result.new_signals_added,1);
  assert.equal(result.total_signals,1);
  const month=JSON.parse(readFileSync(join(p.archiveDir,"data/archive/2026-10/macro.json"),"utf8"));
  assert.equal(month.signals.length,1);
  assert.equal(month.signals[0].id,real.id);
  const latest=JSON.parse(readFileSync(join(p.assetsDir,"latest.json"),"utf8"));
  assert.deepEqual(latest.signals.map(row=>row.id),[real.id]);
 });
 it("does not overwrite a previously published ID with changed prose",async()=>{
  const p=temp();
  writeCandidates(p.candidatePath,[signal("1234abcd")]);
  await publishPermanentDerivedNewsArchive({...p,fetchImpl:failD1,now:NOW});
  const changed={...signal("1234abcd"),what_changed:"A different later wording does not replace the item already published in the archive."};
  writeCandidates(p.candidatePath,[changed,signal("5678abcd")]);
  const result=await publishPermanentDerivedNewsArchive({...p,fetchImpl:failD1,now:NOW});
  assert.equal(result.new_signals_added,1);
  const month=JSON.parse(readFileSync(join(p.archiveDir,"data/archive/2026-10/macro.json"),"utf8"));
  assert.equal(month.signals.length,2);
  assert.equal(month.signals.find(s=>s.id.endsWith("1234abcd")).what_changed,
    "The central bank announced a policy measure in a dated official release.");
 });
 it("rejects incoming stories older than the 72-hour publication gate but retains them once archived",()=>{
  const old=signal("1234abcd","2026-09");
  assert.equal(isPermanentArchiveSignal(old,NOW,{allowHistorical:false}),false);
  assert.equal(isPermanentArchiveSignal(old,NOW,{allowHistorical:true}),true);
 });
 it("fails closed instead of silently dropping a corrupt previously published shard",async()=>{
  const p=temp();
  writeCandidates(p.candidatePath,[signal("1234abcd")]);
  await publishPermanentDerivedNewsArchive({...p,fetchImpl:failD1,now:NOW});
  writeFileSync(join(p.archiveDir,"data/archive/2026-10/macro.json"),"{broken");
  writeCandidates(p.candidatePath,[signal("5678abcd")]);
  await assert.rejects(()=>publishPermanentDerivedNewsArchive({...p,fetchImpl:failD1,now:NOW}),
    /PERMANENT_ARCHIVE_MONTH_INVALID/);
 });
});
