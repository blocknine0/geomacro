#!/usr/bin/env node
// Existing shared daily source slot; IMF estimates/forecasts remain unclassified.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeImf195} from "../lib/imf-195-country-reference-gap.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
 throw Error("IMF_195_MAIN_REQUIRED");
const receipt=await observeImf195();
mkdirSync("artifacts/imf-195-reference",{recursive:true,mode:0o700});
writeFileSync("artifacts/imf-195-reference/receipt.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({
 schema:receipt.schema,checked_at:receipt.checked_at,
 indicator_fetches:receipt.requests_attempted,
 successful_source_indicator_transports:receipt.verified_indicator_transports,
 reference_year:receipt.indicators[0]?.reference_year??null,
 indicator_countries:receipt.indicators.map(r=>({
   indicator:r.indicator,countries:r.countries_with_imf_reference,
   reason:r.reason??null,forecast_actual_verified:false
 })),
 all_195_live_macro_verified:false,paid_delivery:false,payments:0
}));
if(receipt.verified_indicator_transports!==2)process.exitCode=3;
