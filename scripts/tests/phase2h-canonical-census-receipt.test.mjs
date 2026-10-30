import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildPhase2hCensusReceipt,capturePhase2hCanonicalCensus}
 from "../ops/phase2h-canonical-census-receipt.mjs";
const rows={
 category_counts:{
  geopolitics:{staged:5,archived:4,pending:1},
  macro:{staged:3,archived:0,pending:3},
  rare_earth:{staged:2,archived:2,pending:0}
 },
 staged_total:10,archived_total:6,pending_total:4
};
const env={GITHUB_ACTIONS:"true",GITHUB_REPOSITORY:"blocknine0/geomacro",
 GITHUB_REF:"refs/heads/main",GITHUB_SHA:"a".repeat(40),
 PHASE2H_PROVIDER_MAINTENANCE:"true"};
test("canonical census validates actual category counts but never asserts collector coverage",()=>{
 const receipt=buildPhase2hCensusReceipt(rows,{now:new Date("2026-10-30T12:17:00Z"),sha:env.GITHUB_SHA});
 assert.equal(receipt.staged_total,10);
 assert.equal(receipt.pending_total,4);
 assert.equal(receipt.category_counts.macro.archived,0);
 assert.equal(receipt.registered_website_osint_row_provenance_verified,false);
 assert.equal(receipt.archived_object_bytes_verified_by_this_census,false);
 assert.equal(receipt.b2_put_or_get_performed,false);
 assert.equal(receipt.payments,0);
});
test("maintenance=false never calls canonical D1 reader or B2",async()=>{
 let calls=0;
 await assert.rejects(capturePhase2hCanonicalCensus({
  env:{...env,PHASE2H_PROVIDER_MAINTENANCE:"false"},
  reader:async()=>{calls++;throw Error("UNSAFE_D1")}}),
  /PHASE2H_CENSUS_PROTECTED_MAINTENANCE_REQUIRED/u);
 assert.equal(calls,0);
});
test("malformed D1 census fails closed without invented counts",()=>{
 assert.throws(()=>buildPhase2hCensusReceipt({
  ...rows,category_counts:{...rows.category_counts,
   macro:{staged:3,archived:3,pending:3}}
 }),/PHASE2H_CENSUS_CATEGORY_TOTALS_INVALID/u);
 assert.throws(()=>buildPhase2hCensusReceipt({...rows,staged_total:11}),
  /PHASE2H_CENSUS_CANONICAL_TOTALS_DIVERGED/u);
});
test("workflow keeps bounded isolated archive gate, preserves quota receipt and census before B2",()=>{
 const workflow=readFileSync(".github/workflows/phase2h-private-raw-archive.yml","utf8");
 assert.ok(workflow.includes('cron: "3 * * * *"'));
 assert.ok(workflow.includes("five-hour-slot:"));
 assert.ok(workflow.includes("archive-then-retention:"));
 assert.ok(workflow.includes("needs.five-hour-slot.outputs.due == 'true'"));
 assert.match(workflow,/needs\.quota-admission\.outputs\.raw_archive == 'true'/u);
 assert.match(workflow,/B2_REQUEST_BUDGET: "12"/u);
 assert.match(workflow,/phase2h-provider-admission\.log/u);
 const census=workflow.indexOf("run: node scripts/ops/phase2h-canonical-census-receipt.mjs");
 const b2=workflow.indexOf("run: node scripts/ops/phase2h-permanent-production-acceptance.mjs");
 assert.ok(census>0&&b2>census);
 assert.match(workflow,/phase2h-canonical-census-receipt\.json/u);
});
