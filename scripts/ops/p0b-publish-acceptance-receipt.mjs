#!/usr/bin/env node
/** Independent production readback receipt publication; only aggregate flags.
 * Never output raw publisher material, article URLs, private D1 or secrets.
 */
import {readFileSync} from "node:fs";
const FILE="artifacts/derived-news/p0b-source-first-live-acceptance.json";
const STATUSES=new Set(["NOT_REQUIRED_OR_DISABLED","FIRST_PARTY_METADATA_GROUNDED",
 "DISCOVERY_ONLY_UNVERIFIED","NO_VERIFIED_NEWS","GLOBAL_PROVIDER_UNAVAILABLE",
 "NO_TOPICAL_SEARCH_TERMS"]);
export function formatP0BReceiptComment(raw,run){
 const cats=["geopolitics","macro","rare_earth"];
 const sha=/^[a-f0-9]{40}$/u.test(raw?.deployed_sha??"")&&
  raw.deployed_sha===raw.expected_sha;
 const lines=["GeoMacro P0-B post-deploy production: **"+
  (raw?.accepted===true?"PASS":"NOT ACCEPTED")+"**",
  "Run: "+run,"Exact deployed commit verified: "+(sha?"YES":"NO")];
 for(const cat of cats){
  const x=Array.isArray(raw?.source_first_readbacks)?
   raw.source_first_readbacks.find(z=>z.category===cat):null;
  const status=STATUSES.has(x?.fallback_status)?x.fallback_status:"UNVERIFIED";
  lines.push("- "+cat+": contract="+(x?.source_or_fallback_contract_verified===true?"PASS":"NOT VERIFIED")+
   "; intelligence="+(x?.grounded_five_part_available===true?"PASS":"NOT VERIFIED")+
   "; fallback_attempted="+(x?.attempted===true)+
   "; grounded_five_part="+(x?.grounded_five_part_available===true)+
   "; first_party_count="+(Number.isInteger(x?.verified_first_party_count)?x.verified_first_party_count:0)+
   "; discovery_only_count="+(Number.isInteger(x?.discovery_only_count)?x.discovery_only_count:0)+
   "; provider_errors="+(Number.isInteger(x?.provider_errors)?x.provider_errors:"unknown")+
   "; status="+status+
   "; govuk="+(STATUSES.has(x?.provider_diagnostics?.govuk)?x.provider_diagnostics.govuk:
    /^[A-Z_0-9]{2,40}$/u.test(x?.provider_diagnostics?.govuk??"")?
     x.provider_diagnostics.govuk:"UNVERIFIED")+
   "; gdelt="+(/^[A-Z_0-9]{2,40}$/u.test(x?.provider_diagnostics?.gdelt??"")?
     x.provider_diagnostics.gdelt:"UNVERIFIED"));
 }
 lines.push("This redacted receipt does not claim universal coverage, article licensing or payments.");
 return lines.join("\n")+"\n";
}
if(process.argv[1]&&import.meta.url.endsWith("/p0b-publish-acceptance-receipt.mjs")){
 try{
  const run=process.env.RUN_URL,token=process.env.GH_TOKEN;
  if(process.env.GITHUB_ACTIONS!=="true"||
   process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   !/^https:\/\/github\.com\/blocknine0\/geomacro\/actions\/runs\/\d+$/u.test(run??"")||
   typeof token!=="string"||token.length<20)
   throw Error("P0B_RECEIPT_AUTH_UNAVAILABLE");
  let receipt;
  try{receipt=JSON.parse(readFileSync(FILE,"utf8"))}
  catch{receipt={accepted:false,source_first_readbacks:[]};}
  const body=formatP0BReceiptComment(receipt,run);
  const r=await fetch("https://api.github.com/repos/blocknine0/geomacro/issues/3213/comments",{
   method:"POST",redirect:"error",
   headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
    "Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},
   body:JSON.stringify({body}),signal:AbortSignal.timeout(12000)});
  if(r.status!==201)throw Error("P0B_ISSUE_RECEIPT_WRITE_UNVERIFIED");
  console.log("P0B_REDACTED_ACCEPTANCE_ISSUE_RECEIPT_POSTED");
 }catch(e){
  console.error(/^P0B_[A-Z_]+$/u.test(String(e?.message))?
   e.message:"P0B_RECEIPT_PUBLICATION_FAILED");
  process.exitCode=2;
 }
}
