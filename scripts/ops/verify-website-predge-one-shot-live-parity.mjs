#!/usr/bin/env node
/**
 * GeoMacro-owned ONE-SHOT production acceptance:
 * full public static Website Finds archive -> one canonical D1 bundle ->
 * ONE authenticated PREDGE research GET, all in one bounded observation.
 *
 * No PREDGE code/workflow/deploy/credential modification, no source fetch,
 * no D1 write, no payment, no retries or new tables. This costs ONE existing
 * 500/day partner-GET allowance, and one bounded canonical D1 read.
 * No source-native IDs, article payloads or bearer are logged.
 */
import {createHash} from "node:crypto";
import {isPermanentArchiveSignal,ARCHIVE_INDEX_SCHEMA,ARCHIVE_MONTH_SCHEMA,CATEGORIES}
 from "./publish-permanent-derived-news-archive.mjs";
import {verifyDerivedStory} from "../../workers/control-plane/src/website-derived-intelligence.mjs";
import {buildDerivedNewsStructural} from "../../src/lib/derived-news-structural-bridge.ts";
import {verifyWebsiteNewsCatchupReadback} from "../lib/website-news-canonical-reconciliation.mjs";

const ARCHIVE="https://geomacro-public-finds-archive.daspallab202391.workers.dev";
const CONTROL="https://geomacro-control-plane.daspallab202391.workers.dev";
const MAX_WINDOW_MS=90_000;
const MAX_AGE_MS=6*60*60_000;
const MAX_PARTNER_ITEMS=600;
const PREFIX="GEOMACRO_ONE_SHOT_PARITY_";
const fail=x=>{throw Error(PREFIX+x)};
const allCounts=items=>Object.fromEntries(CATEGORIES.map(c=>[c,items.filter(x=>x.category===c).length]));
const digest=rows=>createHash("sha256")
 .update(rows.map(r=>r.id).sort().join("\n")).digest("hex");
const eligibleAt=(s,now)=>isPermanentArchiveSignal(s,now,{allowHistorical:false})&&
 verifyDerivedStory(s,now);

