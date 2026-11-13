#!/usr/bin/env bun
/** Production source-only governor lane: existing 15m pinned feeds -> at most
 * the provider-authorized five Phase 2H D1 originals. Does NOT publish website
 * cards, persist the broad OSINT health ring, use B2, sign, settle or touch
 * PREDGE. Used only when critical/research publication is held but the
 * independent source_intake lane has positive provider approval. The actual
 * Free minimum lane may run during any permitted source-intake tier, including
 * CRITICAL_ONLY (critical=true, research=false):
 * no full OSINT health ring, speculative research, signing or public output.
 */
import {createHmac,createHash} from "node:crypto";
import {buildDirect20mSourceHealthProof} from "../lib/direct20m-source-health-proof.mjs";
import {resolve,sep,dirname} from "node:path";
import {writeFileSync,readFileSync,mkdirSync} from "node:fs";
import {planSourceWebsiteHandoff} from "../lib/source-only-website-handoff.mjs";
import {collectPrivateOsint15m} from "../lib/private-osint-15m-collector.mjs";
import {privateOsintRuntimeSources} from "../lib/private-osint-country-rotation.mjs";
import {privateOsintGlobalSources} from "../lib/private-osint-global-sources.mjs";
import {hot50Direct20mPublisherRegistry,hot50Direct20mFailoverCategories} from "../lib/hot-50-direct-20m-sources.mjs";
import {threeDomainGlobal20mPublisherRegistry} from "../lib/three-domain-global-direct-20m-sources.mjs";
import {privateOsintCountryMention} from "../lib/private-osint-country-mentions.mjs";
import {stagePhase2iOsintFairRaw} from "../lib/phase2i-osint-country-fair-raw-staging.mjs";
import {persistPrivateOsintHeartbeats} from "../lib/phase2i-osint-source-heartbeat.mjs";
import {createPhase2iSingleSweepOriginalIndex} from "../lib/phase2i-single-sweep-original-index.mjs";
import {PRIVATE_OSINT_TOPICS} from "../lib/private-osint-global-sources.mjs";
import {mergePrivatePhase2iSourceBacklog,sealPrivatePhase2iSourceBacklog}
 from "../lib/phase2i-encrypted-source-backlog.mjs";
import {appendAndLeasePhase2i,acknowledgePhase2i,phase2iDurableStatus,
 durableCandidateId} from "../lib/phase2i-durable-queue-client.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {HOT50_COUNTRY_SET} from "../lib/hot-50-country-watch.mjs";
import {normalizeReusableNewsJson} from "../../src/lib/reusable-news-json.ts";
import {deriveStatelessSignals} from "../../src/lib/stateless-intelligence-model.ts";

const env=process.env;
if(env.GITHUB_ACTIONS!=="true"||
 env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 env.GITHUB_REF!=="refs/heads/main"||
 env.GEOMACRO_SOURCE_INTAKE_ONLY!=="1"||
 env.PHASE2I_PROVIDER_SOURCE_INTAKE!=="true"||
 !["true","false"].includes(env.PHASE2I_PROVIDER_CRITICAL??"")||
 !["true","false"].includes(env.PHASE2I_PROVIDER_RESEARCH??"")||
 !Number.isSafeInteger(Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS))||
 Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS)<3||
 Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS)>100)
 throw Error("PHASE2I_SOURCE_ONLY_PROVIDER_ADMISSION_REQUIRED");
// Spend no more than the live provider admission. Five is the existing
// D1 collision-isolation batch cap, NOT an authority to exceed a 3-row slot.
const providerRows=Number(env.PHASE2I_PROVIDER_MAX_NEW_ROWS);

