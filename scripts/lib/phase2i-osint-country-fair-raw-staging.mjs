/** Same-collected-native-original Phase 2H staging, 195x3 fairness.
 * Only the already admitted private OSINT job invokes this: ZERO new feed GET,
 * provider, B2, settlement or public delivery. Headline attribution is a
 * routing candidate, never event truth or source license.
 */
import {buildPhase2hPrivateRawRecords} from "./phase2h-raw-original-records.mjs";
import {postPhase2iCollisionIsolated} from "./phase2ib-fastlane-private-staging.mjs";
import {phase2hHeadlineCountryCandidate} from "./phase2h-country-originals-195.mjs";
import {privateOsintCountryMentions} from "./private-osint-country-mentions.mjs";
import {qualifyPrivateNationalPrimaryScope,sourceIsPinnedNationalPrimary} from "./private-osint-national-primary-scope.mjs";
import {COUNTRIES_195} from "../../src/lib/canonical-country-registry-195.ts";
import {HOT50_COUNTRY_SET} from "./hot-50-country-watch.mjs";
const CATS=["geopolitics","macro","rare_earth"];
const MAX=5;
const counts=rows=>Object.fromEntries(CATS.map(category=>[
 category,rows.filter(row=>row.category===category).length,
]));

/** Prevent unrelated articles from fan-out into all categories merely
 * because a pinned general publisher has three catalogue labels.
 * A category-only publisher stays eligible without requiring headline tokens.
 */
export function phase2iSourceOnlyCategoryRelevant(raw,pinnedCategories,topics){
 if(!raw||!CATS.includes(raw.category)||typeof raw.title!=="string"||
    typeof raw.source_url!=="string"||!(pinnedCategories instanceof Map)||
    !(topics?.[raw.category] instanceof RegExp))return false;
 const allowed=pinnedCategories.get(raw.source_url);
 return Array.isArray(allowed)&&allowed.includes(raw.category)&&
   (allowed.length===1||topics[raw.category].test(raw.title));
}

function withoutAmbiguousSameOriginal(candidates){
 const rows=new Map(),conflict=new Set();
 for(const raw of candidates){
  if(!raw||!CATS.includes(raw.category)||typeof raw.articleUrl!=="string"||
     typeof raw.publishedAt!=="string")continue;
  const key=JSON.stringify([raw.category,raw.articleUrl,raw.publishedAt]);
  const identity=JSON.stringify([raw.sourceId,raw.title,raw.credit??null,
    raw.description??null,raw.datePrecision??null]);
  if(rows.has(key)&&rows.get(key).identity!==identity)conflict.add(key);
  else if(!rows.has(key))rows.set(key,{identity,raw});
 }
 return {candidates:[...rows].filter(([key])=>!conflict.has(key))
    .map(([,value])=>value.raw),conflicting_original_identities:conflict.size};
}

/** Prefer distinct original-title country cells within each of three
 * categories. Rotate independently on each 15-minute admitted source tick,
 * including duplicate reobservations; never let a large Geopolitics lane
 * suppress Macro/FX or Critical Minerals. A headline naming multiple
 * countries is UNATTRIBUTED, not falsely assigned to either country.
 */
