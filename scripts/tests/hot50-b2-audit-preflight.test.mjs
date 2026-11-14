import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {admitHot50IndexedB2Readback} from "../lib/hot50-b2-parity-preflight.mjs";
const now=Date.parse("2026-11-12T14:00:00.000Z");
const census=()=>({schema:"geomacro.hot50-production-activation-census.v1",
 backlog:{total_unhandled:0,d1_zero_unhandled_proven:true,
  exact_bundle_journal_mismatch:0,archived_outboxes:3}});
const quota=()=>({day_utc:"2026-11-12",
 used:{total:100,GET:40},limits:{total:720,GET:340}});
const args=()=>({census:census(),quota:quota(),
 storageGuard:{open:false},limit:240,now});
test("B2 admission only with real D1 zero, complete indexed count and current account governor headroom",()=>{
 const p=admitHot50IndexedB2Readback(args());
 assert.equal(p.status,"ADMITTED_FOR_BOUNDED_B2_GET_ONLY");
 assert.equal(p.expected_physical_gets,3);
 assert.equal(p.provider_governor_still_required,true);
 assert.equal(p.physical_parity_not_yet_proven,true);
 assert.equal(p.provider_quota_is_not_atomic_reservation,true);
 assert.equal(p.zero_list_policy_preserved,true);
 assert.equal(p.production_mutations,0);
});
test("nonzero P0-B backlog and uncertain counters HOLD before one physical GET",()=>{
 for(const x of [
  {...args(),census:{...census(),backlog:{...census().backlog,total_unhandled:3390}}},
  {...args(),census:{...census(),backlog:{...census().backlog,d1_zero_unhandled_proven:false}}},
  {...args(),census:{...census(),backlog:{...census().backlog,exact_bundle_journal_mismatch:1}}},
  {...args(),census:{...census(),backlog:{...census().backlog,total_unhandled:null}}},
  {...args(),census:{...census(),backlog:null}}
 ])assert.throws(()=>admitHot50IndexedB2Readback(x),/PARITY_D1_BACKLOG_NOT_ZERO/);
});
test("partial or empty archived set and active B2 storage circuit never consume B2 quota",()=>{
 for(const x of [
  {...args(),census:{...census(),backlog:{...census().backlog,archived_outboxes:0}}},
  {...args(),census:{...census(),backlog:{...census().backlog,archived_outboxes:241}}},
  {...args(),storageGuard:{open:true}},
  {...args(),storageGuard:null}
 ])assert.throws(()=>admitHot50IndexedB2Readback(x),
  /ACTIVATION_B2_PARITY_(?:READ_BUDGET_PARTIAL_BEFORE_B2|NO_ARCHIVED_PHYSICAL_OBJECT|STORAGE_CIRCUIT_NOT_VERIFIED_CLEAR)/);
});
test("observed actual exhausted ledger and stale/unknown account quotas never permit an audit",()=>{
 for(const x of [
  {...args(),quota:{...quota(),used:{total:838,GET:644}}},
  {...args(),quota:{...quota(),used:{total:718,GET:339}}},
  {...args(),quota:{...quota(),day_utc:"2026-11-11"}},
  {...args(),quota:{...quota(),used:null}}
 ])assert.throws(()=>admitHot50IndexedB2Readback(x),
  /ACTIVATION_B2_PARITY_(?:B2_ACCOUNT_READ_HEADROOM_UNAVAILABLE|CURRENT_GOVERNOR_QUOTA_UNKNOWN)/);
});
test("audit source checks D1 census and account quota BEFORE the FIRST B2 client or GET",()=>{
 const source=readFileSync("scripts/ops/audit-hot50-b2-d1-parity.mjs","utf8");
 const start=source.indexOf("async function main()");
 const section=source.slice(start);
 const c=section.indexOf('admin("/v1/internal/activation/hot50-census")');
 const q=section.indexOf('admin("/v1/b2-quota/status")');
 const g=section.indexOf("admitHot50IndexedB2Readback({");
 const ctor=section.indexOf("const b2=createB2Client(");
 const get=section.indexOf("await b2.get(key)");
 assert(c>=0&&q>c&&g>q&&ctor>g&&get>ctor,
  "D1 backlog and quota headroom MUST precede all B2 GETs");
 assert.match(source,/PARITY_MAX_B2_READS/u);
 assert.doesNotMatch(source,/ListObjects|listObjectVersions|listBucketVersions/u);
});

test("protected release records numeric backlog diagnosis before B2 GET and preserves final HOLD",()=>{
 const code=readFileSync("scripts/certify-b2-parity.ts","utf8");
 const census=code.indexOf("const before=await admin('/v1/internal/activation/hot50-census')");
 const diagnostic=code.indexOf("persist('artifacts/release/hot50-b2-d1-backlog-diagnostic.json'");
 const admission=code.indexOf("'PARITY_D1_BACKLOG_NOT_ZERO'");
 const get=code.indexOf("await b2.get(");
 assert.ok(census>=0&&diagnostic>census&&admission>diagnostic&&get>admission);
 assert.match(code,/total_unhandled:safeCount\(backlog\.total_unhandled\)/u);
 assert.match(code,/exact_bundle_journal_mismatch:safeCount\(backlog\.exact_bundle_journal_mismatch\)/u);
 assert.match(code,/full_bucket_inventory_verified:false/u);
 assert.match(code,/b2_requests:0,provider_mutations:0,payments:0/u);
 assert.match(code,/scope:'D1_INDEXED_B2_R2_READBACK_ONLY'/u);
 assert.match(code,/status:'HOLD',verified_at:/u);
});