export function verifyOneShotLiveParity({archive,canonicalBundle,partner,now=Date.now(),observedAt=now}){
 if(!Number.isFinite(now)||!Number.isFinite(observedAt)||
    Math.abs(now-observedAt)>MAX_WINDOW_MS||
    !Array.isArray(archive)||archive.length>600||
    !canonicalBundle||!partner)fail("INPUT_UNVERIFIED");
 const canonicalAt=Date.parse(canonicalBundle.checked_at??"");
 const partnerAt=Date.parse(partner.generated_at??"");
 if(!Number.isFinite(canonicalAt)||!Number.isFinite(partnerAt)||
    Math.abs(canonicalAt-partnerAt)>MAX_WINDOW_MS||
    Math.abs(now-partnerAt)>MAX_WINDOW_MS||
    Math.abs(now-canonicalAt)>MAX_WINDOW_MS)
  fail("COHORT_CLOCK_SPLIT_OR_STALE");
 if(canonicalBundle.ok!==true||
    canonicalBundle.schema!=="geomacro.website-derived-news-bundle.v1"||
    canonicalBundle.delivery_scope!=="free_website_only"||
    canonicalBundle.complete!==true||canonicalBundle.item_cap!==600||
    canonicalBundle.retention_hours!==72||
    canonicalBundle.original_release_delay_minutes!==0||
    !Array.isArray(canonicalBundle.signals)||
    canonicalBundle.signals.length>600||
    canonicalBundle.returned_rows!==canonicalBundle.signals.length)
  fail("CANONICAL_CONTRACT_UNVERIFIED");
 const canonical=canonicalBundle.signals;
 if(partner.ok!==true||
    partner.partner_delivery_schema!=="geomacro.predge.research-news-delivery.v1"||
    partner.authentication!=="DEDICATED_BEARER_ONLY"||
    partner.partner_delivery_scope!=="PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT"||
    partner.projection!=="attributed_research"||
    partner.journal_origin!=="SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE"||
    partner.attribution_must_be_preserved!==true||
    partner.attribution_is_not_a_grant_of_source_rights!==true||
    partner.daily_utc_request_hard_cap!==500||
    partner.distributed_rate_governor!=="ATOMIC_CLOUDFLARE_D1_FAIL_CLOSED"||
    partner.retention_hours!==72||
    partner.original_release_delay_minutes!==0||
    partner.raw_upstream_delivered!==false||
    partner.chargeable!==false||
    partner.paid_launch_approved===true||
    partner.execution_authorized!==false||
    partner.partner_resale_or_commercial_redistribution_authorized!==false||
    partner.unrecognized_source_credits_still_withheld!==true||
    !Array.isArray(partner.items)||partner.items.length>MAX_PARTNER_ITEMS)
  fail("PARTNER_AUTH_OR_RIGHTS_UNVERIFIED");
 const readback=verifyWebsiteNewsCatchupReadback(archive,canonical,now,
   s=>eligibleAt(s,now));
 const projected=buildDerivedNewsStructural(canonical,partnerAt,"attributed_research");
 if(JSON.stringify(partner.items)!==JSON.stringify(projected))
  fail("EXACT_PARTNER_SOURCE_NATIVE_ID_OR_PAYLOAD_MISMATCH");
 const expectedCounts=allCounts(projected);
 if(CATEGORIES.some(c=>partner.counts?.[c]!==expectedCounts[c]))
  fail("PARTNER_CATEGORY_COUNTS_MISMATCH");
 const partnerIds=new Set(projected.map(x=>x.id));
 const withheld=Object.fromEntries(CATEGORIES.map(c=>[c,0]));
 const eligible=[];
 for(const s of archive){
  if(!eligibleAt(s,now))continue;
  eligible.push(s);
  const candidate=buildDerivedNewsStructural([s],partnerAt,"attributed_research");
  if(candidate.length===0){
   if(!Array.isArray(s.sources_credited)||s.sources_credited.length===0||
      partnerIds.has(s.id))fail("UNEXPLAINED_WITHHELD_ID");
   withheld[s.category]++;
   continue;
  }
  if(candidate.length!==1||candidate[0].id!==s.id||
     !partnerIds.has(s.id))fail("ARCHIVE_ELIGIBLE_ID_NOT_IN_AUTH_PARTNER");
 }
 const archiveCounts=allCounts(eligible);
 if(readback.matched_eligible_ids!==eligible.length||
    readback.missing_eligible_ids!==0||
    CATEGORIES.some(c=>readback.counts_by_category[c]!==archiveCounts[c]))
  fail("ARCHIVE_CANONICAL_COUNT_MISMATCH");
 return Object.freeze({
  schema:"geomacro.website-predge-one-shot-live-parity.v1",
  production_acceptance:"PASS_EXACT_SOURCE_NATIVE_ID_AND_ATTRIBUTION",
  authenticated_partner_readback_verified:true,
  exact_complete_canonical_d1_journal_projection_verified:true,
  full_public_archive_current_eligible_ids_in_partner_verified:true,
  source_native_ids_and_all_derived_payload_fields_verified:true,
  attribution_required_preserved:true,unknown_credits_withheld:true,
  evaluated_single_bounded_72h_cohort:true,
  covered_eligible_archive_ids:eligible.length,
  eligible_archive_by_category:archiveCounts,
  withheld_unknown_credits_by_category:withheld,
  authenticated_partner_by_category:expectedCounts,
  archive_eligible_id_digest_sha256:digest(eligible),
  partner_id_digest_sha256:digest(projected),
  paid_or_signed_products_verified:false,
  source_rights_for_resale_verified:false,
  customer_client_acknowledgement_verified:false,
  existing_predge_daily_request_cap:500,
  additional_partner_gets:1,
  canonical_bundle_gets:1,
  d1_writes:0,b2_requests:0,upstream_source_requests:0,payments:0,
 });
}
async function readJson(url,{token,limit=4_000_000}={}){
 const r=await fetch(url,{method:"GET",redirect:"error",cache:"no-store",
  headers:{Accept:"application/json","Cache-Control":"no-cache",
    ...(token?{Authorization:"Bearer "+token}:{})},
  signal:AbortSignal.timeout(12_000)});
 if(!r||r.redirected||r.status!==200)fail("LIVE_HTTP_"+String(r?.status??0));
 if(Number(r.headers.get("content-length")??0)>limit)fail("RESPONSE_OVERSIZE");
 const raw=await r.text();
 if(Buffer.byteLength(raw,"utf8")>limit)fail("RESPONSE_OVERSIZE");
 try{return JSON.parse(raw)}catch{fail("RESPONSE_JSON_INVALID")}
}
export async function runOneShotLiveParity({token=process.env.PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE,now=Date.now()}={}){
 if(!/^[a-f0-9]{64}$/.test(token??""))fail("EXISTING_PROTECTED_TOKEN_UNAVAILABLE");
 const index=await readJson(ARCHIVE+"/index.json",{limit:256_000});
 if(index?.schema!==ARCHIVE_INDEX_SCHEMA||index.seed_complete!==true||
    !Array.isArray(index.months)||index.months.length>600||
    index.months.some(m=>typeof m!=="string"||
      !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(m)))
  fail("STATIC_INDEX_INVALID");
 const months=[...new Set(Array.from({length:5},(_,i)=>
   new Date(now-i*86_400_000).toISOString().slice(0,7)))];
 const archive=[];
 const seen=new Map();
 for(const month of months){
  if(!index.months.includes(month))continue;
  for(const category of CATEGORIES){
   const shard=await readJson(ARCHIVE+"/archive/"+month+"/"+category+".json",
     {limit:20*1024*1024});
   if(shard?.schema!==ARCHIVE_MONTH_SCHEMA||
      shard.month!==month||shard.category!==category||
      !Array.isArray(shard.signals)||shard.signals.length>100_000)
    fail("STATIC_SHARD_INVALID");
   for(const signal of shard.signals){
    if(signal?.category!==category||typeof signal.published_at!=="string"||
       signal.published_at.slice(0,7)!==month)fail("STATIC_SHARD_ROW_INVALID");
    if(!eligibleAt(signal,now))continue;
    const previous=seen.get(signal.id);
    if(previous&&JSON.stringify(previous)!==JSON.stringify(signal))
      fail("STATIC_DUPLICATE_ID_CONFLICT");
    if(!previous){seen.set(signal.id,signal);archive.push(signal);}
   }
  }
 }
 if(archive.length>600)fail("ARCHIVE_BOUNDED_CAP_EXCEEDED");
 // Exactly one D1 bundle GET and one authenticated partner GET. Neither is
 // retried and no other endpoint is permitted to consume either quota.
 const canonicalBundle=await readJson(CONTROL+"/v1/public/website-derived-news-bundle");
 const partner=await readJson(CONTROL+"/v1/partner/predge/derived-structural-72h",
   {token,limit:1_200_000});
 return verifyOneShotLiveParity({archive,canonicalBundle,partner,now:Date.now(),observedAt:now});
}
if(process.argv[1]?.endsWith("verify-website-predge-one-shot-live-parity.mjs")){
 try{console.log(JSON.stringify(await runOneShotLiveParity()))}
 catch(e){
  const code=String(e?.message??"");
  console.error("::error::"+(/^GEOMACRO_ONE_SHOT_PARITY_[A-Z0-9_]+$/u.test(code)
   ?code:"GEOMACRO_ONE_SHOT_PARITY_UNVERIFIED"));
  process.exitCode=2;
 }
}
