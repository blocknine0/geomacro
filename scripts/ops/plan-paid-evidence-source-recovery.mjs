#!/usr/bin/env node
/**
 * Deterministic owner-only planning over already-observed commercial gaps.
 * No upstream request, D1/B2 read, payment, source promotion, GitHub dispatch,
 * API key, signed GRO issuance, or PREDGE I/O. A gap requires an existing
 * trusted producer + independently qualified structural/signed publisher.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from "node:fs";
import {resolve,basename} from "node:path";
import {fileURLToPath} from "node:url";

const ROOT=resolve(fileURLToPath(new URL("../..",import.meta.url)));
const manifest=JSON.parse(readFileSync(resolve(ROOT,"config/paid-evidence-recovery-routes.v1.json"),"utf8"));
const fail=code=>{throw Error("PAID_SOURCE_RECOVERY_"+code)};
export function verifyRoutingCatalog(catalog,{exists=existsSync}={}){
 if(catalog?.schema_version!=="geomacro.paid-evidence-recovery-routes.v1"||
  catalog.canonical_database!=="Cloudflare D1"||catalog.archive_store!=="Backblaze B2"||
  catalog.new_source_fetches_authorized!==false||catalog.new_d1_writers_authorized!==false||
  catalog.predge_immutable!==true||catalog.no_blanket_eligibility!==true||
  !catalog.modules||typeof catalog.modules!=="object")
  fail("CATALOG_POLICY_INVALID");
 const known=new Set(["macro_monetary","external_fx","sovereign_fiscal",
  "political_governance","geopolitical_security","sanctions_restrictions",
  "trade_corridor","critical_minerals","energy_commodities",
  "banking_financial_system","food_agriculture","natural_hazards",
  "hot_topics","signed_risk_object"]);
 if(Object.keys(catalog.modules).length!==known.size)fail("MODULE_COUNT_INVALID");
 const workflows=new Set();
 for(const [name,row] of Object.entries(catalog.modules)){
  if(!known.has(name)||!row||typeof row!=="object"||
    !/^[A-Z0-9_]+$/u.test(row.source_route)||
    !/^[a-z0-9_]+$/u.test(row.internal_source_id)||
    !/^[a-z0-9_-]+\.yml$/u.test(row.producer_workflow)||
    /predge|partner|payment|settlement/iu.test(row.producer_workflow)||
    row.commercial_eligibility_is_separate!==true||
    row.source_native_date_required!==true||
    row.source_status!=="CANDIDATE_ROUTE_NOT_LIVE_QUALIFICATION"||
    !exists(resolve(ROOT,".github/workflows",row.producer_workflow)))
    fail("SOURCE_ROUTE_NOT_VERIFIED");
  workflows.add(row.producer_workflow);
 }
 return {verified_module_routes:known.size,existing_producer_workflows:workflows.size,
  predge_paths_touched:0,new_data_fetches:0,d1_reads:0,b2_reads:0,usdc_spent:"0"};
}
const moduleToSource=(code,catalog)=>catalog.modules[code];
export function planPaidEvidenceRecovery({
 catalog=manifest,
 observedMissingModules=["macro_monetary","geopolitical_security"],
 requestCountries=["USA"],
 checkedAt="2026-10-28T23:40:06.490Z",
 currentNow=new Date(),
}={}){
 const receipt=verifyRoutingCatalog(catalog);
 if(!Array.isArray(observedMissingModules)||observedMissingModules.length>30||
    !Array.isArray(requestCountries)||requestCountries.length>6||
    !Number.isFinite(Date.parse(checkedAt))||!Number.isFinite(currentNow.getTime()))
    fail("INPUT_INVALID");
 const countries=[...new Set(requestCountries.map(x=>String(x).toUpperCase()))];
 if(countries.some(x=>!/^[A-Z]{3}$/u.test(x)))fail("COUNTRY_INVALID");
 const seen=new Set(),tasks=[];
 for(const module of observedMissingModules){
  if(typeof module!=="string"||!moduleToSource(module,catalog))fail("MODULE_UNROUTED");
  for(const country of countries){
   const key=country+":"+module;
   if(seen.has(key))continue;seen.add(key);
   const route=moduleToSource(module,catalog);
   tasks.push({
    subject:{type:"country",country_iso3:country},required_module:module,
    existing_producer:route.producer_workflow,upstream_route:route.source_route,
    operator_action:"CHECK_PRODUCER_RECEIPT_THEN_QUALIFY_MISSING_MODULE",
    publisher_admission:"VERIFY_NATIVE_DATE_HASH_COUNTRY_AND_RIGHTS",
    commercial_data_verified:false,signed_output_verified:false,
    recovery_unblocked:false,triggered_existing_producer:false,
    raw_source_disclosed_to_buyer:false
   });
  }
 }
 const age=Math.max(0,currentNow.getTime()-Date.parse(checkedAt));
 return Object.freeze({
   schema:"geomacro.paid-evidence-gap-owner-plan.v1",
   planned_at:currentNow.toISOString(),
   source_receipt_checked_at:checkedAt,
   observed_proof_age_seconds:Math.floor(age/1000),
   old_observations_not_automatically_fresh:true,
   admission_rule:"EXISTING_NATIVE_SOURCE_TO_QUALIFIED_D1_TO_HASHED_B2_TO_CANONICAL_PAID_READBACK",
   false_422_suppression:false,
   first_sale_data_eligible_category:"critical_minerals",
   first_sale_payment_rail:"LOCKED",
   initial_real_sale_possible:false,
   future_rechecks_required:true,
   selected_gaps:tasks.length,
   tasks,
   guardrails:{...receipt,canonical_d1_writes:0,successful_customer_settlements:0,
    source_publisher_rights_automatically_granted:false,
    no_signatures_invented:true,no_raw_osint_promotion:true},
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const plan=planPaidEvidenceRecovery();
  const path=resolve(ROOT,"artifacts/news-hub/paid-source-recovery-plan.json");
  mkdirSync(resolve(ROOT,"artifacts/news-hub"),{recursive:true});
  writeFileSync(path,JSON.stringify(plan,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify({schema:plan.schema,selected_gaps:plan.selected_gaps,
    existing_routed_source_count:plan.guardrails.verified_module_routes,
    confirmed_launch_ready:plan.initial_real_sale_possible,
    first_sale_payment_rail:plan.first_sale_payment_rail,
    canonically_published_new_evidence:false}));
 }catch(e){
  const allowed=/^PAID_SOURCE_RECOVERY_[A-Z0-9_]+$/u;
  console.error(allowed.test(e?.message??"")?e.message:"PAID_SOURCE_RECOVERY_UNCLASSIFIED");
  process.exitCode=2;
 }
}
