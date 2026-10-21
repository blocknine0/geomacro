import test from "node:test";
import assert from "node:assert/strict";
import {
 createBundledOriginalReadbackBudget,bundleRoundRobinNews,
 ORIGINAL_BUNDLE_HARD_CEILING,ORIGINAL_BUNDLE_NORMAL_ALLOWANCE,
 ORIGINAL_BUNDLE_RESERVE,ORIGINAL_BUNDLE_PER_HOST_MAX,
} from "./bundled-original-source-quota.mjs";

test("pool reserves 2 of 6 physical reads and rejects the 5th, without emitting issuers",()=>{
 assert.deepEqual([ORIGINAL_BUNDLE_HARD_CEILING,ORIGINAL_BUNDLE_NORMAL_ALLOWANCE,
  ORIGINAL_BUNDLE_RESERVE,ORIGINAL_BUNDLE_PER_HOST_MAX],[6,4,2,1]);
 const b=createBundledOriginalReadbackBudget();
 for(const h of ["first.gov","second.gov","third.gov","fourth.gov"])
  assert.equal(b.admit(h),true);
 assert.equal(b.admit("fifth.gov"),false);
 const receipt=b.snapshot();
 assert.equal(receipt.readbacks_used,4);
 assert.equal(receipt.normal_remaining,0);
 assert.equal(receipt.protected_unused_reserve,2);
 assert.equal(receipt.reserve_touched,false);
 assert.equal(receipt.upstream_daily_quota_independently_verified,false);
 assert.equal(JSON.stringify(receipt).includes("first.gov"),false);
});
test("no repeated request to same government host in one run",()=>{
 const b=createBundledOriginalReadbackBudget();
 assert.equal(b.admit("www.federalreserve.gov"),true);
 assert.equal(b.admit("www.federalreserve.gov"),false);
 assert.equal(b.admit("www.ecb.europa.eu"),true);
 assert.equal(b.snapshot().readbacks_used,2);
});
test("explicit zero additional reads is valid; invalid excessive budgets cannot bypass hard cap",()=>{
 const b=createBundledOriginalReadbackBudget({hardCeiling:0,reserved:0});
 assert.equal(b.admit("www.ecb.europa.eu"),false);
 assert.equal(b.snapshot().readbacks_used,0);
 for(const args of [
  {hardCeiling:7,reserved:0},{hardCeiling:6,reserved:7},
  {hardCeiling:6,reserved:-1},{hardCeiling:6,perHostMax:30},
 ]){
  assert.throws(()=>createBundledOriginalReadbackBudget(args),/ORIGINAL_BUNDLE_INVALID/);
 }
});
test("news scheduling round robins category first and newest within that category, no duplicate cards",()=>{
 const rows=[
  {id:"geopolitics-a",category:"geopolitics",published_at:"2026-10-21T12:00:00Z"},
  {id:"geopolitics-b",category:"geopolitics",published_at:"2026-10-21T12:01:00Z"},
  {id:"macro-a",category:"macro",published_at:"2026-10-21T12:02:00Z"},
  {id:"rare-a",category:"rare_earth",published_at:"2026-10-21T12:03:00Z"},
  {id:"rare-b",category:"rare_earth",published_at:"2026-10-21T12:04:00Z"},
 ];
 const result=bundleRoundRobinNews(rows);
 assert.deepEqual(result.map(x=>x.id),[
  "geopolitics-b","macro-a","rare-b","geopolitics-a","rare-a",
 ]);
 assert.equal(result.length,rows.length);
});
test("non-publisher input fails rather than shifting category request budget",()=>{
 const b=createBundledOriginalReadbackBudget();
 for(const host of ["127.0.0.1","local","www.gov.uk:443","evil/cross","CAPS.EXAMPLE"])
  assert.throws(()=>b.admit(host),/ORIGINAL_BUNDLE_UNTRUSTED_HOST/);
});
