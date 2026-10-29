#!/usr/bin/env node
/**
 * One no-key World Bank WDI batch for country-level Macro reference availability.
 * This is official PERIODIC data metadata, NOT 195 fresh macro news items or
 * signed/payable intelligence. The existing verified bounded adapter owns GET.
 * No D1/B2 writes, no raw values, no PREDGE access.
 */
import {writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {observeWorldBank195} from "../lib/wdi-195-batch-reference.mjs";

const live=process.argv.includes("--live");
const now=new Date();
const output=resolve(process.env.RUNNER_TEMP??"/tmp","geomacro-195x3-query-regression");
mkdirSync(output,{recursive:true});
const receipt={
 schema:"geomacro.195x3-official-macro-source-reference.v1",
 checked_at:now.toISOString(),source:"world_bank_wdi",
 mode:live?"LIVE_ONE_BOUNDED_PROVIDER_BATCH":"OFFLINE_NOT_REQUESTED",
 provider_request_count:0,provider_health:"NOT_ATTEMPTED",
 country_universe:195,
 reference_period:null,verified_country_indicator_availability:[],
 macro_current_event_verified:false,macro_signed_outputs_verified:0,
 geopolitics_originals_verified:0,minerals_current_originals_verified:0,
 country_current_live_coverage_claimed:false,
 source_rights_review_complete:false,raw_source_values_stored:false,
 source_metadata_is_not_a_customer_answer:true,
 d1_writes:0,b2_writes:0,predge_modified:false,payments:0
};
if(live){
 receipt.provider_request_count=1;
 try{
  const r=await observeWorldBank195({now});
  if(r.iso3_routing_universe_count!==195 ||r.per_country_reference_availability.length!==195)
    throw Error("WDI_COUNTRY_UNIVERSE_INCOMPLETE");
  receipt.provider_health="OBSERVED_PERIODIC_METADATA";
  receipt.reference_period=r.observation_year_floor;
  receipt.verified_country_indicator_availability=r.per_country_reference_availability;
  receipt.indicators=r.indicators;
  receipt.provider_request_count=r.source_calls;
 }catch(error){
  const raw=String(error?.message??"WDI_NETWORK_UNAVAILABLE");
  receipt.provider_health="UNAVAILABLE_OR_DENIED";
  receipt.error_code=/^WDI_[A-Z_]+$/u.test(raw)?raw:"WDI_NETWORK_UNAVAILABLE";
 }
}
writeFileSync(output+"/wdi-official-macro-country-availability.json",
  JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify({source:receipt.source,provider_health:receipt.provider_health,
  indicators:receipt.indicators??[],provider_request_count:receipt.provider_request_count,
  current_live_country_coverage_verified:false,payments:0}));
