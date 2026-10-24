#!/usr/bin/env node
import {mkdirSync,writeFileSync} from "node:fs";
import {fetchRbiMacroPressReference} from "../lib/rbi-official-macro-release.mjs";
if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   process.env.GITHUB_REF!=="refs/heads/main"||
   !/^[0-9]{1,20}$/u.test(process.env.GITHUB_RUN_ID??""))
 throw Error("RBI_PRIVATE_PROTECTED_MAIN_REQUIRED");
for(const key of ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
 "B2_KEY_ID","B2_APPLICATION_KEY","CLOUDFLARE_API_TOKEN",
 "COINBASE_X402_MAINNET_ACK","RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64"])
 if(process.env[key])throw Error("RBI_REFERENCE_FORBIDDEN_CREDENTIALS");
let receipt;
try{
 receipt={...await fetchRbiMacroPressReference(),checked_at:new Date().toISOString(),
  status:"FIRST_PARTY_RSS_REFERENCE_ONLY_NOT_COMMERCIAL"};
}catch(error){
 const reason=String(error?.message??"");
 receipt={schema:"geomacro.rbi-original-macro-reference.v1",
  checked_at:new Date().toISOString(),country_iso3:"IND",category:"macro",
  status:"RBI_REFERENCE_NOT_VERIFIED",
  reason:/^RBI_[A-Z0-9_]+$/u.test(reason)?reason:"RBI_UNKNOWN_FAILURE",
  rss_items_inspected:0,exact_original_link_ids:0,
  current_24h_rss_reference_items:0,
  original_page_html_readback_verified:false,
  publisher_original_first_published_clock_verified:false,
  article_scoped_commercial_rights_verified:false,
  independent_event_facts_verified:false,
  numerical_macro_values_verified:false,current_signed_gri_verified:false,
  commercial_paid_eligible:false,raw_article_urls_titles_or_bytes_exposed:false,
  supabase_requests:0,b2_requests:0,d1_writes:0,payments:0};
}
mkdirSync("artifacts/rbi-official-macro-reference",{recursive:true,mode:0o700});
writeFileSync("artifacts/rbi-official-macro-reference/receipt.json",
 JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(receipt));
if(receipt.status!=="FIRST_PARTY_RSS_REFERENCE_ONLY_NOT_COMMERCIAL"||
   receipt.exact_original_link_ids===0)
 process.exitCode=3;