export function planPhase2iOsintCountryFairRaw(candidates,{
 now=new Date(),derive,maxRows=MAX,priorityMode="ROTATING_ALL",
 observedThisTickKeys=null,
}={}){
 if(!Array.isArray(candidates)||!(now instanceof Date)||
    !Number.isFinite(now.getTime())||typeof derive!=="function"||
    !Number.isInteger(maxRows)||maxRows<3||maxRows>MAX||
   !["ROTATING_ALL","HOT50_FRESH_FIRST"].includes(priorityMode)||
   !(observedThisTickKeys===null||observedThisTickKeys instanceof Set))
  throw Error("PHASE2I_OSINT_RAW_PLAN_INVALID");
 const dedup=withoutAmbiguousSameOriginal(candidates);
 // Retain genuine native time, but never respend a scarce admitted D1 slot
 // on an original authenticated and acknowledged in the encrypted queue.
 const pending=dedup.candidates.filter(c=>c.d1Acknowledged!==true);
 const originals=buildPhase2hPrivateRawRecords(pending,{now,derive});
 // D1 private intake and the website both retain only 72h of native-dated
 // original observations. Do not spend the scarce 3/5-row source-intake
 // approval on old records that cannot become a current article. Preserve
 // historical metadata in the source sweep but NEVER renew its source clock.
 const RETENTION_MS=72*3600_000;
 const recentOriginals=originals.records.filter(row=>{
  const nativeAt=Date.parse(row.original.original_published_at);
  return Number.isFinite(nativeAt)&&nativeAt<=now.getTime()+60_000&&
    nativeAt>=now.getTime()-RETENTION_MS;
 });
 const expired_native_originals=originals.records.length-recentOriginals.length;
 // This is a private country selection hint, NEVER an immutable raw-record
 // assertion or a source's event location. Neither D1 hash nor paid rights move.
 const routing=new Map(dedup.candidates.map(c=>[
  JSON.stringify([c.category,c.articleUrl,c.publishedAt]),c,
 ]));
 const issuerRouteFor=row=>{
  const original=row.original;
  const c=routing.get(JSON.stringify([row.category,original.original_url,
   original.original_published_at]));
  if(!c||typeof c.sourceUrl!=="string"||
     !/^[A-Z]{3}$/u.test(c.issuerContextCountryIso3??"")||
     privateOsintCountryMentions(original.original_title,COUNTRIES_195).length!==0)
   return null;
  const issuer=qualifyPrivateNationalPrimaryScope({
   url:c.sourceUrl,publisher_country_iso3:c.issuerContextCountryIso3});
  return sourceIsPinnedNationalPrimary(issuer)?c.issuerContextCountryIso3:null;
 };
 const tick=Math.floor(now.getTime()/900_000);
 // Stable category budgets: at 5 rows the observed lanes receive 2/2/1;
 // at provider-approved 3 rows each category receives one. Do not use
 // "tick % number_of_countries" as the only cursor: that repeatedly picks
 // depth-zero news and permanently starves the second original in a country.
 const baseQuota=Math.floor(maxRows/CATS.length);
 const lanes=CATS.map((category,index)=>{
  const eligible=recentOriginals.filter(r=>r.category===category);
  const cells=new Map();
  for(const row of eligible){
   const iso3=phase2hHeadlineCountryCandidate(row.original.original_title)
     ??issuerRouteFor(row)??"UNATTRIBUTED";
   if(!cells.has(iso3))cells.set(iso3,[]);
   cells.get(iso3).push(row);
  }
  const keys=[...cells.keys()].sort((a,b)=>
   (a==="UNATTRIBUTED")-(b==="UNATTRIBUTED")||a.localeCompare(b));
  if(!keys.length)return [];
  for(const key of keys)cells.get(key).sort((a,b)=>
   b.original.original_published_at.localeCompare(
     a.original.original_published_at)||a.record_id.localeCompare(b.record_id));
  // Country-interleaved stable ring: first visit every observed country,
  // then the second/third/... genuine dated event of each country. Advancing
  // by the number of records consumed in this category guarantees traversal
  // of ALL depths, not just the most recent item per country.
  const arranged=[];
  const maxDepth=Math.max(...keys.map(key=>cells.get(key).length));
  for(let depth=0;depth<maxDepth;depth++){
   for(const key of keys){
    const source=cells.get(key);
    if(source[depth])arranged.push(source[depth]);
   }
  }
  const plannedQuota=baseQuota+(index<maxRows%CATS.length?1:0);
  const offset=(tick*plannedQuota)%arranged.length;
  const fair=[...arranged.slice(offset),...arranged.slice(0,offset)];
  if(priorityMode!=="HOT50_FRESH_FIRST")return fair;
  // Admission is only 3-5 per cycle. Prioritize genuine NEW, publisher-
  // native recent Hot-50 originals, then other globally current news, but
  // retain every 72h unacknowledged original for subsequent admitted ticks.
  // A headline/issuer country match is a routing hint, NOT event proof.
  const twentyMinutes=20*60_000;
  const rank=row=>{
   const native=Date.parse(row.original.original_published_at);
   const current=Number.isFinite(native)&&native>=now.getTime()-twentyMinutes&&
     native<=now.getTime()+60_000;
   const key=JSON.stringify([row.category,row.original.original_url,
     row.original.original_published_at]);
   const newlySeen=observedThisTickKeys?.has(key)===true;
   const country=phase2hHeadlineCountryCandidate(row.original.original_title)
     ??issuerRouteFor(row);
   const hot=HOT50_COUNTRY_SET.has(country);
   if(hot&&current&&newlySeen)return 0;
   if(current&&newlySeen)return 1;
   if(hot&&newlySeen)return 2;
   if(newlySeen)return 3;
   if(hot&&current)return 4;
   if(current)return 5;
   return 6;
  };
  // Sort by tier only; stable insertion order preserves the rotating
  // country/depth fairness of the existing default admission logic.
  return fair.map((row,position)=>({row,position,rank:rank(row)}))
   .sort((a,b)=>a.rank-b.rank||a.position-b.position)
   .map(x=>x.row);
 });
 const selected=[],index=[0,0,0];
 while(selected.length<maxRows&&index.some((n,i)=>n<lanes[i].length)){
  for(let i=0;i<3&&selected.length<maxRows;i++){
   const item=lanes[i][index[i]++];
   if(item)selected.push(item);
  }
 }
 const available=recentOriginals.length;
 const attributed=selected.filter(r=>phase2hHeadlineCountryCandidate(
  r.original.original_title)!==null).length;
 const issuerContextSelected=selected.filter(r=>
  phase2hHeadlineCountryCandidate(r.original.original_title)===null&&
  issuerRouteFor(r)!==null).length;
 return Object.freeze({records:selected,selected_count:selected.length,
  source_priority_mode:priorityMode,
  selected_hot50_title_or_primary_issuer_hints:selected.filter(r=>
   HOT50_COUNTRY_SET.has(phase2hHeadlineCountryCandidate(r.original.original_title)
    ??issuerRouteFor(r))).length,
  selected_native_last_20m:selected.filter(r=>{
   const ms=Date.parse(r.original.original_published_at);
   return ms>=now.getTime()-20*60_000&&ms<=now.getTime()+60_000;
  }).length,
  available_originals:available,deferred_count:available-selected.length,
  selected_by_category:counts(selected),available_by_category:counts(recentOriginals),
  original_native_72h_eligible:recentOriginals.length,
  original_native_72h_expired:expired_native_originals,
  country_attributed_candidate_count:attributed,
  issuer_context_country_routing_count:issuerContextSelected,
  same_original_ambiguous_dropped:dedup.conflicting_original_identities,
  already_d1_verified_excluded:dedup.candidates.length-pending.length,
  invalid_dropped:originals.discarded_invalid,
  paid_eligible:false,commercial_rights_verified:false,
  original_country_independently_verified:false});
}