async function projectProgressiveFacts(candidates,verifiedIds){
 const selected=candidates.filter(c=>{
  const clocks=[c.publishedAt,c.publishedAt.slice(0,10)];
  return clocks.some(clock=>verifiedIds.has(createHash("sha256").update(
   c.category+"\n"+c.articleUrl+"\n"+clock).digest("hex")));
 });
 const facts=[];
 for(const c of selected){
  const iso=privateOsintCountryMention(c.title,COUNTRIES_195);
  if(!iso)continue; // Publisher location is never used as event attribution.
  const article=new URL(c.articleUrl),clock=/^\d{4}-\d{2}-\d{2}$/u.test(c.publishedAt)?
   c.publishedAt+"T00:00:00.000Z":new Date(c.publishedAt).toISOString();
  if(!Number.isFinite(Date.parse(clock))||Date.parse(clock)<Date.now()-72*3600000||
     Date.parse(clock)>Date.now()+60000)continue;
  const fingerprint=createHash("sha256").update(
   [iso,c.category,c.title.normalize("NFKC").toLocaleLowerCase("en")
    .replace(/[^\\p{L}\\p{N}]+/gu," ").trim()].join("\\n")).digest("hex");
  facts.push({country_iso3:iso,derived_category:c.category,
   event_fingerprint:fingerprint,publisher_domain:article.hostname.replace(/^www\\./u,""),
   canonical_source_url:article.href,event_clock:clock,
   clock_basis:"ORIGINAL_PUBLICATION",extracted_entities:[iso,c.category],
   rights_verified:false,commercial_eligible:false});
 }
 let accepted=0;
 for(let offset=0;offset<facts.length;offset+=25){
  const batch=facts.slice(offset,offset+25);
  const response=await fetch("https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/risk-gate/progressive-facts",{
   method:"POST",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000),
   headers:{Authorization:"Bearer "+controlToken,"Content-Type":"application/json",
    Accept:"application/json","Cache-Control":"no-store"},
   body:JSON.stringify({schema:"geomacro.progressive-fact-batch.v1",facts:batch})
  });
  if(response.status!==200)throw Error("PROGRESSIVE_FACT_PROJECTION_HTTP_"+response.status);
  const receipt=await response.json();
  if(receipt?.ok!==true||receipt.schema!=="geomacro.progressive-fact-admission.v1"||
     receipt.raw_news_text_stored!==false||receipt.accepted!==batch.length)
   throw Error("PROGRESSIVE_FACT_PROJECTION_RECEIPT_INVALID");
  accepted+=receipt.accepted;
 }
 return {selected:selected.length,projected:accepted,unattributed:selected.length-facts.length,
  source_text_sent:false,rights_verified:false,commercial_eligible:false};
}

const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"").trim();
// Opt into durable R2/DO only after its protected endpoint is provisioned.
const durableMode=Boolean(env.GEOMACRO_PHASE2I_DURABLE_URL);
if(root.length<32)throw Error("PHASE2I_SOURCE_ONLY_PRIVATE_AUTH_REQUIRED");
const controlToken=createHmac("sha256",root)
 .update("geomacro-control-plane-v1").digest("hex");
const now=new Date();
const sourceMode=env.GEOMACRO_SOURCE_REGISTRY_MODE??"";
const hot50Direct20m=sourceMode==="HOT50_DIRECT_20M";
const threeDomainDirect20m=sourceMode==="THREE_DOMAIN_DIRECT_20M";
if(sourceMode&&!hot50Direct20m&&!threeDomainDirect20m)
 throw Error("UNKNOWN_PRIVATE_SOURCE_REGISTRY_MODE");
if((hot50Direct20m||threeDomainDirect20m)&&!["schedule","workflow_dispatch"].includes(env.GITHUB_EVENT_NAME??""))
 throw Error("THREE_DOMAIN_DIRECT20M_SCHEDULE_ONLY");
const direct20m=hot50Direct20m?hot50Direct20mPublisherRegistry():
 threeDomainDirect20m?threeDomainGlobal20mPublisherRegistry(now):null;
const registry=direct20m?.registry??privateOsintRuntimeSources(now,privateOsintGlobalSources(),
 COUNTRIES_195,{includeLocalGapLane:true});
