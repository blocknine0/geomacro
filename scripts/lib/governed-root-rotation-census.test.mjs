import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {auditGovernedRootRotation} from "./governed-root-rotation-census.mjs";
import {selectGovernedRootWindow} from "../ops/probe-source-discovery-roots.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
const now=new Date("2026-10-13T23:59:00.000Z");
const SLOT=90*60*1000;
const sizes={GEOPOLITICS:209,MACRO:308,CRITICAL_MINERALS:18};
const catalog={roots:Object.entries(sizes).flatMap(([category,n])=>
  Array.from({length:n},(_,i)=>({
    category,source_id:category.toLowerCase()+"_source_"+i,
    root_url:"https://example.org/source/"+category+"/"+i,
  })))};
function make(j){
  const at=new Date(now.getTime()-j*SLOT);
  const slot=selectGovernedRootWindow(catalog,at);
  const rows=slot.roots.map((r,i)=>{
    const isReachable=i%3===0;
    return {
      source_ref:sha(r.category+":"+r.source_id).slice(0,24),
      category:r.category,
      status:isReachable?"ROOT_HTTP_REACHABLE":"ROOT_RATE_LIMITED",
      http_status:isReachable?200:429,
      discovery_only:true,original_feed_activated:false,
    };
  });
  const per_domain=Object.fromEntries(Object.keys(sizes).map(domain=>{
    const filtered=rows.filter(r=>r.category===domain);
    return [domain,{checked:filtered.length,
      http_reachable:filtered.filter(r=>r.status==="ROOT_HTTP_REACHABLE").length}];
  }));
  return {
    schema:"geomacro.discovery-root-rotating-http-health.v1",
    observed_at:at.toISOString(),source_catalog_count:catalog.roots.length,
    window_index:slot.index,window_count:slot.windowCount,
    checked_roots:rows.length,http_reachable:rows.filter(r=>r.status==="ROOT_HTTP_REACHABLE").length,
    per_domain,http_root_observation_only:true,
    original_articles_ingested:0,registered_roots_auto_activated_as_news_feeds:0,
    all_sources_working_claim:false,commercial_eligible:false,
    b2_requests:0,d1_writes:0,supabase_writes:0,payment_performed:false,
    rows,
  };
}
const receipts=Array.from({length:14},(_,j)=>make(j));
const run=r=>auditGovernedRootRotation({catalog,receipts:r,now});
test("14 unique 90m slots prove all 535 catalog roots, no fake active feed",()=>{
  const a=run(receipts),b=run([...receipts].reverse());
  assert.equal(a.status,"FULL_HTTP_ROOT_CENSUS_OBSERVED");
  assert.equal(a.full_rotation_observed,true);
  assert.equal(a.total_registered_roots,535);
  assert.equal(a.root_checks_verified,535);
  assert.equal(a.root_checks_missing,0);
  assert.equal(a.observed_windows,14);
  assert.equal(a.per_domain.GEOPOLITICS.checked_roots,209);
  assert.equal(a.per_domain.MACRO.checked_roots,308);
  assert.equal(a.per_domain.CRITICAL_MINERALS.checked_roots,18);
  assert.equal(a.private_source_status_set_sha256,b.private_source_status_set_sha256);
  assert.equal(a.source_feed_activated_by_census,false);
  assert.equal(a.all_registered_sources_working,false);
  assert.equal(a.payment_authorized,false);
  assert.deepEqual([a.original_articles_ingested,a.b2_requests,a.d1_writes,a.supabase_writes],[0,0,0,0]);
  const json=JSON.stringify(a);
  for(const x of ["example.org","macro_source","source_ref","source_id","root_url"])
    assert.equal(json.includes(x),false);
});
test("missing or repeated same slot cannot create a fabricated full rotation",()=>{
  const p=run(receipts.slice(0,13));
  assert.equal(p.full_rotation_observed,false);
  assert.equal(p.observed_windows,13);
  assert.ok(p.root_checks_missing>0);
  assert.equal(p.payment_authorized,false);
  const repeat=run([...receipts.slice(0,13),receipts[0]]);
  assert.equal(repeat.full_rotation_observed,false);
  assert.equal(repeat.observed_windows,13);
});
test("spoofed source hash, slot index, receipts, and invented activated feeds fail closed",()=>{
  for(const patch of [
    {window_index:99},
    {source_catalog_count:534},
    {original_articles_ingested:1},
    {all_sources_working_claim:true},
    {payment_performed:true},
    {checked_roots:40},
    {window_count:13},
  ]){
    const candidate={...receipts[0],...patch};
    assert.throws(()=>run([candidate,...receipts.slice(1)]),
      /ROOT_ROTATION_CENSUS_RECEIPT_INVALID/);
  }
  const forged={...receipts[0],rows:receipts[0].rows.map((r,i)=>
    i===0?{...r,source_ref:"f".repeat(24)}:r)};
  assert.throws(()=>run([forged,...receipts.slice(1)]),
    /ROOT_ROTATION_CENSUS_RECEIPT_INVALID/);
  const invalidStatus={...receipts[0],rows:receipts[0].rows.map((r,i)=>
    i===0?{...r,status:"ROOT_HTTP_REACHABLE",http_status:429}:r)};
  assert.throws(()=>run([invalidStatus,...receipts.slice(1)]),
    /ROOT_ROTATION_CENSUS_RECEIPT_INVALID/);
});
test("outdated, future, mismatched windows and invalid root registries fail closed",()=>{
  const old={...receipts[0],observed_at:"2026-10-10T00:00:00Z"};
  assert.throws(()=>run([old]),/ROOT_ROTATION_CENSUS_RECEIPT_INVALID/);
  const badIndex={...receipts[0],window_index:(receipts[0].window_index+1)%14};
  assert.throws(()=>run([badIndex]),/ROOT_ROTATION_CENSUS_RECEIPT_INVALID/);
  const poisoned={roots:[...catalog.roots,{...catalog.roots[0]}]};
  assert.throws(()=>auditGovernedRootRotation({catalog:poisoned,receipts,now}),
    /ROOT_HEALTH_SOURCE_ID_OR_CATEGORY_INVALID/);
});
