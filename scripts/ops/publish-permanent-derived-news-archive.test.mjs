import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach,describe,it} from "node:test";
import assert from "node:assert/strict";
import {
 ARCHIVE_INDEX_SCHEMA,ARCHIVE_MONTH_SCHEMA,isPermanentArchiveSignal,
 publishPermanentDerivedNewsArchive,
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
