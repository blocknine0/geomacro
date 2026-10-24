import test from "node:test";
import assert from "node:assert/strict";
import {automaticNewsQualificationCoverage} from "./automatic-news-qualification-coverage.mjs";

const record=(cat,suffix)=>({id:cat+"-"+suffix,category:cat,published_at:"2026-10-24T12:00:00.000Z",
  title:"PRIVATE ORIGINAL SHOULD NEVER APPEAR",articleUrl:"https://secret-source.invalid/article"});
const news=[record("geopolitics","aaaa1111"),record("macro","bbbb2222"),
  record("macro","cccc3333"),record("rare_earth","dddd4444")];
const row=(signal,status)=>({id:signal.id,category:signal.category,
  original_page_evidence_status:status,exact_original_page_html_readback:
   status==="ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED"});
const args=()=>({
 retainedSignals:news,
 reusedVerifiedIds:new Set([news[0].id]),
 cooldownIds:new Set([news[1].id]),
 reviewedIds:new Set([news[2].id,news[3].id]),
 auditedRows:[
  row(news[2],"ORIGINAL_PAGE_BYTES_AND_NATIVE_TIME_VERIFIED"),
  row(news[3],"ORIGINAL_PAGE_READBACK_DEFERRED_QUOTA"),
 ],
});
test("every incoming news gets one retained automatic review or pending status, with truthful per-domain counts",()=>{
 const c=automaticNewsQualificationCoverage(args());
 assert.equal(c.all_retained_unique_inputs_accounted_for,true);
 assert.equal(c.retained_unique_derived_inputs,4);
 assert.equal(c.reviewed_or_pending_this_run,2);
 assert.equal(c.source_pages_verified_total,2);
 assert.equal(c.awaiting_evidence_or_unverified,2);
 assert.equal(c.categories.geopolitics.previously_source_verified,1);
 assert.equal(c.categories.macro.newly_source_verified,1);
 assert.equal(c.categories.macro.rejected_cooldown,1);
 assert.equal(c.categories.rare_earth.pending_or_unverified,1);
 assert.equal(c.signed_commercial_products_approved,false);
 const serialized=JSON.stringify(c);
 for(const secret of ["secret-source","PRIVATE ORIGINAL","aaaa1111","bbbb2222",
  "cccc3333","dddd4444","articleUrl","published_at"])
  assert.equal(serialized.includes(secret),false);
});
test("missing, duplicate, forged verified or overlapping classifications fail closed",()=>{
 const failures=[
  a=>a.reviewedIds.delete(news[3].id),
  a=>a.reviewedIds.add(news[0].id),
  a=>a.reusedVerifiedIds.add(news[1].id),
  a=>a.auditedRows.pop(),
  a=>a.auditedRows.push(a.auditedRows[0]),
  a=>a.auditedRows[1]={...a.auditedRows[1],exact_original_page_html_readback:true},
  a=>a.auditedRows[1]={...a.auditedRows[1],original_page_evidence_status:"SIGNED_GRO_READY"},
  a=>a.retainedSignals.push(news[0]),
  a=>a.retainedSignals[3]={...news[3],category:"macro"},
 ];
 for(const change of failures){const a=args();change(a);
  assert.throws(()=>automaticNewsQualificationCoverage(a),
   /AUTOMATIC_NEWS_QUALIFICATION_COVERAGE_INCOMPLETE/);}
});
test("no incoming news is a complete but NOT positive qualification result",()=>{
 const c=automaticNewsQualificationCoverage({
  retainedSignals:[],auditedRows:[],reusedVerifiedIds:new Set(),
  cooldownIds:new Set(),reviewedIds:new Set(),
 });
 assert.equal(c.retained_unique_derived_inputs,0);
 assert.equal(c.source_pages_verified_total,0);
 assert.equal(c.signed_commercial_products_approved,false);
 assert.equal(c.automatic_paid_delivery_authorized,false);
});