const fallbackRegistry=hot50Direct20m?(direct20m?.fallback_registry??[]):[];
const fallbackPlan=hot50Direct20m?(direct20m?.cell_failover_plan??[]):[];
const pinnedCategories=new Map(registry.map(source=>[source.url,source.categories]));
for(const source of fallbackRegistry){
 const categories=new Set([...(pinnedCategories.get(source.url)??[]),...source.categories]);
 pinnedCategories.set(source.url,[...categories]);
}
const singleSweep=createPhase2iSingleSweepOriginalIndex({
 pinnedCategories,topics:PRIVATE_OSINT_TOPICS,
});
let result=await collectPrivateOsint15m({
 now,registry,normalize:normalizeReusableNewsJson,
 resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
 onOriginalCandidate:singleSweep.observe,
});
let globalFailoverCategories=[];
if(hot50Direct20m&&fallbackRegistry.length){
 globalFailoverCategories=hot50Direct20mFailoverCategories(
  fallbackPlan,registry,result.checks);
 const alreadyFetched=new Set(registry.map(source=>source.url));
 const backupBatch=fallbackRegistry.filter(source=>
  source.categories.some(category=>globalFailoverCategories.includes(category))&&
  !alreadyFetched.has(source.url));
 if(backupBatch.length){
  const fallback=await collectPrivateOsint15m({
   now,registry:backupBatch,normalize:normalizeReusableNewsJson,
   resolveCountry:title=>privateOsintCountryMention(title,COUNTRIES_195),
   onOriginalCandidate:singleSweep.observe,
  });
  const attempted=result.summary.source_endpoints_attempted+
   fallback.summary.source_endpoints_attempted;
  const sourceStates={...result.summary.source_states};
  for(const [state,count] of Object.entries(fallback.summary.source_states))
   sourceStates[state]=(sourceStates[state]??0)+count;
  result={...result,items:[...result.items,...fallback.items],
   checks:[...result.checks,...fallback.checks],
   summary:{...result.summary,source_endpoints_attempted:attempted,
    registered_source_endpoints:attempted,source_states,
    global_hub_failover_attempted:true,
    global_hub_failover_categories:globalFailoverCategories,
    global_hub_failover_endpoints:backupBatch.length,
    global_hub_failover_rights_verified:false,
    global_hub_failover_commercial_eligible:false}};
 }
}
if(result.summary.configured_country_routes!==195||
 result.summary.configured_country_category_routes!==585||
 result.summary.configured_categories!==3||
 result.summary.source_endpoints_attempted!==result.summary.registered_source_endpoints)
 throw Error("PHASE2I_SOURCE_ONLY_195X3_SOURCE_SWEEP_UNVERIFIED");
const indexed=singleSweep.finish();
// Count publisher-native timely observations without exposing original
// titles/URLs, never confuse article publication time with occurrence time.
const native20mFloor=now.getTime()-20*60_000;
const native20mCounts=Object.fromEntries(["geopolitics","macro","rare_earth"]
 .map(cat=>[cat,indexed.candidates.filter(c=>c.category===cat&&
  Number.isFinite(Date.parse(c.publishedAt))&&
  Date.parse(c.publishedAt)>=native20mFloor&&
  Date.parse(c.publishedAt)<=now.getTime()).length]));
// The preceding trusted runner-only preloader restores the latest encrypted
// historical candidate queue. NEVER accept untrusted plaintext from a URL,
// env value or pull-request artifact. No additional publisher fetches.
const temp=resolve(String(env.RUNNER_TEMP??"/never"));
const priorPath=resolve(String(env.GEOMACRO_PHASE2I_PRIOR_QUEUE??"/missing"));
const cipherPath=resolve(String(env.GEOMACRO_PHASE2I_QUEUE_CIPHERTEXT??"/missing"));
if(!priorPath.startsWith(temp+sep)||!cipherPath.startsWith(temp+sep)||
   priorPath===cipherPath)throw Error("PHASE2I_BACKLOG_RUNNER_PATH_INVALID");
const candidateIdentity=c=>JSON.stringify([c.category,c.articleUrl,
 c.datePrecision==="day"?c.publishedAt.slice(0,10):c.publishedAt]);
