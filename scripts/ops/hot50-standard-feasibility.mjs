#!/usr/bin/env node
import {readFileSync} from "node:fs";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {RISK_STREAM_CATEGORY_ROLES,validateSourceRightsManifest}
 from "../lib/risk-stream-source-rights-manifest.mjs";

const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const CROSSWALK_PATH="config/hot-50-four-lane-source-crosswalk.v1.json";
const PRIORITY_PATH="config/hot50-three-category-official-gap-priority.v1.json";
const MANIFEST_PATH="config/risk-stream-source-rights-reviewed.v1.json";
const CATEGORY_MAP=Object.freeze([
 {key:"GEOPOLITICS",crosswalk:"geopolitics"},
 {key:"MACRO_FX",crosswalk:"macro"},
 {key:"CRITICAL_MINERALS",crosswalk:"rare_earth"}
]);
const fail=code=>{throw Error("HOT50_STANDARD_FEASIBILITY_"+code)};
function readJson(path){
 try{return JSON.parse(readFileSync(join(ROOT,path),"utf8"))}
 catch{fail("INPUT_JSON_INVALID_"+path.replaceAll("/","_"))}
}
function roleSources(entries,category,role){
 return entries.filter(entry=>entry.status==="APPROVED"&&
  entry.categories.includes(category)&&entry.source_role===role);
}
function independentPair(entries,category,[roleA,roleB]){
 const sourcesA=roleSources(entries,category,roleA);
 const sourcesB=roleSources(entries,category,roleB);
 for(const a of sourcesA){
  for(const b of sourcesB){
   if(a.publisher_root_domain!==b.publisher_root_domain&&
      a.parent_media_entity!==b.parent_media_entity)return [a,b];
  }
 }
 return {sourcesA,sourcesB};
}
function missingFor(sourcesA,sourcesB,roleA,roleB){
 if(!sourcesA.length||!sourcesB.length){
  return [!sourcesA.length?roleA:null,!sourcesB.length?roleB:null].filter(Boolean);
 }
 return ["INDEPENDENT_PUBLISHER_AND_PARENT_PAIR"];
}
function validateInputs(crosswalk,priority){
 if(crosswalk?.schema!=="geomacro.hot50.source-lane-crosswalk.v1"||
    !Array.isArray(crosswalk.countries)||crosswalk.countries.length!==50||
    crosswalk.country_count!==50)fail("CROSSWALK_SCOPE_INVALID");
 const countryIds=crosswalk.countries.map(x=>x.country_iso3);
 if(countryIds.some(x=>typeof x!=="string"||! /^[A-Z]{3}$/u.test(x))||
    new Set(countryIds).size!==50)fail("CROSSWALK_COUNTRIES_INVALID");
 if(!CATEGORY_MAP.every(x=>crosswalk.categories?.includes(x.crosswalk)))
  fail("CROSSWALK_CATEGORIES_INVALID");
 if(priority?.schema!=="geomacro.hot50-three-category-official-gap-priority.v1"||
    !Array.isArray(priority.new_official_candidates)||
    !priority.pinned_existing||typeof priority.pinned_existing!=="object")
  fail("PRIORITY_CONFIG_INVALID");
 const pinnedIds=Object.values(priority.pinned_existing).flat();
 if(pinnedIds.some(x=>typeof x!=="string"||x.length<3))
  fail("PRIORITY_PINNED_SOURCE_IDS_INVALID");
 const ids=[...pinnedIds,...priority.new_official_candidates.map(x=>x?.id)];
 if(ids.some(x=>typeof x!=="string"||x.length<3)||new Set(ids).size!==ids.length)
  fail("PRIORITY_CANDIDATES_INVALID");
 return {countryIds,priorityCandidateIds:ids};
}
export function buildHot50StandardFeasibility({crosswalk,priority,manifest,now=Date.now()}){
 const {countryIds:countries,priorityCandidateIds}=validateInputs(crosswalk,priority);
 const {approvedEntries,pendingEntries}=validateSourceRightsManifest(manifest,now);
 const cells=[];
 for(const country of countries){
  for(const {key:category} of CATEGORY_MAP){
   const roles=RISK_STREAM_CATEGORY_ROLES[category];
   const pair=independentPair(approvedEntries,category,roles);
   const feasible=Array.isArray(pair);
   cells.push({country_iso3:country,category,
    status:feasible?"FEASIBLE":"INFEASIBLE",
    qualifying_source_ids:feasible?pair.map(x=>x.source_id).sort():[],
    missing_roles:feasible?[]:missingFor(pair.sourcesA,pair.sourcesB,...roles)});
  }
 }
 const totalsByCategory=CATEGORY_MAP.map(({key:category})=>{
  const group=cells.filter(x=>x.category===category);
  return {category,feasible_cells:group.filter(x=>x.status==="FEASIBLE").length,
   infeasible_cells:group.filter(x=>x.status==="INFEASIBLE").length};
 });
 return {schema:"geomacro.hot50.standard-feasibility.v1",
  scope:"PRIVATE_FEASIBILITY_ANALYSIS_NO_ACTIVATION",
  country_count:countries.length,cell_count:cells.length,
  approved_source_count:approvedEntries.length,pending_source_count:pendingEntries.length,
  discovery_only_priority_candidate_count:priorityCandidateIds.length,
  source_rights_rule:"Only APPROVED manifest entries count; crosswalk and gap-priority candidates do not confer rights.",
  totals_by_category:totalsByCategory,
  feasible_cells:cells.filter(x=>x.status==="FEASIBLE"),
  infeasible_cells:cells.filter(x=>x.status==="INFEASIBLE")};
}
function renderMarkdown(report){
 const lines=["| Country | Category | Standard feasibility | Missing role / independence proof |",
  "| --- | --- | --- | --- |"];
 for(const cell of [...report.feasible_cells,...report.infeasible_cells]
   .sort((a,b)=>a.country_iso3.localeCompare(b.country_iso3)||
    a.category.localeCompare(b.category))){
  lines.push(`| ${cell.country_iso3} | ${cell.category} | ${cell.status} | ${
   cell.missing_roles.length?cell.missing_roles.join(", "):"—"} |`);
 }
 lines.push("","Totals by category:","","| Category | Feasible cells | Infeasible cells |",
  "| --- | ---: | ---: |");
 for(const total of report.totals_by_category)
  lines.push(`| ${total.category} | ${total.feasible_cells} | ${total.infeasible_cells} |`);
 return lines.join("\n");
}
export function createFeasibilityReport({now=Date.now()}={}){
 return buildHot50StandardFeasibility({crosswalk:readJson(CROSSWALK_PATH),
  priority:readJson(PRIORITY_PATH),manifest:readJson(MANIFEST_PATH),now});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=createFeasibilityReport();
  process.stdout.write(JSON.stringify(report,null,2)+"\n\n"+renderMarkdown(report)+"\n");
 }catch(error){
  process.stderr.write(String(error?.message??"HOT50_STANDARD_FEASIBILITY_FAILED").slice(0,240)+"\n");
  process.exitCode=1;
 }
}
