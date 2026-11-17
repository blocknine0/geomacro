import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {validateSourceRightsManifest} from "../lib/risk-stream-source-rights-manifest.mjs";
import {buildHot50StandardFeasibility} from "../ops/hot50-standard-feasibility.mjs";
import {buildSourceRegistrationPlan,runSourceRegistration}
 from "../ops/register-risk-stream-source.mjs";

const ROOT=fileURLToPath(new URL("../..",import.meta.url));
const now=Date.parse("2026-11-15T12:00:00.000Z");
const readJson=path=>JSON.parse(readFileSync(join(ROOT,path),"utf8"));
const evidence={licence_url:"https://rights.example.invalid/licence",
 terms_url:"https://rights.example.invalid/terms",
 reviewed_at:"2026-11-13T12:00:00.000Z",reviewer:"owner-review",
 notes:"Owner reviewed exact dataset terms and derived-use scope."};
function approved(source_id,{role="GOVERNMENT_WIRE",category="GEOPOLITICS",
 domain="publisher-a.example",parent="publisher-a",expires="2027-11-13"}={}){
 return {source_id,publisher_root_domain:domain,parent_media_entity:parent,
  source_role:role,categories:[category],status:"APPROVED",
  rights_evidence:{...evidence},rights_expire_at:expires};
}
function validManifest(entries=[
 approved("gov_wire_source"),
 approved("independent_region",{role:"INDEPENDENT_REGIONAL",domain:"publisher-b.example",
  parent:"publisher-b"})
]){
 return {schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries};
}
function syntheticScope(){
 return {crosswalk:{schema:"geomacro.hot50.source-lane-crosswalk.v1",country_count:50,
  categories:["geopolitics","macro","rare_earth"],
  countries:Array.from({length:50},(_,i)=>({country_iso3:String.fromCharCode(
   65+Math.floor(i/26),65+i%26,65)}))},
  priority:{schema:"geomacro.hot50-three-category-official-gap-priority.v1",
   pinned_existing:{},new_official_candidates:[{id:"candidate_not_rights_approved"}]}};
}

test("valid owner-reviewed role pair passes manifest validation",()=>{
 const result=validateSourceRightsManifest(validManifest(),now);
 assert.equal(result.approvedEntries.length,2);
 assert.equal(result.pendingEntries.length,0);
});

test("production registry workflow accepts Cloudflare D1 uuid or id with strict target checks",()=>{
 const workflow=readFileSync(join(ROOT,
  ".github/workflows/apply-risk-stream-source-registry.yml"),"utf8");
 assert.match(workflow,/\(body\?.result\?.uuid\s*\?\?\s*body\?.result\?.id\)!==databaseId/u);
 assert.match(workflow,/body\?.success!==true/u);
 assert.match(workflow,/body\?.result\?.name!=='geomacro-control-plane'/u);
 assert.ok(workflow.includes('cron: "05 7 * * 1"'));
 assert.match(workflow,/github\.event_name == 'schedule'[\s\S]*APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION/u);
 assert.match(workflow,/if: inputs\.mode == 'apply' \|\| github\.event_name == 'schedule'/u);
});

