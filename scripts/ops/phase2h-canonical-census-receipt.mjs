#!/usr/bin/env node
/** Metadata-only canonical D1 raw-news census, AFTER unchanged maintenance admission.
 * This does not issue B2 requests, inspect private titles, or claim source coverage.
 */
import {mkdirSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {readPhase2hCanonicalCensus} from "./phase2h-permanent-production-acceptance.mjs";

const OUTPUT="artifacts/derived-news/phase2h-canonical-census-receipt.json";
const CATEGORIES=["geopolitics","macro","rare_earth"];
const fail=reason=>{throw Error("PHASE2H_CENSUS_"+reason)};
export function buildPhase2hCensusReceipt(census,{now=new Date(),sha=null}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !census||!CATEGORIES.every(c=>{
     const row=census.category_counts?.[c];
     return row&&["staged","archived","pending"].every(k=>
       Number.isSafeInteger(row[k])&&row[k]>=0)&&
       row.staged===row.archived+row.pending;
    }))fail("CATEGORY_TOTALS_INVALID");
 const total=k=>CATEGORIES.reduce((n,c)=>n+census.category_counts[c][k],0);
 if(["staged","archived","pending"].some(k=>
    census[k+"_total"]!==total(k)))fail("CANONICAL_TOTALS_DIVERGED");
 if(sha!==null&&!/^[a-f0-9]{40}$/u.test(sha))fail("GITHUB_SHA_INVALID");
 return {
  schema:"geomacro.phase2h.production-canonical-census-receipt.v1",
  status:"CANONICAL_D1_CATEGORY_CENSUS_READBACK_VERIFIED_B2_NOT_PROVEN",
  observed_at:now.toISOString(),production_main_sha:sha,
  provider_maintenance_required:true,
  b2_put_or_get_performed:false,
  staged_total:census.staged_total,archived_total:census.archived_total,
  pending_total:census.pending_total,category_counts:census.category_counts,
  registered_website_osint_row_provenance_verified:false,
  collector_origin_reconstruction:"UNVERIFIED_HISTORIC_ROWS_LACK_PRODUCER_TAG",
  archived_object_bytes_verified_by_this_census:false,
  commercial_rights_verified:false,payments:0
 };
}
function persist(receipt){
 mkdirSync("artifacts/derived-news",{recursive:true,mode:0o700});
 writeFileSync(OUTPUT,JSON.stringify(receipt)+"\n",{mode:0o600});
}
export async function capturePhase2hCanonicalCensus({
 env=process.env,now=new Date(),reader=readPhase2hCanonicalCensus
}={}){
 // The same maintenance evidence is required by the underlying provider
 // census reader. No standalone read-only bypass on a held account.
 if(env.PHASE2H_PROVIDER_MAINTENANCE!=="true"||
    env.GITHUB_ACTIONS!=="true"||
    env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
    env.GITHUB_REF!=="refs/heads/main")
  fail("PROTECTED_MAINTENANCE_REQUIRED");
 const census=await reader({env});
 const receipt=buildPhase2hCensusReceipt(census,{now,sha:env.GITHUB_SHA??null});
 persist(receipt);
 return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const receipt=await capturePhase2hCanonicalCensus();
  console.log(JSON.stringify(receipt));
 }catch(error){
  const message=String(error?.message??"");
  const safe=/^PHASE2H_(?:CENSUS|PERMANENT)_[A-Z0-9_]+$/u.test(message)?
    message:"PHASE2H_CENSUS_PROVIDER_READBACK_UNVERIFIED";
  // A failure record is diagnostic only; zero category counts cannot be
  // invented when the provider query was held or unavailable.
  persist({schema:"geomacro.phase2h.production-canonical-census-receipt.v1",
   status:"CENSUS_UNVERIFIED",reason:safe,category_counts:null,
   b2_put_or_get_performed:false,payments:0});
  console.error("::error::"+safe);
  process.exitCode=3;
 }
}