let queue,observedThisTickKeys,durableLease=null,durableAppend=null;
if(durableMode){
 // The durable producer writes and readback-verifies EVERY new encrypted
 // 500-item chunk before the D1 admission/lease step; no 8,000 cap or
 // ephemeral all-candidate snapshot can truncate the source sweep.
 // Import any still-eligible, not-yet-D1-acknowledged originals from
 // the last protected main-only GitHub AEAD snapshot on migration. The DO
 // dedupes repeated imports, so there is no data-loss cutover.
 const legacy=JSON.parse(readFileSync(priorPath,"utf8"));
 if(legacy.schema!=="geomacro.phase2i-protected-runner-prior.v1"||
    !Array.isArray(legacy.candidates)||legacy.candidates.length>8000)
  throw Error("PHASE2I_DURABLE_MIGRATION_PRIOR_UNVERIFIED");
 const legacyPending=legacy.candidates.filter(c=>c.d1Acknowledged!==true);
 durableAppend=await appendAndLeasePhase2i({
  observed:[...legacyPending,...indexed.candidates],
  root,now:now.getTime(),env
 });
 durableLease=durableAppend.lease;
 queue={candidates:durableAppend.candidates,
  available:durableAppend.candidates.length,
  expired_or_invalid:durableAppend.invalid_or_expired,
  duplicate_suppressed:durableAppend.duplicate_existing,
  immutable_conflicts_quarantined:0};
 observedThisTickKeys=new Set(indexed.candidates.filter(c=>
  durableAppend.newly.has(durableCandidateId(c))).map(candidateIdentity));
}else{
 // Legacy AEAD Actions handoff remains available until the dedicated
 // private R2 bucket and SQLite DO are independently deployed.
 const prior=JSON.parse(readFileSync(priorPath,"utf8"));
 if(prior.schema!=="geomacro.phase2i-protected-runner-prior.v1"||
    !Array.isArray(prior.candidates)||prior.candidates.length>8000||
    !Number.isFinite(Date.parse(prior.loaded_at))||
    now.getTime()-Date.parse(prior.loaded_at)>5*60_000)
  throw Error("PHASE2I_BACKLOG_RUNNER_PRIOR_UNVERIFIED");
 queue=mergePrivatePhase2iSourceBacklog(
  prior.candidates,indexed.candidates,now.getTime());
 const known=new Set(prior.candidates.map(candidateIdentity));
 observedThisTickKeys=new Set(indexed.candidates.filter(c=>
  !known.has(candidateIdentity(c))).map(candidateIdentity));
}
// Legacy cap is a hard safety boundary, not an assertion of source coverage.
if(!durableMode&&queue.available>=7200)
 console.log("::warning::PRIVATE_NEWS_72H_QUEUE_AT_OR_ABOVE_90_PERCENT_CAPACITY; queued news remain encrypted but complete universal ingestion not verified");
const pendingOriginals=queue.candidates.filter(c=>c.d1Acknowledged!==true).length;
const requestedBatch=pendingOriginals>=500?100:50;
const admittedRows=Math.min(providerRows,requestedBatch);
const stage=await stagePhase2iOsintFairRaw({
 candidates:queue.candidates,now,derive:deriveStatelessSignals,
 maxRows:admittedRows,returnVerifiedRecordIds:true,
 ...(threeDomainDirect20m?{
  priorityMode:"HOT50_FRESH_FIRST",observedThisTickKeys,
 }:{}),
 controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
 token:controlToken,
});
if(stage.selected_count>0&&stage.d1_readback_verified!==true)
 throw Error("PHASE2I_SOURCE_ONLY_RAW_D1_RECEIPT_UNVERIFIED");
