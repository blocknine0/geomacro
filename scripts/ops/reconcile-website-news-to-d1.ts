#!/usr/bin/env bun
/** Recover source-native, validated Website archive IDs into the EXISTING 72h
 * canonical D1 journal for BOTH Website and Predge. No second store, no PREDGE
 * route/auth/quota edits, no producer score, customer payment or raw articles.
 * Runs only after the existing D1 source-intake governor admits publication.
 */
import {createHmac} from "node:crypto";
import {isPermanentArchiveSignal, ARCHIVE_INDEX_SCHEMA, ARCHIVE_MONTH_SCHEMA, CATEGORIES}
  from "./publish-permanent-derived-news-archive.mjs";
import {fetchAllDerivedNews} from "../../src/lib/public-derived-news-client";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {prepareDerivedNewsBatches} from "../lib/derived-news-d1-batches.mjs";
import {planWebsiteNewsCatchup,verifyWebsiteNewsCatchupReadback} from "../lib/website-news-canonical-reconciliation.mjs";
import {verifySharedArchivePartnerExpectation} from "../lib/website-shared-partner-expectation.mjs";
import {requireDerivedNewsWorkerPolicy,DERIVED_NEWS_TOPIC_POLICY_REVISION} from "../lib/derived-news-readback-policy.mjs";

const ROOT=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(ROOT.length<32)throw Error("WEBSITE_SHARED_CATCHUP_AUTH_REQUIRED");
const TOKEN=createHmac("sha256",ROOT).update("geomacro-control-plane-v1").digest("hex");
const BASE="https://geomacro-public-finds-archive.daspallab202391.workers.dev";
const WORKER="https://geomacro-control-plane.daspallab202391.workers.dev";
const now=Date.now();
// Health preflight is not a D1 rows-read query; fail before any owner write
// if a stale Worker is still deployed after a repository merge.
await requireDerivedNewsWorkerPolicy({
  fetchImpl:fetch,url:WORKER+"/health",
  expectedRevision:DERIVED_NEWS_TOPIC_POLICY_REVISION,
});
async function read(url,cap){
  const response=await fetch(url,{method:"GET",redirect:"error",cache:"no-store",
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(12_000)});
  if(!response.ok||Number(response.headers.get("content-length")??0)>cap)
    throw Error("WEBSITE_SHARED_ARCHIVE_READ_UNAVAILABLE");
  const raw=await response.text();
  if(Buffer.byteLength(raw,"utf8")>cap)throw Error("WEBSITE_SHARED_ARCHIVE_OVER_SIZE");
  try{return JSON.parse(raw)}catch{throw Error("WEBSITE_SHARED_ARCHIVE_INVALID_JSON")}
}
const index=await read(BASE+"/index.json",256_000);
if(index?.schema!==ARCHIVE_INDEX_SCHEMA||index.seed_complete!==true||
   !Array.isArray(index.months)||index.months.length>600||
   index.months.some(v=>typeof v!=="string"||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(v)))
  throw Error("WEBSITE_SHARED_ARCHIVE_INDEX_UNVERIFIED");
// At most two month boundaries overlap 72h, including year transitions.
// Probe last five original-date UTC days; missing months represent no archived rows.
const months=new Set();
for(let d=0;d<=4;d++)months.add(new Date(now-d*86_400_000).toISOString().slice(0,7));
const archive=[];
for(const month of months){
  if(!index.months.includes(month))continue;
  for(const category of CATEGORIES){
    const doc=await read(BASE+"/archive/"+month+"/"+category+".json",20*1024*1024);
    if(doc?.schema!==ARCHIVE_MONTH_SCHEMA||doc.month!==month||
       doc.category!==category||!Array.isArray(doc.signals)||doc.signals.length>100_000)
      throw Error("WEBSITE_SHARED_ARCHIVE_SHARD_INVALID");
    for(const s of doc.signals){
      if(s?.category!==category||typeof s?.published_at!=="string"||
         s.published_at.slice(0,7)!==month)
        throw Error("WEBSITE_SHARED_ARCHIVE_SHARD_MISMATCH");
      if(isPermanentArchiveSignal(s,now,{allowHistorical:false})&&verifyDerivedStory(s,now))
        archive.push(s);
    }
  }
}
const canonical=await fetchAllDerivedNews(fetch,now);
const planned=planWebsiteNewsCatchup(archive,canonical,now,
  s=>isPermanentArchiveSignal(s,now,{allowHistorical:false})&&verifyDerivedStory(s,now));
if(planned.divergent_existing_ids)
  throw Error("WEBSITE_SHARED_CANONICAL_ARCHIVE_REVISION_DIVERGENCE");
const {chunks}=prepareDerivedNewsBatches(planned.missing);
for(const chunk of chunks){
  if(!chunk.length)continue;
  const response=await fetch(WORKER+"/v1/website-derived-news",{
    method:"PUT",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+TOKEN,"Content-Type":"application/json"},
    body:JSON.stringify({schema:"geomacro.website-derived-news-batch.v1",signals:chunk}),
    signal:AbortSignal.timeout(12_000)});
  if(!response.ok)throw Error("WEBSITE_SHARED_D1_CATCHUP_WRITE_UNAVAILABLE");
  const receipt=await response.json().catch(()=>null);
  if(receipt?.ok!==true||receipt.accepted!==chunk.length)
    throw Error("WEBSITE_SHARED_D1_CATCHUP_ACK_INVALID");
}
const readbackAt=Date.now();
const result=await fetchAllDerivedNews(fetch,readbackAt);
const readback=verifyWebsiteNewsCatchupReadback(archive,result,readbackAt,
  s=>isPermanentArchiveSignal(s,readbackAt,{allowHistorical:false})&&
    verifyDerivedStory(s,readbackAt));
// Reuse the SAME verified D1 snapshot, with no new D1 or partner GET.
// This predicts eligible attributed IDs; authenticated live proof remains separate.
const partnerExpectation=verifySharedArchivePartnerExpectation(archive,result,readbackAt);
console.log(JSON.stringify({
  schema:"geomacro.website-predge-common-journal-catchup.v1",
  same_canonical_d1_journal_for_website_and_partner:true,
  eligible_archive_ids:planned.eligible_archive_ids,
  already_present:planned.already_present,
  newly_published:planned.missing.length,
  missing_eligible_ids:readback.missing_eligible_ids,
  readback_eligible_ids:readback.eligible_archive_ids,
  readback_category_counts:readback.counts_by_category,
  eligible_partner_projection:partnerExpectation,
  existing_shared_quota_reused:true,
  additional_d1_reads_for_projection:0,
  additional_partner_gets_for_projection:0,
  exact_source_native_payloads_verified:readback.exact_derived_payloads_and_source_clocks_verified,
  recovery_exercised:planned.missing.length>0,
  nonempty_eligible_archive_cohort:readback.eligible_archive_ids>0,
  authenticated_partner_live_delivery_verified:false,
  conflicting_existing_ids:0,
  retention_hours:72,
  source_clocks_preserved:readback.exact_derived_payloads_and_source_clocks_verified,
  predge_auth_or_quota_modified:false,
  original_upstream_data_delivered:false,
  signed_gro_created:false,
  real_money_payments:0
}));
