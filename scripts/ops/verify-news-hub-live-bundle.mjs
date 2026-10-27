#!/usr/bin/env node
/** One bounded, source-neutral readback bundle for website + machine + country coverage.
 * This consumer never fetches upstream publisher sources and never writes D1.
 * It is conditional on the existing account-wide D1 quota gate in GitHub Actions.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {verifyDerivedNewsPublicReadback} from "./verify-derived-news-public-readback.mjs";
import {verifySharedNewsLive} from "./verify-shared-derived-news-live.mjs";
import {verifyProductionObserved195x3} from "./verify-production-observed-195x3.mjs";
const CATS=["geopolitics","macro","rare_earth"];
export function assembleNewsHubReceipt(website,shared,coverage,now=new Date()){
 if(website?.verified!==true||shared?.same_journal_ids_verified!==true||
   coverage?.live_response_valid!==true||coverage?.returned_cells!==585||
   coverage?.country_routes!==195||coverage?.category_routes!==3||
   CATS.some(k=>!Number.isSafeInteger(website.categories?.[k]?.stored_72h)||
     !Number.isSafeInteger(shared.counts?.[k])||
     !Number.isSafeInteger(coverage.observed_journal_records_by_category?.[k])))
    throw Error("NEWS_HUB_LIVE_READBACK_CONTRACT_FAILED");
 if(CATS.reduce((n,k)=>n+shared.counts[k],0)>600 ||
    CATS.reduce((n,k)=>n+website.categories[k].stored_72h,0)>250 ||
    coverage.observed_country_category_cells+coverage.cells_without_matching_derivation!==585)
    throw Error("NEWS_HUB_BUNDLE_BOUND_EXCEEDED");
 return Object.freeze({
  schema:"geomacro.central-news-intelligence-hub-bundle.v1",
  checked_at:now.toISOString(),source_authority:"existing D1 derived Intelligence journal",
  website_feed_verified:true,machine_same_journal_ids_verified:true,
  three_category_observed_coverage_checked:true,
  domains:Object.fromEntries(CATS.map(k=>[k,{
    website_latest_250:website.categories[k].stored_72h,
    source_neutral_machine_72h:shared.counts[k],
    public_archive_latest_250:coverage.observed_journal_records_by_category[k]}])),
  country_routes:195,country_category_cells:585,
  cells_with_observed_country_mentions:coverage.observed_country_category_cells,
  cells_without_observed_country_mentions:coverage.cells_without_matching_derivation,
  all_195x3_native_source_coverage_verified:false,
  same_event_independent_verification:false,commercial_rights_verified:false,
  no_new_event_is_not_failure:true,raw_source_logged:false,
  additional_direct_d1_writes:0,b2_requests:0,payment_attempts:0,
 });
}
export async function verifyNewsHubLiveBundle({
  websiteRead=verifyDerivedNewsPublicReadback,sharedRead=verifySharedNewsLive,
  coverageRead=verifyProductionObserved195x3,now=new Date(),
}={}){
 // Serial polling prevents bursts against the same D1 authority.
 const website=await websiteRead({now});
 const shared=await sharedRead();
 const coverage=await coverageRead({now});
 return assembleNewsHubReceipt(website,shared,coverage,now);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const receipt=await verifyNewsHubLiveBundle();
  mkdirSync("artifacts/news-hub",{recursive:true,mode:0o700});
  writeFileSync("artifacts/news-hub/bundled-readback.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(receipt));
 }catch(err){
  const allow=new Set(["NEWS_HUB_LIVE_READBACK_CONTRACT_FAILED","NEWS_HUB_BUNDLE_BOUND_EXCEEDED"]);
  console.error(err instanceof Error&&allow.has(err.message)?err.message:"NEWS_HUB_LIVE_READBACK_UNAVAILABLE");
  process.exitCode=2;
 }
}
