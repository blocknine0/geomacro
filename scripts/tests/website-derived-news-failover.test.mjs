import {test} from "node:test";
import {strict as assert} from "node:assert";
import {decideWebsiteNewsBackstop,BACKSTOP_AFTER_MS} from "../lib/website-derived-news-failover.mjs";
const NOW=Date.parse("2026-10-13T08:22:00.000Z");
const success=(at)=>({
  status:"completed", conclusion:"success",head_branch:"main",updated_at:at,
});
test("no unnecessary repeat publisher call while primary collection is timely",()=>{
  const decision=decideWebsiteNewsBackstop([success("2026-10-13T08:07:00.000Z")],NOW);
  assert.equal(decision.should_run,false);
  assert.equal(decision.reason,"PUBLISHER_SUCCESS_RECENT");
  assert.equal(decision.age_minutes,15);
});
test("missed half-hour primary 08:07 causes source backup at 08:22",()=>{
  const decision=decideWebsiteNewsBackstop([
    success("2026-10-13T07:37:00.000Z"),
    {status:"completed",conclusion:"failure",head_branch:"main",updated_at:"2026-10-13T08:08:00Z"},
    {status:"in_progress",conclusion:null,head_branch:"main",updated_at:"2026-10-13T08:21:00Z"},
  ],NOW);
  assert.equal(decision.should_run,true);
  assert.equal(decision.reason,"PUBLISHER_SUCCESS_STALE");
  assert.equal(decision.age_minutes,45);
});
test("old push run does not disguise an unattended scheduler lapse",()=>{
  const decision=decideWebsiteNewsBackstop([
    success("2026-10-13T01:14:00Z"),
    {status:"completed",conclusion:"skipped",head_branch:"main",updated_at:"2026-10-13T08:05:00Z"},
  ],NOW);
  assert.equal(decision.should_run,true);
  assert.ok(decision.age_minutes>420);
});
test("never accept another branch, a failed check, unknown date or future success",()=>{
  const rows=[
    {...success("2026-10-13T08:10:00Z"),head_branch:"fix/fake"},
    {...success("2026-10-13T08:11:00Z"),conclusion:"failure"},
    {...success("invalid"),updated_at:"invalid"},
    {...success("2026-10-14T08:20:00Z")},
  ];
  const d=decideWebsiteNewsBackstop(rows,NOW);
  assert.equal(d.should_run,true);
  assert.equal(d.reason,"NO_CONFIRMED_SUCCESS");
  assert.equal(d.last_success_at,null);
  assert.equal(d.guaranteed,false);
});
test("exact threshold enables backup and preserves true success time",()=>{
  const at=NOW-BACKSTOP_AFTER_MS;
  const decision=decideWebsiteNewsBackstop([success(new Date(at).toISOString())],NOW);
  assert.equal(decision.should_run,true);
  assert.equal(decision.last_success_at,new Date(at).toISOString());
});
test("a branch-run not completed is not false evidence and missing list fails safely",()=>{
  assert.equal(decideWebsiteNewsBackstop([],NOW).should_run,true);
  assert.throws(()=>decideWebsiteNewsBackstop(null,NOW),/INPUT_INVALID/);
  assert.throws(()=>decideWebsiteNewsBackstop([],Number.NaN),/INPUT_INVALID/);
});