export async function stagePhase2iOsintFairRaw({
 candidates,now=new Date(),derive,controlPlaneRoot,token,
 fetchImpl=fetch,post,maxRows=MAX,returnVerifiedRecordIds=false,
 priorityMode="ROTATING_ALL",observedThisTickKeys=null,
}={}){
 const plan=planPhase2iOsintCountryFairRaw(candidates,{
  now,derive,maxRows,priorityMode,observedThisTickKeys,
 });
 const {records,...safe}=plan;
 if(!records.length)return Object.freeze({
  schema:"geomacro.phase2i.osint-fair-phase2h-stage.v1",
  ...safe,status:"NO_NATIVE_ORIGINAL_TO_STAGE",d1_inserted:0,
  d1_unchanged:0,d1_rejected_conflicts:0,d1_readback_verified:false,
  b2_verified:false,payments:0,
  ...(returnVerifiedRecordIds?{verified_record_ids:[]}:{}),
 });
 const receipt=await postPhase2iCollisionIsolated({
  records,controlPlaneRoot,token,fetchImpl,...(post?{post}:{})
 });
 return Object.freeze({
  schema:"geomacro.phase2i.osint-fair-phase2h-stage.v1",...safe,
  status:receipt.readback_verified?
   receipt.rejected_conflicts>0?"CANONICAL_D1_PARTIAL_IMMUTABLE_CONFLICTS":
    "CANONICAL_D1_EXACT_READBACK_VERIFIED":
   "NO_POSITIVE_D1_READBACK",
  d1_inserted:receipt.stored,d1_unchanged:receipt.duplicate,
  d1_rejected_conflicts:receipt.rejected_conflicts,
  rejected_conflicts_by_category:receipt.rejected_conflicts_by_category,
  per_original_authenticated_d1_verified:receipt.per_original_authenticated_d1_verified,
  d1_readback_verified:receipt.readback_verified,
  b2_verified:false,payments:0,
  ...(returnVerifiedRecordIds?{verified_record_ids:receipt.verifiedRecordIds}:{}),
 });
}
