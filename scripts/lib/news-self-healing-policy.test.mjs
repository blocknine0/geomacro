import test from "node:test";
import assert from "node:assert/strict";
import {planNewsSelfHeal,decideSelfHealDispatch} from "./news-self-healing-policy.mjs";
const NOW=Date.parse("2026-11-02T01:00:00.000Z");
const T=new Date(NOW-60_000).toISOString();
const categories=["geopolitics","macro","rare_earth"];
const row=(category,id,when=new Date(NOW-5*3600_000).toISOString())=>({
 id:category+"-"+id,category,published_at:when,date_precision:"exact",
 status:"osint_feed_observed_unverified"
});
function sample(){
 const signals=categories.map((c,i)=>row(c,String(i+1).padStart(8,"0")));
 const archive={
  index:{schema:"geomacro.permanent-derived-news-archive-index.v1",
   updated_at:T,total_signals:100},
  latest:{ok:true,schema:"geomacro.website-derived-news-feed.v1",
   checked_at:T,retention_hours:72,chargeable:false,scored:false,
   supabase_dependency:false,signals},
  coverage:{schema:"geomacro.free-derived-archive-eligibility.v1",
   checked_at:T,paid_customer_eligible:false,free_displayable_outside_latest_preview:0},
  daily:{schema:"geomacro.public-daily-official-finds.v1",
   generated_at:T,chargeable:false,official_only:true,signals:[]}
 };
 const journal={ok:true,schema:"geomacro.website-derived-news-bundle.v1",
  complete:true,item_cap:600,signals:signals.map(x=>({...x})),returned_rows:3,
  first_ingest:signals.map(x=>({id:x.id,first_seen_at:new Date(NOW-4*3600_000).toISOString()}))};
 return {archive,archiveAvailable:true,d1:journal,d1Available:true,
  researchAllowed:true,websiteOk:true,now:NOW,
  classifyDisplay:()=>null,isArchiveEligible:()=>true};
}
test("real coherent D1/archive/site status stays no action",()=>{
 const d=planNewsSelfHeal(sample());
 assert.equal(d.status,"HEALTHY");assert.equal(d.workflow,null);
});
test("expired archive auto-requests static Worker deployment without D1 budget",()=>{
 const s=sample();s.archive.latest.checked_at=new Date(NOW-5*3600_000).toISOString();
 s.archive.coverage.checked_at=s.archive.latest.checked_at;
 s.archive.daily.generated_at=s.archive.latest.checked_at;
 s.archive.index.updated_at=s.archive.latest.checked_at;
 s.researchAllowed=false;
 const d=planNewsSelfHeal(s);
 assert.equal(d.status,"RECOVER");
 assert.equal(d.workflow,"deploy-permanent-public-finds-archive.yml");
 assert.equal(d.reason,"STATIC_CLOCK_EXPIRED");
});
test("D1-backlog >90m triggers existing hourly reconciling publisher, never new writer",()=>{
 const s=sample();
 const extra=row("rare_earth","abcdef12");
 s.d1.signals.push(extra);s.d1.returned_rows++;
 s.d1.first_ingest.push({id:extra.id,first_seen_at:new Date(NOW-110*60_000).toISOString()});
 const d=planNewsSelfHeal(s);
 assert.equal(d.workflow,"website-derived-news-continuity.yml");
 assert.deepEqual(d.counts,{geopolitics:0,macro:0,rare_earth:1});
 const quota=planNewsSelfHeal({...s,researchAllowed:false});
 assert.equal(quota.status,"HELD");assert.equal(quota.workflow,null);
});
test("fresh D1 not re-dispatched before complete bounded cycle",()=>{
 const s=sample();const extra=row("macro","abcdef12");
 s.d1.signals.push(extra);s.d1.returned_rows++;
 s.d1.first_ingest.push({id:extra.id,first_seen_at:new Date(NOW-65*60_000).toISOString()});
 assert.equal(planNewsSelfHeal(s).status,"HEALTHY");
});
test("immutable ID mismatch, truncated preview, bogus cohort fail closed",()=>{
 const s=sample();s.d1.signals[0].published_at=new Date(NOW-4*3600_000).toISOString();
 assert.equal(planNewsSelfHeal(s).reason,"IMMUTABLE_ID_CONFLICT");
 const preview=sample();preview.archive.coverage.free_displayable_outside_latest_preview=1;
 assert.equal(planNewsSelfHeal(preview).reason,"ARCHIVE_PREVIEW_INCOMPLETE");
 const mismatched=sample();mismatched.archive.daily.generated_at=new Date(NOW-2*3600_000).toISOString();
 assert.equal(planNewsSelfHeal(mismatched).workflow,"deploy-permanent-public-finds-archive.yml");
});
test("unknown D1 status and isolated website failure never mutate infrastructure",()=>{
 const s=sample();s.d1Available=false;assert.equal(planNewsSelfHeal(s).status,"BLOCKED");
 const site=sample();site.websiteOk=false;
 assert.equal(planNewsSelfHeal(site).reason,"WEBSITE_RENDER_UNAVAILABLE");
});
test("in-flight writer, cooldown and six-hour circuit prevent retry storms",()=>{
 const d=planNewsSelfHeal({archiveAvailable:false,now:NOW,researchAllowed:false});
 assert.equal(decideSelfHealDispatch(d,[],NOW).dispatch,true);
 const when=t=>new Date(NOW-t*60_000).toISOString();
 assert.equal(decideSelfHealDispatch(d,[{status:"in_progress",created_at:when(20),event:"schedule"}],NOW).reason,"EXISTING_RECOVERY_OR_WRITER_RUNNING");
 assert.equal(decideSelfHealDispatch(d,[{status:"completed",created_at:when(70),event:"workflow_dispatch"}],NOW).reason,"RECOVERY_DISPATCH_2H_COOLDOWN");
 assert.equal(decideSelfHealDispatch(d,Array.from({length:3},(_,i)=>({
  status:"completed",created_at:when(140+i*60),event:"workflow_dispatch"})),NOW).reason,"RECOVERY_CIRCUIT_OPEN_6H");
 assert.equal(decideSelfHealDispatch(d,[{status:"completed",created_at:when(15),event:"schedule"}],NOW).reason,"RECENT_WRITER_SETTLING");
 assert.equal(decideSelfHealDispatch(d,null,NOW).dispatch,false);
});
