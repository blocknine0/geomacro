import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {buildP1SourceRegistration,buildP1Hot50FallbackMappings,
 buildP1Hot50AdditionalCellMappings,
 renderP1SourceRegistrationSQL}
 from "../ops/seed-p1-1077-source-registry.mjs";
import {P1_HOT50_VERIFIED_ALTERNATIVE_LINKS}
 from "../../workers/control-plane/src/p1-hot50-verified-global-fallbacks.mjs";
test("pinned manifests produce 1069 working, fourteen live-verified additions and eight OGL source/category lanes",()=>{
 const rows=buildP1SourceRegistration();
 assert.equal(rows.length,1091);
 assert.equal(new Set(rows.map(x=>x.source_id)).size,1091);
 assert.equal(new Set(rows.map(x=>x.canonical_endpoint)).size,388);
 assert.equal(rows.filter(x=>x.parser_type==="ATOM").length,13);
 assert.equal(rows.filter(x=>x.rights_tier!=="RESEARCH_ONLY").length,0);
 assert.ok(rows.every(x=>["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"].includes(x.intended_category)));
 const added=rows.filter(x=>[
  "private_expansion_eurostat_economy_atom",
  "private_expansion_eurostat_trade_atom",
  "private_expansion_nor_norges_press",
  "private_expansion_ru_cbr_en_news",
  "private_expansion_ru_cbr_en_press",
  "private_expansion_swe_riksbank_press",
  "private_expansion_za_sars_news",
  "private_mineral_chl_cochilco_news",
  "private_global_hub_un_hq_press",
  "private_mineral_zaf_dmpr_media",
  "private_priority_gdacs_24h",
 ].some(id=>x.source_id.startsWith(id+".")));
 assert.equal(added.length,14);
 assert.ok(added.every(x=>x.rights_tier==="RESEARCH_ONLY"));
 assert.deepEqual(Object.fromEntries(["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]
  .map(category=>[category,added.filter(x=>x.intended_category===category).length])),
  {GEOPOLITICS:2,MACRO_FX:10,CRITICAL_MINERALS:2});
 const probe=JSON.parse(readFileSync(new URL(
  "../../config/hot50-official-feed-live-probes.v1.json",import.meta.url),"utf8"));
 assert.deepEqual(probe.candidate_probe_summary,{candidate_count:23,
  strict_pass_count:9,fail_count:14,note:probe.candidate_probe_summary.note});
 assert.deepEqual({candidate_count:probe.additional_crosscutting_probe_summary.candidate_count,
  strict_pass_count:probe.additional_crosscutting_probe_summary.strict_pass_count,
  fail_count:probe.additional_crosscutting_probe_summary.fail_count},
  {candidate_count:1,strict_pass_count:1,fail_count:0});
 assert.deepEqual({candidate_count:probe.supplemental_candidate_probe_summary.candidate_count,
  strict_pass_count:probe.supplemental_candidate_probe_summary.strict_pass_count,
  fail_count:probe.supplemental_candidate_probe_summary.fail_count},
  {candidate_count:15,strict_pass_count:3,fail_count:12});
 assert.ok(probe.sources.every(x=>x.probe.http_status===200&&
  x.probe.redirect_mode==="error"&&x.probe.redirected===false&&
  x.probe.parsed_items>0&&x.probe.native_time_items>0));
});
test("1091 source lanes idempotently populate canonical D1 with zero independent rights promotion",()=>{
 const db=new DatabaseSync(":memory:");
 try{
  for(const name of ["0113_p0a_source_registry.sql",
   "0119_p1_source_fanout_585.sql"])
   db.exec(readFileSync(new URL("../../workers/control-plane/migrations/"+name,import.meta.url),"utf8"));
  const rows=buildP1SourceRegistration();
  const statements=renderP1SourceRegistrationSQL(rows);
  assert.doesNotMatch(statements,/COMMERCIAL_APPROVED|PENDING_AUDIT/u);
  db.exec(statements);
  const first=db.prepare("SELECT COUNT(*) AS n FROM p1_source_seed_manifest").get().n;
 assert.equal(first,1091);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry").get().n,1091);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE enabled=1").get().n,1091);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry WHERE rights_tier!='RESEARCH_ONLY'").get().n,0);
  db.exec(statements);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM p1_source_seed_manifest").get().n,1091);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_registry").get().n,1091);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM p1_country_category_cells").get().n,585);
  assert.ok(db.prepare("SELECT COUNT(*) AS n FROM p1_source_to_cell").get().n>0);
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS n FROM p1_source_to_cell WHERE origin='VERIFIED_ALTERNATIVE'"
  ).get().n,265);
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS n FROM (SELECT country_iso3,primary_category " +
   "FROM p1_source_to_cell WHERE country_iso3 IN " +
   "('USA','CHN','IND','RUS','GBR','DEU','FRA','JPN','KOR','BEL','CAN','AUS',"+
   "'BRA','MEX','ITA','ESP','NLD','CHE','NOR','SWE','POL','UKR','TUR','SAU',"+
   "'ARE','IRN','ISR','EGY','QAT','OMN','IRQ','ZAF','NGA','COD','ZMB','CHL',"+
   "'PER','ARG','BOL','IDN','VNM','THA','MYS','SGP','PHL','PAK','BGD','KAZ',"+
   "'MNG','MMR') GROUP BY country_iso3,primary_category)"
  ).get().n,150);
  for(const category of ["GEOPOLITICS","MACRO_FX","CRITICAL_MINERALS"]){
   assert.equal(db.prepare(
    "SELECT COUNT(DISTINCT country_iso3) AS n FROM p1_source_to_cell " +
    "WHERE primary_category=? AND country_iso3 IN " +
    "('USA','CHN','IND','RUS','GBR','DEU','FRA','JPN','KOR','BEL','CAN','AUS',"+
    "'BRA','MEX','ITA','ESP','NLD','CHE','NOR','SWE','POL','UKR','TUR','SAU',"+
    "'ARE','IRN','ISR','EGY','QAT','OMN','IRQ','ZAF','NGA','COD','ZMB','CHL',"+
    "'PER','ARG','BOL','IDN','VNM','THA','MYS','SGP','PHL','PAK','BGD','KAZ',"+
    "'MNG','MMR')"
   ).get(category).n,50,category);
  }
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS n FROM p1_source_to_cell WHERE source_id=? AND "+
   "primary_category='GEOPOLITICS' AND country_iso3 IN "+
   "('USA','CHN','IND','RUS','GBR','DEU','FRA','JPN','KOR','BEL','CAN','AUS',"+
   "'BRA','MEX','ITA','ESP','NLD','CHE','NOR','SWE','POL','UKR','TUR','SAU',"+
   "'ARE','IRN','ISR','EGY','QAT','OMN','IRQ','ZAF','NGA','COD','ZMB','CHL',"+
   "'PER','ARG','BOL','IDN','VNM','THA','MYS','SGP','PHL','PAK','BGD','KAZ',"+
   "'MNG','MMR')"
  ).get("private_eu_sanctions_guidance_official_rss_review.geopolitics").n,50);
  assert.equal(db.prepare(
   "SELECT COUNT(*) AS n FROM p1_source_to_cell WHERE source_id=? AND "+
   "primary_category='GEOPOLITICS'"
  ).get("private_global_hub_un_hq_press.geopolitics").n,50);
  assert.equal(db.prepare(
   "SELECT COUNT(DISTINCT country_iso3) AS n FROM p1_source_to_cell " +
   "WHERE source_id='private_expansion_eurostat_economy_atom.macro_fx' " +
   "AND primary_category='MACRO_FX'"
  ).get().n,7);
  for(const [source_id,category] of [
   ["private_priority_gdacs_24h.geopolitics","GEOPOLITICS"],
   ["private_priority_gdacs_24h.macro_fx","MACRO_FX"],
  ])assert.equal(db.prepare(
   "SELECT COUNT(*) AS n FROM p1_source_to_cell WHERE source_id=? AND primary_category=?"
  ).get(source_id,category).n,50);
 }finally{db.close()}
});
test("the 51 source-empty Hot 50 cells use explicit verified alternatives only",()=>{
 const rows=buildP1SourceRegistration();
 const fallback=buildP1Hot50FallbackMappings(rows);
 const additional=buildP1Hot50AdditionalCellMappings(rows);
 assert.equal(fallback.length,51);
 assert.equal(new Set(fallback.map(x=>x.country_iso3+"|"+x.category)).size,51);
 assert.ok(fallback.every(x=>x.origin==="VERIFIED_ALTERNATIVE"&&x.rank===1));
 assert.equal(additional.length,214);
 assert.ok(additional.every(x=>x.origin==="VERIFIED_ALTERNATIVE"&&
  [2,3].includes(x.rank)));
 assert.deepEqual(new Set([...fallback,...additional].map(x=>x.source_id+"|"+x.country_iso3+"|"+x.category)),
  P1_HOT50_VERIFIED_ALTERNATIVE_LINKS);
 const forged=rows.map(x=>x.source_id===fallback[0].source_id?
  {...x,country_iso3:"USA"}:x);
 assert.throws(()=>buildP1Hot50FallbackMappings(forged),
  /P1_1077_SEED_HOT50_FALLBACK_LINK_INVALID/u);
});
