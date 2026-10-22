#!/usr/bin/env node
// 2-hour six-continent one-country source-only planner. Never contacts a source.
import {appendFileSync,readFileSync} from "node:fs";
import {planTwoHourContinentCountrySweep} from "../lib/continent-country-195-rotation.mjs";
const repo=process.env.GITHUB_REPOSITORY,ref=process.env.GITHUB_REF,
 output=process.env.GITHUB_OUTPUT,eventName=process.env.GITHUB_EVENT_NAME;
if(repo!=="blocknine0/geomacro"||ref!=="refs/heads/main"||
   !output||!["schedule","workflow_dispatch"].includes(eventName))
 throw Error("CONTINENT_COUNTRY_195_PROTECTED_MAIN_ONLY");
const plan=planTwoHourContinentCountrySweep({
 continent:process.env.GEOMACRO_CONTINENT,
 registryText:readFileSync("src/lib/canonical-country-registry-195.ts","utf8"),
 eventName,now:new Date(),requestedIso3:process.env.GEOMACRO_REQUESTED_COUNTRY??""
});
appendFileSync(output,
 "batch_start="+plan.batch_start+"\n"+
 "batch_count=1\n"+
 "expected_country="+plan.country_iso3+"\n"+
 "continent="+plan.continent+"\n");
console.log(JSON.stringify({
 schema:"geomacro.195-six-continent-two-hour-source-sweep.v1",
 continent:plan.continent,country_iso3:plan.country_iso3,
 group_country_count:plan.continent_country_count,
 complete_group_sweep_hours:plan.sweep_duration_hours,
 requested_category_count:plan.all_categories,
 provider_request_upper_bound:12,issuer_page_upper_bound:4,
 current_original_found:false,current_verified_signed_products:false,
 source_readability_not_universal:true,
 GH_actions_cron_best_effort:true,payments:0,b2_requests:0,
 supabase_requests:0
}));