test("shipped manifest approves documented OGL and item-guarded CC-BY sources, retaining pending examples",()=>{
 const manifest=readJson("config/risk-stream-source-rights-reviewed.v1.json");
 const result=validateSourceRightsManifest(manifest,now);
 assert.equal(result.approvedEntries.length,17);
 assert.equal(result.pendingEntries.length,3);
 assert.ok(result.pendingEntries.every(x=>x.rights_evidence.notes.includes("EXAMPLE - NOT REVIEWED")));
 const oglSources=result.approvedEntries.filter(x=>x.source_id.startsWith("uk_")).map(x=>x.source_id).sort();
 assert.deepEqual(oglSources,[
  "uk_bist_ogl_minerals_atom","uk_cabinet_ogl_security_atom",
  "uk_dbt_ogl_minerals_atom","uk_desnz_ogl_minerals_atom",
  "uk_fcdo_ogl_official_atom","uk_hmt_ogl_official_atom",
  "uk_mod_ogl_security_atom","uk_obr_ogl_macro_atom"]);
 const ogl=readJson("config/official-ogl-atom-sources.json");
 assert.ok(result.approvedEntries.filter(x=>x.source_id.startsWith("uk_")).every(x=>
  (()=>{const source=ogl.sources.find(y=>y.source_id===x.source_id);return Boolean(
   source&&new URL(source.feed_url).hostname.endsWith(".gov.uk")&&
   x.publisher_root_domain==="gov.uk"&&
   x.rights_evidence.licence_url===source.license&&
   x.rights_evidence.terms_url===source.rights_reference&&
   source.private_research_only===true&&source.telegram_content_license===false&&
   source.commercial_promotion_requires_separate_main_gates===true);
  })()&&
  x.rights_evidence.reviewer==="repository-rights-evidence-audit"&&
  x.rights_evidence.notes.includes("exclude credited third-party material")&&
  x.rights_evidence.notes.includes("conditional on all main commercial gates")&&
  x.rights_evidence.notes.includes("not represented as a legal expiry")));
 const ccBy=new Map(result.approvedEntries.filter(x=>!x.source_id.startsWith("uk_")).map(x=>[x.source_id,x]));
 assert.deepEqual([...ccBy.keys()].sort(),[
  "ecb_fx_reference_rates","eu_jrc_rmis_ccby","gdelt_v2_factual_events",
  "geoscience_australia_ccby","global_voices_original_cc_by_3",
  "un_reliefweb_api_ccby","us_fed_h10_public_domain",
  "usgs_minerals_public_domain","worldbank_commodity_prices_cc_by_4"]);
 assert.equal(ccBy.get("global_voices_original_cc_by_3").rights_evidence.licence_url,
  "https://creativecommons.org/licenses/by/3.0/");
 assert.equal(ccBy.get("worldbank_commodity_prices_cc_by_4").rights_evidence.terms_url,
  "https://datacatalog.worldbank.org/search/dataset/0038238/commodity-prices-history-and-projections");
 assert.equal(ccBy.get("gdelt_v2_factual_events").publisher_root_domain,"gdeltproject.org");
 assert.equal(ccBy.get("gdelt_v2_factual_events").parent_media_entity,"gdelt_project");
 assert.equal(ccBy.get("un_reliefweb_api_ccby").rights_evidence.terms_url,
  "https://reliefweb.int/terms-conditions");
 assert.equal(ccBy.get("ecb_fx_reference_rates").publisher_root_domain,"ecb.europa.eu");
 assert.equal(ccBy.get("us_fed_h10_public_domain").parent_media_entity,"us_federal_reserve");
 assert.equal(ccBy.get("usgs_minerals_public_domain").publisher_root_domain,"usgs.gov");
 assert.equal(ccBy.get("geoscience_australia_ccby").rights_evidence.terms_url,
  "https://www.ga.gov.au/copyright");
 assert.equal(ccBy.get("eu_jrc_rmis_ccby").parent_media_entity,"european_commission_jrc");
 assert.ok(result.approvedEntries.filter(x=>[
  "gdelt_v2_factual_events","un_reliefweb_api_ccby","ecb_fx_reference_rates",
  "us_fed_h10_public_domain","usgs_minerals_public_domain",
  "geoscience_australia_ccby","eu_jrc_rmis_ccby"].includes(x.source_id)).every(x=>
   x.rights_expire_at==="2027-11-15"&&
   x.rights_evidence.reviewer==="owner-reviewed-open-license-registry"));
 const feasibility=buildHot50StandardFeasibility({
  crosswalk:readJson("config/hot-50-four-lane-source-crosswalk.v1.json"),
  priority:readJson("config/hot50-three-category-official-gap-priority.v1.json"),manifest,now});
 assert.deepEqual(feasibility.totals_by_category.map(x=>x.feasible_cells),[50,50,50]);
});

