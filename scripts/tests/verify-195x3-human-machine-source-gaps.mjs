#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";

const dir=mkdtempSync(join(tmpdir(),"geomacro-query-195x3-test-"));
try {
 const proc=spawnSync(process.execPath,["scripts/ops/audit-195x3-human-machine-source-gaps.mjs"],
   {encoding:"utf8",env:{...process.env,RUNNER_TEMP:dir},timeout:30000});
 assert.equal(proc.status,0,proc.stderr||proc.stdout);
 const path=join(dir,"geomacro-195x3-query-regression");
 const report=JSON.parse(readFileSync(join(path,"summary.json"),"utf8"));
 const manifest=JSON.parse(readFileSync(join(path,"question-manifest.json"),"utf8"));
 const gaps=JSON.parse(readFileSync(join(path,"country-category-gaps.json"),"utf8"));
 assert.equal(report.summary,undefined);
 assert.equal(report.countries,195);
 assert.equal(report.total_question_scenarios,5850);
 assert.equal(report.human,2925);
 assert.equal(report.machine,2925);
 assert.equal(report.matrix_cells,585);
 assert.deepEqual(report.question_archetypes_per_category,{geopolitics:5,macro:6,critical_minerals:4});
 assert.equal(report.live_probe_candidate_scenarios,1170);
 assert.equal(report.mode,"OFFLINE_TEST_CASE_GENERATION");
 assert.equal(report.live_requests_attempted,0);
 assert.equal(report.paid_structured_deliveries_verified,0);
 assert.equal(report.source_families_newly_active,0);
 assert.equal(report.predge_modified,false);
 assert.equal(manifest.cases.length,5850);
 assert.equal(gaps.cells.length,585);
 assert.equal(new Set(manifest.cases.map(x=>x.id)).size,5850);
 assert.equal(new Set(manifest.cases.map(x=>x.country_iso3)).size,195);
 assert.equal(manifest.cases.filter(x=>x.actor==="human").length,2925);
 assert.equal(manifest.cases.filter(x=>x.actor==="machine").length,2925);
 assert.equal(manifest.cases.filter(x=>x.language==="bn").length>0,true);
 assert.equal(manifest.cases.filter(x=>x.language==="hi").length>0,true);
 assert.equal(manifest.cases.every(x=>x.source_coverage_status==="NOT_MEASURED"),true);
 assert.equal(manifest.cases.every(x=>x.payment_submitted===false&&x.settlement_performed===false),true);
 assert.equal(gaps.cells.every(x=>x.paid_structured_deliveries_verified===0),true);
 const liveCandidates=JSON.parse(readFileSync(join(path,"live-probe-candidate-manifest.json"),"utf8"));
 assert.equal(liveCandidates.cases.length,1170);
 assert.equal(new Set(liveCandidates.cases.map(x=>x.id)).size,1170);
 assert.equal(liveCandidates.cases.filter(x=>x.actor==="human").length,585);
 assert.equal(liveCandidates.cases.filter(x=>x.actor==="machine").length,585);
 for(const category of ["geopolitics","macro","critical_minerals"]){
   assert.equal(manifest.cases.filter(x=>x.category===category).length,
     category==="geopolitics"?1950:category==="macro"?2340:1560);
   assert.equal(gaps.cells.filter(x=>x.category===category).length,195);
   assert.equal(new Set(manifest.cases.filter(x=>x.category===category).map(x=>x.scenario)).size,
     category==="geopolitics"?5:category==="macro"?6:4);
 }
 for(const country of new Set(manifest.cases.map(x=>x.country_iso3)))
   assert.equal(manifest.cases.filter(x=>x.country_iso3===country).length,30);
 // Avoid accidentally invoking production by the offline test.
 assert.equal(JSON.parse(readFileSync(join(path,"live-no-funds-results.json"),"utf8")).results.length,0);
 console.log("195x3 mock PASS: 5,850 questions across 15 archetypes, 1,170 live-probe candidates and 585 country-category cells; no live calls or paid claims.");
} finally {rmSync(dir,{recursive:true,force:true});}