const verifiedStageIds=new Set(stage.verified_record_ids??[]);
const newlyAcknowledged=queue.candidates.filter(candidate=>{
 if(candidate.d1Acknowledged===true)return false;
 const native=candidate.datePrecision==="day"?
  candidate.publishedAt.slice(0,10):candidate.publishedAt;
 const id=createHash("sha256").update(
  candidate.category+"\n"+candidate.articleUrl+"\n"+native).digest("hex");
 return verifiedStageIds.has(id);
});
const projectedByKey=new Map();
for(const candidate of newlyAcknowledged){
 const countryIso3=privateOsintCountryMention(candidate.title,COUNTRIES_195);
 if(!countryIso3||!HOT50_COUNTRY_SET.has(countryIso3))continue;
 let article,source;
 try{article=new URL(candidate.articleUrl);source=new URL(candidate.sourceUrl)}catch{continue}
 if(article.protocol!=="https:"||source.protocol!=="https:"||
    article.username||article.password||article.port||article.hash||
    source.username||source.password||source.port)continue;
 const eventClock=candidate.datePrecision==="day"?
  candidate.publishedAt.slice(0,10)+"T00:00:00.000Z":candidate.publishedAt;
 const time=Date.parse(eventClock);
 if(!Number.isFinite(time)||time>now.getTime()+60000||
    time<now.getTime()-72*3600000)continue;
 const normalizedTitle=String(candidate.title??"").normalize("NFKC")
  .toLocaleLowerCase("en").replace(/\s+/gu," ").trim();
 if(normalizedTitle.length<8||normalizedTitle.length>1200)continue;
 const domain=article.hostname.toLowerCase().replace(/^www\./u,"");
 const fingerprint=createHash("sha256").update([
  countryIso3,candidate.category,eventClock,normalizedTitle
 ].join("|")).digest("hex");
 const title_sha256=createHash("sha256").update(candidate.title).digest("hex");
 const key=[countryIso3,candidate.category,fingerprint,domain].join("|");
 if(projectedByKey.has(key))continue;
 projectedByKey.set(key,{
  country_iso3:countryIso3,derived_category:candidate.category,
  event_fingerprint:fingerprint,publisher_domain:domain,
  canonical_source_url:article.href,event_clock:new Date(time).toISOString(),
  clock_basis:"INDEX_OBSERVED",extracted_entities:[],
  source_id:source.hostname.toLowerCase().replace(/^www\./u,""),
  title_sha256,fact_basis:"SEARCH_TITLE_ONLY",original_page_fetched:false,
  rights_verified:false,commercial_eligible:false,
 });
}
const progressiveProjection=[...projectedByKey.values()];
let progressiveProjectionAccepted=0;
for(let offset=0;offset<progressiveProjection.length;offset+=25){
 const observations=progressiveProjection.slice(offset,offset+25);
 const response=await fetch("https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/risk-gate/progressive-observations",{
  method:"POST",redirect:"error",cache:"no-store",
  headers:{"Authorization":"Bearer "+controlToken,"Accept":"application/json",
   "Content-Type":"application/json","Cache-Control":"no-store"},
  body:JSON.stringify({schema:"geomacro.progressive-observation-projection-request.v1",observations}),
  signal:AbortSignal.timeout(12000),
 });
 if(!response.ok)throw Error("PROGRESSIVE_OBSERVATION_PROJECTION_HTTP_"+response.status);
 const receipt=await response.json();
 if(receipt?.ok!==true||receipt.schema!=="geomacro.progressive-observation-projection.v1"||
    receipt.accepted!==observations.length||
    receipt.unverified_observations!==observations.length||
    receipt.rights_verified!==false||receipt.commercial_eligible!==false||
    receipt.standard_corroboration_admitted!==false||receipt.raw_news_text_stored!==false)
  throw Error("PROGRESSIVE_OBSERVATION_PROJECTION_RECEIPT_INVALID");
 progressiveProjectionAccepted+=receipt.accepted;
}

// A healthy, genuinely checked feed is a check heartbeat even with zero
// new native-dated stories. Persist three sanitized category checks in D1
// and independently read them back; never create an article or renew clocks
// when actual sources were denied/unavailable.
const heartbeat=await persistPrivateOsintHeartbeats({summary:result.summary,now});
const hotFeedUrls=new Set(threeDomainDirect20m?registry
 .filter(source=>source.private_hot50_direct_20m===true)
 .map(source=>source.url):[]);
const hotNativeByCategory=Object.fromEntries(["geopolitics","macro","rare_earth"]
 .map(category=>[category,indexed.candidates.filter(c=>c.category===category&&
   hotFeedUrls.has(c.sourceUrl)).length]));
const checkByRef=new Map(result.checks.map(check=>[check.source_ref,check.state]));
const hotFeedHealthy=registry.filter(source=>hotFeedUrls.has(source.url)&&
 source.categories.some(category=>{
  const ref=createHash("sha256").update([source.id,source.url,category].join("\n")).digest("hex");
  return ["OBSERVED","EMPTY_OR_OUTSIDE_WINDOW"].includes(checkByRef.get(ref));
 })).length;
if(threeDomainDirect20m&&hotFeedHealthy<hotFeedUrls.size)
 console.log("::warning::DIRECT_20M_HOT50_SOME_FEEDS_NOT_HEALTHY; actual provider health below configured Hot50 count");
// Acknowledge only exact original IDs returned after authenticated D1 readback.
// All receipt identities stay in the protected runner and AES-GCM queue.
const verifiedIds=new Set(stage.verified_record_ids??[]);
const progressiveFactsProjection=await projectProgressiveFacts(indexed.candidates,verifiedIds);
console.log(JSON.stringify({schema:"geomacro.phase2i-progressive-fact-projection.v1",
 ...progressiveProjection,raw_news_text_stored:false}));
const candidatesWithD1Receipts=queue.candidates.map(candidate=>{
 const native=candidate.datePrecision==="day"
  ?candidate.publishedAt.slice(0,10):candidate.publishedAt;
 const hash=createHash("sha256").update(
  candidate.category+"\n"+candidate.articleUrl+"\n"+native).digest("hex");
 return verifiedIds.has(hash)?{...candidate,d1Acknowledged:true}:candidate;
});
const newAcknowledgements=candidatesWithD1Receipts.filter((c,i)=>
 c.d1Acknowledged===true&&queue.candidates[i].d1Acknowledged!==true).length;
