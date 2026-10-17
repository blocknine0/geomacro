#!/usr/bin/env node
/** Deterministic bounded daily source-acceptance selection, metadata only. */
import {appendFileSync} from "node:fs";
import {planCountry195DailyRotation,ROTATION_DAYS,COUNTRY_COUNT}
  from "../lib/country-195-daily-rotation.mjs";
const eventName=process.env.GITHUB_EVENT_NAME??"";
const output=process.env.GITHUB_OUTPUT??"";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||!output)
  throw Error("COUNTRY_195_ROTATION_GITHUB_SCOPE_INVALID");
const plan=planCountry195DailyRotation({
  eventName,now:new Date(),
  requestedStart:process.env.REQUESTED_START??"",
  requestedCount:process.env.REQUESTED_COUNT??"",
});
appendFileSync(output,"should_run="+(plan?"true":"false")+"\n");
if(plan){
  appendFileSync(output,"batch_start="+plan.start+"\n");
  appendFileSync(output,"batch_count="+plan.count+"\n");
}
console.log(JSON.stringify({
  schema:"geomacro.country-195-daily-rotation.v1",
  event:eventName,mode:plan?.trigger??"PUSH_NO_COUNTRY_PROBING",
  batch_start:plan?.start??null,batch_count:plan?.count??0,
  rotation_day:plan?.rotation_day??null,
  cycle_day:plan?.cycle_day??null,
  complete_sweep_slots:ROTATION_DAYS,country_baseline:COUNTRY_COUNT,
  requests_per_country_max:12,article_checks_per_country_max:4,
  all_country_network_acceptance_verified:false,
  signed_delivery_verified:false,payments:0,supabase_requests:0,
}));
