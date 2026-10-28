import test from "node:test";
import assert from "node:assert/strict";
import {planWebsiteNewsCatchup} from "../lib/website-news-canonical-reconciliation.mjs";
const now=Date.parse("2026-10-29T10:00:00.000Z");
const row=(id,at)=>({id,published_at:at,category:"macro",body:"derived"});
const valid=s=>Date.parse(s.published_at)>=now-72*3600_000;
test("reconciles missing live Website IDs without replaying existing journal IDs",()=>{
  const a=row("macro-abcdef01","2026-10-29T09:00:00.000Z");
  const b=row("macro-abcdef02","2026-10-29T08:00:00.000Z");
  const state=planWebsiteNewsCatchup([a,b],[a],now,valid);
  assert.deepEqual(state.missing,[b]);assert.equal(state.already_present,1);
  assert.equal(state.eligible_archive_ids,2);assert.equal(state.divergent_existing_ids,0);
});
test("does not backdate old archive rows to qualify for Predge 72h pilot",()=>{
  const old=row("macro-abcdef03","2026-10-20T09:00:00.000Z");
  assert.equal(planWebsiteNewsCatchup([old],[],now,valid).missing.length,0);
});
test("never hides conflicting IDs in archive or matching D1",()=>{
  const r=row("macro-abcdef01","2026-10-29T09:00:00.000Z");
  assert.throws(()=>planWebsiteNewsCatchup([r,{...r,body:"different"}],[],now,valid),/ARCHIVE_ID_CONFLICT/);
  const state=planWebsiteNewsCatchup([r],[{...r,body:"updated"}],now,valid);
  assert.equal(state.divergent_existing_ids,1);
});
test("does not write a 601st record to the canonical journal",()=>{
  const source=Array.from({length:600},(_,i)=>row("macro-"+i.toString(16).padStart(8,"0"),"2026-10-29T09:00:00.000Z"));
  assert.throws(()=>planWebsiteNewsCatchup(source,[row("extra","2026-10-29T09:00:00.000Z")],now,valid),/CAPACITY_UNVERIFIED/);
});
test("refuses malformed, duplicate or over-cap inputs",()=>{
  assert.throws(()=>planWebsiteNewsCatchup([],[],NaN,valid),/INPUT_INVALID/);
  const a=row("same","2026-10-29T09:00:00.000Z");
  assert.throws(()=>planWebsiteNewsCatchup([],[a,a],now,valid),/CANONICAL_INVALID/);
});
