#!/usr/bin/env bun
/** Additional bounded FREE newsroom projection of the exact in-memory source
 * sweep performed by the preceding 15-minute source-only step.
 * No network access to a publisher, no raw article bytes, no PREDGE mutation,
 * no signed/paid output. Requires a separate positive research quota grant.
 */
import {readFileSync,unlinkSync} from "node:fs";
import {resolve,sep} from "node:path";
import {createHmac,createHash} from "node:crypto";
import {officialWebsiteCandidateFromOsint,isKnownOfficialWebsiteFeed,
 unverifiedWebsiteSignalFromOsint,publishPrivateOsintWebsiteSignals}
 from "../lib/private-osint-website-bridge.mjs";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model.ts";
import {actorActionNewsObservation} from "../../src/lib/release-news-observation.ts";
import {isConcretePublicIntelligence} from "../../src/lib/intelligence-concrete-publication.ts";
import {dedupeIntelligenceStories} from "../../src/lib/intelligence-news-dedupe.ts";
import {fetchAllDerivedNews} from "../../src/lib/public-derived-news-client.ts";
import {DERIVED_NEWS_TOPIC_POLICY_REVISION,requireDerivedNewsWorkerPolicy}
 from "../lib/derived-news-readback-policy.mjs";

const CAT=["geopolitics","macro","rare_earth"];
const fail=code=>{throw Error("SOURCE_WEBSITE_"+code)};
const env=process.env;
if(env.GITHUB_ACTIONS!=="true"||env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
   env.GITHUB_REF!=="refs/heads/main"||
   env.GEOMACRO_SOURCE_INTAKE_ONLY!=="1"||
   env.PHASE2I_PROVIDER_SOURCE_INTAKE!=="true"||
   env.PHASE2I_PROVIDER_CRITICAL!=="true"||
   env.PHASE2I_PROVIDER_RESEARCH!=="true"||
   ![3,5,10,25,50].includes(Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS)))
 fail("FULL_QUOTA_ADMISSION_REQUIRED");
const temp=resolve(String(env.RUNNER_TEMP??"/never"));
const handoff=resolve(String(env.GEOMACRO_SOURCE_WEBSITE_HANDOFF??"/unavailable"));
if(!handoff.startsWith(temp+sep))fail("EPHEMERAL_HANDOFF_PATH_INVALID");
const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
if(root.length<32)fail("CANONICAL_D1_AUTH_REQUIRED");
let document;
try{
 const source=readFileSync(handoff,{encoding:"utf8"});
 if(source.length>320_000)fail("EPHEMERAL_HANDOFF_OVERSIZE");
 document=JSON.parse(source);
}finally{
 try{unlinkSync(handoff)}catch{/* protected job cleanup is also unconditional */}
}
const clock=Date.parse(document?.checked_at??"");
if(document?.schema!=="geomacro.source-only-ephemeral-website-handoff.v1"||
   document?.source_fetched_once!==true||
   document?.requires_full_research_admission!==true||
   document?.source_urls_must_stay_private!==true||
   document?.predge_unchanged!==true||
   !Number.isFinite(clock)||clock>Date.now()+60_000||
   Date.now()-clock>25*60_000||!Array.isArray(document.rows)||
   document.rows.length>120)
 fail("EPHEMERAL_HANDOFF_CONTRACT_INVALID");
const token=createHmac("sha256",root)
 .update("geomacro-control-plane-v1").digest("hex");
const origin="https://geomacro-control-plane.daspallab202391.workers.dev";
await requireDerivedNewsWorkerPolicy({
 fetchImpl:fetch,url:origin+"/health",
 expectedRevision:DERIVED_NEWS_TOPIC_POLICY_REVISION,
});
// The strict official-issuer recognizer requires pinned publisher feed URL,
// article permalink and original native clock. Nonofficial feeds may ONLY
// enter as explicitly unverified feed observations with proven actor+action.
const official=[],unverified=[];
const counts=Object.fromEntries(CAT.map(x=>[x,{native:0,official:0,osint:0,concrete:0}]));
for(const row of document.rows){
 if(!row||!CAT.includes(row.category)||
    typeof row.article_url!=="string"||typeof row.source_url!=="string"||
    typeof row.title!=="string"||typeof row.published_at!=="string")
   fail("EPHEMERAL_ROW_INVALID");
 counts[row.category].native++;
 const matched=officialWebsiteCandidateFromOsint(row,Date.now());
 if(matched){official.push(matched);counts[row.category].official++;continue}
 if(isKnownOfficialWebsiteFeed(row.source_url,row.category))continue;
 const event=actorActionNewsObservation(row.title);
 if(!event)continue;
 const source={...row,news_id:"news-"+createHash("sha256")
  .update(JSON.stringify([row.category,row.article_url])).digest("hex")};
 const signal=unverifiedWebsiteSignalFromOsint(source,Date.now(),()=>event);
 if(signal&&isConcretePublicIntelligence(signal)){
  unverified.push(signal);counts[row.category].osint++;
 }
}
const officialSignals=deriveStatelessSignals(official,Date.now(),
 {websiteDelay:false,maxSignals:120})
 .filter(signal=>signal.status==="official_release_observed_unscored"&&
   isConcretePublicIntelligence(signal));
const available=dedupeIntelligenceStories([...officialSignals,...unverified])
 .filter(row=>CAT.includes(row.category)&&
   Date.parse(row.published_at)<=Date.now()&&
   Date.parse(row.published_at)>Date.now()-72*3600_000)
 .sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
const lanes=CAT.map(c=>available.filter(s=>s.category===c));
const bounded=[];
for(let depth=0;depth<2;depth++)
 for(const lane of lanes)if(lane[depth])bounded.push(lane[depth]);
for(const row of bounded)counts[row.category].concrete++;
// This is one very small derived D1 batch, only after the provider's separate
// critical + research headroom admission. Nothing may use the source-only
// minimum reserve or change the five private D1 original insert cap.
const published=await publishPrivateOsintWebsiteSignals({
 signals:bounded,controlPlaneRoot:origin,controlToken:token,
 readAll:fetchAllDerivedNews,dedupeAgainstExisting:dedupeIntelligenceStories,
 now:Date.now(),
});
if(published.journal_readback_verified!==true)
 fail("CANONICAL_D1_PUBLIC_READBACK_UNVERIFIED");
console.log(JSON.stringify({
 schema:"geomacro.automatic-source-website-freshness-receipt.v1",
 source_only_15m_same_sweep:true,additional_publisher_requests:0,
 bounded_website_candidates:bounded.length,
 by_category:counts,
 new_visible_derived_news:published.new_derived_stories,
 deferred_existing_or_retention:published.deferred_unpublished,
 canonical_d1_public_readback_verified:true,
 genuine_fresh_native_release_guaranteed:false,
 original_publication_date_modified:false,
 no_new_private_source_ingestion:true,provider_critical_and_research_admitted:true,
 no_extra_schedule:true,commercial_rights_verified:false,
 private_original_urls_logged:false,predge_modified:false,
 signed_or_paid_publications:0,payments:0,
}));