// Do not release a lease until independently readback-verified D1 exact IDs
// have been acknowledged by the DO. A process crash leaves the lease to expire.
let durableHealth=null;
if(durableMode){
 const ack=await acknowledgePhase2i({lease:durableLease,
  verifiedRecordIds:stage.verified_record_ids??[],env});
 if(ack.acked_now!==(stage.verified_record_ids??[]).length)
  throw Error("PHASE2I_DURABLE_ACK_COUNT_MISMATCH");
 durableHealth=await phase2iDurableStatus({env});
 console.log(JSON.stringify({
  schema:"geomacro.phase2i-durable-r2-do-ingestion.v1",
  new_ciphertext_originals_readback_verified:durableAppend.appended_new,
  previously_registered_originals:durableAppend.duplicate_existing,
  ciphertext_chunk_appends_verified:durableAppend.verified_encrypted_objects,
  d1_exact_readback_ids_acknowledged:ack.acked_now,
  pending_eligible_in_durable_store:durableHealth.pending_eligible,
  expired_without_d1_ack:durableHealth.expired_without_d1_ack,
  fully_drained:durableHealth.fully_d1_drained,
  source_titles_or_urls_exposed:false,payments:0
 }));
}else{
 // Compatibility until opt-in is production-ready. Existing GH artifact
 // contains only AEAD ciphertext; exceeding its cap fails closed.
 const sealed=sealPrivatePhase2iSourceBacklog({
  candidates:candidatesWithD1Receipts,root,now:Date.now()});
 mkdirSync(dirname(cipherPath),{recursive:true,mode:0o700});
 writeFileSync(cipherPath,JSON.stringify(sealed)+"\n",{
  encoding:"utf8",mode:0o600,flag:"wx"});
 console.log(JSON.stringify({
  schema:"geomacro.phase2i-encrypted-backlog-producer.v1",
  source_candidates_held_72h:queue.available,
  d1_originals_acknowledged_in_encrypted_queue:candidatesWithD1Receipts.filter(c=>
   c.d1Acknowledged===true).length,
  newly_acknowledged_originals:newAcknowledgements,
  invalid_or_expired_removed:queue.expired_or_invalid,
  exact_duplicates_removed:queue.duplicate_suppressed,
  conflicting_originals_quarantined:queue.immutable_conflicts_quarantined,
  ciphertext_artifact_created:true,
  ciphertext_uploaded_and_durable_verified:false,
  provider_extra_requests:0,d1_extra_rows:0,
  private_originals_logged:false,commercial_rights_verified:false
 }));
}
// One small sanitized proof covers every configured direct publisher without
// extra HTTP or D1/B2 operations. Never expose original article URLs or text.
// The same source-ID receipt is required for regular 15m and direct 20m
// admitted runs; no additional HTTP, D1 reads or B2 operations.
{
 const proof=buildDirect20mSourceHealthProof({
  registry,checks:result.checks,observedCandidates:indexed.candidates,
  retainedCandidates:candidatesWithD1Receipts,
  d1ReadbackVerified:stage.d1_readback_verified===true,
  b2ReadbackVerified:stage.b2_verified===true,now:now.getTime(),
 });
 const healthProofPath=resolve(temp,"geomacro-direct20m-source-proof.json");
 writeFileSync(healthProofPath,JSON.stringify(proof)+"\n",{mode:0o600,flag:"wx"});
 console.log(JSON.stringify({schema:proof.schema,
  source_endpoints_configured:proof.source_endpoints_configured,
  category_checks_with_runtime_state:proof.category_checks_with_runtime_state,
  source_category_checks_expected:proof.source_category_checks_expected,
  d1_selected_batch_readback_verified:proof.d1_selected_batch_readback_verified,
  b2_original_archive_readback_verified:proof.b2_original_archive_readback_verified,
  poll_lane:threeDomainDirect20m?'THREE_DOMAIN_DIRECT_20M':'PRIVATE_ADMITTED_15M',
  artifact_created:true,public_article_payload_exposed:false,
 }));
}
// Research-funded public newsroom publisher consumes only this same sweep.
 // Source-only staging is complete and independently D1 verified FIRST.
 // Never expose raw original candidates as Actions artifacts, outputs or logs.
 // With research pacing held, no handoff exists and no website write occurs.