test("expired rights evidence cannot be approved",()=>{
 const manifest=validManifest([approved("gov_wire_source",{expires:"2026-11-13"})]);
 assert.throws(()=>validateSourceRightsManifest(manifest,now),
  /APPROVED_RIGHTS_EXPIRED_OR_INVALID/u);
});
test("future rights review timestamp cannot be approved",()=>{
 const manifest=validManifest([approved("future_review_source")]);
 manifest.entries[0].rights_evidence.reviewed_at="2026-11-15T12:01:00.000Z";
 assert.throws(()=>validateSourceRightsManifest(manifest,now),
  /APPROVED_EVIDENCE_INCOMPLETE/u);
});

test("same parent media entity cannot qualify as an independent role pair",()=>{
 const manifest=validManifest([
  approved("gov_wire_source",{parent:"shared-parent"}),
  approved("independent_region",{role:"INDEPENDENT_REGIONAL",domain:"publisher-b.example",
   parent:"shared-parent"})
 ]);
 assert.throws(()=>validateSourceRightsManifest(manifest,now),
  /ROLE_PAIR_NOT_INDEPENDENT_GEOPOLITICS/u);
});

test("feasibility lists the missing role and does not count discovery candidates",()=>{
 const scope=syntheticScope();
 const report=buildHot50StandardFeasibility({...scope,
  manifest:validManifest([approved("gov_wire_source")]),now});
 assert.equal(report.cell_count,150);
 assert.equal(report.discovery_only_priority_candidate_count,1);
 assert.equal(report.country_specific_feed_coverage_verified,false);
 assert.equal(report.role_pairs_are_global_not_cell_mapping,true);
 const geo=report.infeasible_cells.filter(x=>x.category==="GEOPOLITICS");
 assert.equal(geo.length,50);
 assert.ok(geo.every(x=>x.missing_roles.includes("INDEPENDENT_REGIONAL")));
 assert.equal(report.approved_source_count,1);
});

test("invalid source IDs and source categories are rejected",()=>{
 assert.throws(()=>validateSourceRightsManifest(validManifest([
  approved("Invalid uppercase")]),now),/SOURCE_ID_INVALID/u);
 const wrongRole=approved("wrong_role_source",{role:"MARKET_PRICE",category:"GEOPOLITICS"});
 assert.throws(()=>validateSourceRightsManifest(validManifest([wrongRole]),now),
  /CATEGORIES_INVALID/u);
});

