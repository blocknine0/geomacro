/** Same-collected-native-original Phase 2H staging, 195x3 fairness.
 * Only the already admitted private OSINT job invokes this: ZERO new feed GET,
 * provider, B2, settlement or public delivery. Headline attribution is a
 * routing candidate, never event truth or source license.
 */
import {buildPhase2hPrivateRawRecords} from "./phase2h-raw-original-records.mjs";
import {postPhase2iCollisionIsolated} from "./phase2ib-fastlane-private-staging.mjs";
import {phase2hHeadlineCountryCandidate} from "./phase2h-country-originals-195.mjs";
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
 now=new Date(),derive,maxRows=MAX
}={}){
 if(!Array.isArray(candidates)||!(now instanceof Date)||
    !Number.isFinite(now.getTime())||typeof derive!=="function"||
    !Number.isInteger(maxRows)||maxRows<3||maxRows>MAX)
  throw Error("PHASE2I_OSINT_RAW_PLAN_INVALID");
 const dedup=withoutAmbiguousSameOriginal(candidates);
 const originals=buildPhase2hPrivateRawRecords(dedup.candidates,{now,derive});
 const tick=Math.floor(now.getTime()/900_000);
 // Stable category budgets: at 5 rows the observed lanes receive 2/2/1;
 // at provider-approved 3 rows each category receives one. Do not use
 // "tick % number_of_countries" as the only cursor: that repeatedly picks
 // depth-zero news and permanently starves the second original in a country.
 const baseQuota=Math.floor(maxRows/CATS.length);
 const lanes=CATS.map((category,index)=>{
  const eligible=originals.records.filter(r=>r.category===category);
  const cells=new Map();
  for(const row of eligible){
   const iso3=phase2hHeadlineCountryCandidate(row.original.original_title)
     ??"UNATTRIBUTED";
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
  return [...arranged.slice(offset),...arranged.slice(0,offset)];
 });
 const selected=[],index=[0,0,0];
 while(selected.length<maxRows&&index.some((n,i)=>n<lanes[i].length)){
  for(let i=0;i<3&&selected.length<maxRows;i++){
   const item=lanes[i][index[i]++];
   if(item)selected.push(item);
  }
 }
 const available=originals.records.length;
 const attributed=selected.filter(r=>phase2hHeadlineCountryCandidate(
  r.original.original_title)!==null).length;
 return Object.freeze({records:selected,selected_count:selected.length,
  available_originals:available,deferred_count:available-selected.length,
  selected_by_category:counts(selected),available_by_category:counts(originals.records),
  country_attributed_candidate_count:attributed,
  same_original_ambiguous_dropped:dedup.conflicting_original_identities,
  invalid_dropped:originals.discarded_invalid,
  paid_eligible:false,commercial_rights_verified:false,
  original_country_independently_verified:false});
}

export async function stagePhase2iOsintFairRaw({
 candidates,now=new Date(),derive,controlPlaneRoot,token,
 fetchImpl=fetch,post,maxRows=MAX
}={}){
 const plan=planPhase2iOsintCountryFairRaw(candidates,{now,derive,maxRows});
 const {records,...safe}=plan;
 if(!records.length)return Object.freeze({
  schema:"geomacro.phase2i.osint-fair-phase2h-stage.v1",
  ...safe,status:"NO_NATIVE_ORIGINAL_TO_STAGE",d1_inserted:0,
  d1_unchanged:0,d1_rejected_conflicts:0,d1_readback_verified:false,
  b2_verified:false,payments:0,
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
  d1_readback_verified:receipt.readback_verified,
  b2_verified:false,payments:0,
 });
}