if(env.PHASE2I_PROVIDER_CRITICAL==="true"&&
   env.PHASE2I_PROVIDER_RESEARCH==="true"){
 const temp=resolve(String(env.RUNNER_TEMP??"/never"));
 const target=resolve(String(env.GEOMACRO_SOURCE_WEBSITE_HANDOFF??"/missing"));
 if(!target.startsWith(temp+sep))
  throw Error("PHASE2I_SOURCE_WEBSITE_HANDOFF_PATH_INVALID");
 const handoff=planSourceWebsiteHandoff(indexed.candidates,{now});
 writeFileSync(target,JSON.stringify(handoff),{encoding:"utf8",mode:0o600,flag:"wx"});
 console.log(JSON.stringify({
  schema:"geomacro.source-only-website-handoff-counts.v1",
  checked_at:handoff.checked_at,
  observed_by_category:Object.fromEntries(Object.entries(handoff.by_category)
    .map(([category,counts])=>[category,counts.selected])),
  additional_source_gets:0,public_write_performed_by_source_only:false,
  private_original_urls_logged:false,predge_modified:false,payments:0,
 }));
}
const {schema,status,selected_count,available_originals,deferred_count,
 selected_by_category,d1_inserted,d1_unchanged,d1_rejected_conflicts,
 d1_readback_verified,b2_verified}=stage;
console.log(JSON.stringify({
 schema,status,source_intake_lane_only:true,
 country_routes:hot50Direct20m?50:195,
 country_category_routes:hot50Direct20m?150:585,
 source_endpoints_attempted:result.summary.source_endpoints_attempted,
 ...(hot50Direct20m||threeDomainDirect20m?{
  source_lane:threeDomainDirect20m?"THREE_DOMAIN_DIRECT_20M":"HOT50_DIRECT_20M",
  direct_catalogue:direct20m.summary,
  actual_country_coverage_verified:false,
  real_original_news_freshness_checked:true,
  complete_fresh_eligible_original_persistence_not_proven:true,
  native_dated_candidate_count_by_category:Object.fromEntries(
   ["geopolitics","macro","rare_earth"].map(cat=>[cat,
    indexed.candidates.filter(c=>c.category===cat).length])),
  native_dated_within_20m_by_category:native20mCounts,
  runtime_source_health_by_state:result.summary.source_states,
  source_queue_storage:durableMode?"PRIVATE_R2_SQLITE_DO":"LEGACY_GH_AEAD",
  source_queue_capacity_max_candidates:durableMode?null:8000,
  source_queue_current_candidates:durableMode?
   durableHealth.pending_eligible:queue.available,
  source_queue_near_capacity_warning:!durableMode&&queue.available>=7200,
  queued_candidates_not_all_d1_verified:durableMode?
   durableHealth.pending_eligible>0:queue.candidates.some(c=>c.d1Acknowledged!==true),
  hot50_direct_feed_urls_configured:hotFeedUrls.size,
  hot50_direct_feeds_http_healthy:hotFeedHealthy,
  hot50_native_dated_originals_by_category:hotNativeByCategory,
  truly_first_seen_identity_keys_this_tick:observedThisTickKeys.size,
  d1_hot50_country_priority_applied:threeDomainDirect20m,
  d1_selected_native_last_20m:stage.selected_native_last_20m,
  d1_selected_hot50_country_hints:stage.selected_hot50_title_or_primary_issuer_hints,
  actual_native_news_d1_ack_count:stage.selected_count>0&&stage.d1_readback_verified===true?
   stage.d1_inserted:0,
  actual_all_new_native_items_durable_verified:false,
  all_selected_direct_endpoints_checked:result.summary.source_endpoints_attempted===registry.length,
 }:{}),
 ...indexed.summary,
 selected_count,available_originals,deferred_count,selected_by_category,
 admitted_source_only_max_rows:admittedRows,
 source_only_adaptive_mode:pendingOriginals>=500?"BACKLOG":"NORMAL",
 d1_inserted,d1_unchanged,d1_rejected_conflicts,d1_readback_verified,
 b2_verified,rights_verified:false,paid_eligible:false,payments:0,
 predge_modified:false,publication_attempted:false,
 no_extra_provider_news_gets:true,
 heartbeat,
}));
