/**
 * Convert measured 195x3 local/original source gaps into a deterministic
 * commercial-variant SOURCING queue. This is not evidence, entitlement,
 * signed risk or a promise of uninterrupted new events.
 */
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const PRIORITIES={
 NO_HEALTHY_SOURCE:0,LOCAL_SOURCE_UNHEALTHY:1,GLOBAL_FALLBACK_ONLY:2,
 REGIONAL_FALLBACK_ONLY:3,HEALTHY_NO_NATIVE_ITEM_THIS_TICK:4,LOCAL_HEALTHY_NATIVE_ITEM:5,
};
const SOURCE_REQUIREMENTS={
 geopolitics:{
  first_party:"government_foreign_ministry_sanctions_election_trade_control",
  secondary:"independent_official_diplomatic_or_multilateral_issuer",
  periodic:"official_country_governance_reference_period",
  product:["intelligence_query.focused","intelligence_query.standard","intelligence_query.complex_multi_source",
   "signed_risk_object.newly_qualified_signed","risk_gate_bundle.standard"]
 },
 macro:{
  first_party:"national_central_bank_statistics_or_treasury_release",
  secondary:"independent_national_statistics_or_multilateral_series",
  periodic:"official_cpi_gdp_rates_fx_debt_trade_with_period_units",
  product:["structural_country_digest.standard","structural_country_profile.standard",
   "structural_corridor_digest.standard","intelligence_query.focused","intelligence_query.standard",
   "intelligence_query.complex_multi_source","signed_risk_object.newly_qualified_signed"]
 },
 rare_earth:{
  first_party:"mining_ministry_geological_agency_trade_export_control",
  secondary:"independent_commodity_mine_regulator_or_trade_reporting_issuer",
  periodic:"official_mineral_output_reserves_hs_trade_with_material_and_period",
  product:["structural_country_digest.standard","structural_country_profile.standard",
   "structural_corridor_profile.standard","intelligence_query.focused",
   "intelligence_query.standard","intelligence_query.complex_multi_source",
   "signed_risk_object.newly_qualified_signed"]
 }
};
export function buildRevenueSourceDemand(worklist){
 if(worklist?.schema!=="geomacro.native-country-195x3-repair-worklist.v1"||
    worklist.cells!==585||worklist.country_count!==195||
    worklist.category_count!==3||!Array.isArray(worklist.priority_worklist)||
    worklist.priority_worklist.length!==585||
    worklist.all_585_native_ingestion_verified!==false)
    throw Error("REVENUE_SOURCE_INPUT_NOT_VERIFIED");
 const visited=new Set(),countries=new Set(),rows=[];
 for(const item of worklist.priority_worklist){
   const key=item.country_iso3+":"+item.category;
   if(!/^[A-Z]{3}$/u.test(item.country_iso3??"")||
      !CATEGORIES.includes(item.category)||visited.has(key)||
      !Object.hasOwn(PRIORITIES,item.diagnosis)||
      item.priority!==PRIORITIES[item.diagnosis]||
      item.event_country_verified!==false||item.live_ingestion_585_verified!==false||
      !Number.isSafeInteger(item.native_country_attributed_items_this_tick)||
      item.native_country_attributed_items_this_tick<0)
       throw Error("REVENUE_SOURCE_CELL_UNSAFE");
   visited.add(key);countries.add(item.country_iso3);
   const need=SOURCE_REQUIREMENTS[item.category];
   rows.push({
     iso3:item.country_iso3,category:item.category,diagnosis:item.diagnosis,
     priority:item.priority,
     live_item_candidates_observed:item.native_country_attributed_items_this_tick,
     source_need:item.diagnosis==="HEALTHY_NO_NATIVE_ITEM_THIS_TICK"||
       item.diagnosis==="LOCAL_HEALTHY_NATIVE_ITEM"?
       "KEEP_CHECKING_ORIGINAL_PUBLICATION_NOT_FORCE_AN_EVENT":
       item.diagnosis==="LOCAL_SOURCE_UNHEALTHY"?
       "REPAIR_OR_REPLACE_EXACT_FIRST_PARTY_PUBLISHER":
       "DISCOVER_INDEPENDENT_COUNTRY_FIRST_PARTY_PUBLISHER",
     required_first_party_family:need.first_party,
     required_independent_family:need.secondary,
     required_structural_reference:need.periodic,
     blocked_price_variants_needing_independent_proof:need.product,
     source_transport_is_paid_delivery:false,
     qualified_original_event_verified:false,
     reviewed_rights_verified:false,signed_readback_verified:false,
     customer_charge_authorized:false
   });
 }
 if(visited.size!==585||countries.size!==195)
  throw Error("REVENUE_SOURCE_MATRIX_MISSING_COUNTRY");
 rows.sort((a,b)=>a.priority-b.priority||a.iso3.localeCompare(b.iso3)||
  CATEGORIES.indexOf(a.category)-CATEGORIES.indexOf(b.category));
 const perCategory=Object.fromEntries(CATEGORIES.map(cat=>[cat,{
    countries:195,total_cells:195,
    live_item_candidate_cells:rows.filter(x=>x.category===cat&&x.live_item_candidates_observed>0).length,
    repair_or_missing_first_party_cells:rows.filter(x=>x.category===cat&&x.priority<4).length,
    independently_qualified_paid_cells:0
 }]));
 return{
   schema:"geomacro.revenue-source-demand-195x3.v1",
   source_probe_at:worklist.probed_at??null,
   country_count:195,categories:CATEGORIES,cell_count:585,
   measured_source_checks:worklist.source_checks_completed,
   measured_observed_native_country_cells:worklist.observed_native_country_cells_this_tick,
   scope:"PRIVATE_SOURCE_COVERAGE_ROUTING_ONLY",
   demand_by_category:perCategory,
   service_goal:"ONE_GENUINE_ORIGINAL_PER_REQUEST_OR_GOVERNED_STRUCTURAL_CONTEXT",
   paid_capability_price_catalog_unchanged:true,
   no_false_current_event_for_quiet_countries:true,
   no_license_or_corrob_assumed:true,
   every_variant_requires_existing_commercial_gate:true,
   ingestion_and_d1_b2_write_verified_by_this_receipt:false,
   mainnet_settlement_verified_by_this_receipt:false,
   unpaid_no_source_publish:true,predge_modified:false,
   prioritized_sourcing_queue:rows,
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 if(process.argv.length!==4)throw Error("REVENUE_SOURCE_ARGS_INVALID");
 const item=JSON.parse(readFileSync(process.argv[2],"utf8"));
 const report=buildRevenueSourceDemand(item);
 const dest=resolve(process.argv[3]);mkdirSync(resolve(dest,".."),{recursive:true});
 writeFileSync(dest,JSON.stringify(report,null,2)+"\n",{mode:0o600});
 console.log(JSON.stringify({schema:report.schema,
  country_count:195,category_count:3,total_cells:585,
  demand_by_category:report.demand_by_category,
  first_party_repair_queue:report.prioritized_sourcing_queue.filter(x=>x.priority<4).length,
  newly_qualified_paid_cells:0,source_truth_not_bypassable:true,
  d1_b2_writes:0,payments:0,predge_modified:false}));
}
