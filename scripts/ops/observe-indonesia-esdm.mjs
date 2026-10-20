#!/usr/bin/env node
// Indonesia ESDM source discovery only. One first-party GET per existing daily slot.
import {mkdirSync,writeFileSync} from "node:fs";
import {observeIndonesiaEsdmIndex} from "../lib/indonesia-esdm-official-index.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
 throw Error("ESDM_PROTECTED_MAIN_REQUIRED");
let receipt;
try{receipt=await observeIndonesiaEsdmIndex();}
catch(e){
 const code=String(e?.message??"");
 receipt={schema:"geomacro.indonesia-esdm-official-index.v1",
   publisher:"indonesia_esdm",country_iso3:"IDN",
   category:"rare_earth",status:"OFFICIAL_UPSTREAM_UNVERIFIED",
   reason:/^ESDM_[A-Z_]+$/u.test(code)?code:"ESDM_NETWORK_FAILURE",
   dated_index_entries_within_30d:0,
   mineral_topic_index_candidates_within_30d:0,
   mineral_topic_index_candidates_within_7d:0,latest_candidate_index_day:null,
   first_party_article_original_verified:false,
   individual_item_native_timestamp_verified:false,
   observed_mine_supply_disruption_verified:false,
   all_195_country_mineral_coverage_verified:false,
   paid_derived_rights_verified:false,customer_delivery_enabled:false,
   raw_html_stored:false,raw_titles_stored:false,
   b2_requests:0,d1_writes:0,supabase_requests:0,payments:0};
}
mkdirSync("artifacts/official-national-mineral-index",{recursive:true,mode:0o700});
writeFileSync("artifacts/official-national-mineral-index/indonesia-esdm.json",JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify({schema:receipt.schema,status:receipt.status,reason:receipt.reason??null,
 indexed_press_items_30d:receipt.dated_index_entries_within_30d,
 dated_mineral_leads_7d:receipt.mineral_topic_index_candidates_within_7d,
 verified_article_originals:0,commercial_delivery:false,external_requests:1,payments:0}));
if(receipt.status==="OFFICIAL_UPSTREAM_UNVERIFIED")process.exitCode=3;