test("dry-run and apply never write PENDING entries",()=>{
 const manifest=readJson("config/risk-stream-source-rights-reviewed.v1.json");
 const pendingOnly={schema:manifest.schema,
  entries:manifest.entries.filter(x=>x.status==="PENDING")};
 let calls=0;
 const runWrangler=()=>{calls++;throw Error("wrangler must not be called for PENDING-only manifest")};
 const plan=buildSourceRegistrationPlan(pendingOnly,now);
 assert.equal(plan.approvedEntries.length,0);
 assert.equal(plan.statements.length,0);
 assert.equal(runSourceRegistration({manifest:pendingOnly,runWrangler,now}).mode,"dry-run");
 assert.throws(()=>runSourceRegistration({manifest:pendingOnly,apply:true,
  env:{CONFIRM:"APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION",D1_DATABASE_ID:"12345678-1234-1234-1234-123456789abc"},
  runWrangler,now}),/NO_APPROVED_SOURCES/u);
 assert.equal(calls,0);
});
test("shipped approvals plan cleanly for provider preflight and apply",()=>{
 const manifest=readJson("config/risk-stream-source-rights-reviewed.v1.json");
 const plan=buildSourceRegistrationPlan(manifest,now);
 assert.equal(plan.approvedEntries.length,17);
 assert.equal(plan.pendingEntries.length,3);
 assert.equal(plan.statements.length,17);
 const schemas=[
  {type:"table",name:"risk_stream_sources",sql:"CREATE TABLE risk_stream_sources (commercial_rights_approved INTEGER,parent_media_entity TEXT,rights_expire_at TEXT)"},
  {type:"table",name:"risk_stream_category_policy",sql:"CREATE TABLE risk_stream_category_policy (required_role_a TEXT,required_role_b TEXT)"},
  {category:"GEOPOLITICS",required_role_a:"GOVERNMENT_WIRE",required_role_b:"INDEPENDENT_REGIONAL",enabled:1},
  {category:"MACRO_FX",required_role_a:"OFFICIAL_STATISTICS",required_role_b:"MARKET_PRICE",enabled:1},
  {category:"CRITICAL_MINERALS",required_role_a:"TRADE_CUSTOMS",required_role_b:"INDEPENDENT_INDUSTRY",enabled:1}
 ];
 const preflight=runSourceRegistration({manifest,preflight:true,
  env:{D1_DATABASE_ID:"12345678-1234-1234-1234-123456789abc"},
  runWrangler:()=>JSON.stringify([{results:schemas}]),root:ROOT,now});
 assert.deepEqual(preflight,{mode:"preflight",provider_schema_verified:true,
  approved_sources_planned:17,pending_sources_ignored:3});
 const runWrangler=args=>{
  const sql=args.at(-1);
  if(sql.startsWith("SELECT "))return JSON.stringify([{results:
   manifest.entries.filter(x=>x.status==="APPROVED").map(x=>({
    source_id:x.source_id,publisher_root_domain:x.publisher_root_domain,
    parent_media_entity:x.parent_media_entity,source_role:x.source_role,
    commercial_rights_approved:1,enabled:1,reviewed_at:x.rights_evidence.reviewed_at,
    rights_expire_at:x.rights_expire_at}))}]);
  return JSON.stringify([{results:[]}]);
 };
 const applied=runSourceRegistration({manifest,apply:true,
  env:{CONFIRM:"APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION",
   D1_DATABASE_ID:"12345678-1234-1234-1234-123456789abc"},runWrangler,root:ROOT,now});
 assert.deepEqual(applied,{mode:"apply",written:17,readback_verified:true,pending_ignored:3});
});

test("approved apply upserts approved rows and verifies every readback column",()=>{
 const pending=readJson("config/risk-stream-source-rights-reviewed.v1.json").entries
  .find(x=>x.status==="PENDING");
 const manifest=validManifest([...validManifest().entries,pending]);
 const commands=[];
 const runWrangler=args=>{
  const sql=args.at(-1);commands.push(sql);
  if(sql.startsWith("SELECT ")){
   const results=manifest.entries.filter(x=>x.status==="APPROVED").map(x=>({
    source_id:x.source_id,publisher_root_domain:x.publisher_root_domain,
    parent_media_entity:x.parent_media_entity,source_role:x.source_role,
    commercial_rights_approved:1,enabled:1,reviewed_at:x.rights_evidence.reviewed_at,
    rights_expire_at:x.rights_expire_at}));
   return JSON.stringify([{results}]);
  }
  return JSON.stringify([{results:[]}]);
 };
 const result=runSourceRegistration({manifest,apply:true,
  env:{CONFIRM:"APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION",
   D1_DATABASE_ID:"12345678-1234-1234-1234-123456789abc"},runWrangler,
  root:ROOT,now});
 assert.deepEqual(result,{mode:"apply",written:2,readback_verified:true,pending_ignored:1});
 assert.equal(commands.length,3);
 assert.ok(commands.slice(0,2).every(sql=>sql.includes("commercial_rights_approved,enabled")));
 assert.ok(commands.every(sql=>!sql.includes("example_gov_wire")));
});
