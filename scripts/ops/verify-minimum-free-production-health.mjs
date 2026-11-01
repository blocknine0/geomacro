#!/usr/bin/env node
/**
 * Independent outside-in acceptance for the CURRENT FREE Geomacro product.
 * Public reads use the permanent static archive: no D1, B2, Supabase, signing,
 * settlement, publisher secrets, or new database. Legacy signed products remain optional.
 */
import {fileURLToPath} from "node:url";

const ROOT="https://geomacro.live";
const ARCHIVE_FEED="https://geomacro-public-finds-archive.daspallab202391.workers.dev/latest.json";
const RETENTION_MS=72*60*60_000;
const MAX_STATIC_REFRESH_LAG_MS=6*60*60_000;
const DELAY_MS=0;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const validSha=(s)=>typeof s==="string"&&/^[a-f0-9]{40}$/u.test(s);
/**
 * Release parity is content-specific for FREE website health only. Ops-only
 * GitHub merges don't change the already published HTML/JS bundle and must
 * not demand a new Lovable publish. NEVER use this to certify signed B2/D1
 * hot products or activate x402 payment.
 *
 * Reject anything that can change website output: src, public, workers, lib,
 * package/lock/config/build files. Compare must be canonical exact-head,
 * complete (<300 changed files and <250 commits) and non-forking.
 */
export const SAFE_NON_WEBSITE_PATH = /^(?:\.github\/workflows\/[a-z0-9._-]+\.ya?ml|docs\/[A-Za-z0-9_./-]+|scripts\/(?:ops|tests)\/[A-Za-z0-9_./-]+|scripts\/lib\/(?:phase2h-registered-private-quota|source-only-website-handoff|website-canonical-archive-catchup)(?:\.test)?\.mjs|src\/__tests__\/[A-Za-z0-9_./-]+\.test\.[cm]?[jt]sx?|src\/lib\/free-derived-deep-health\.server\.test\.ts)$/u;
export function classifyPublishedSourceEquivalence(compare,siteSha,mainSha){
  if(!validSha(siteSha)||!validSha(mainSha)||siteSha===mainSha||
     !compare||compare.status!=="ahead"||
     compare.base_commit?.sha!==siteSha||
     compare.merge_base_commit?.sha!==siteSha||
     !Number.isSafeInteger(compare.ahead_by)||compare.ahead_by<1||
     compare.ahead_by>=250||compare.behind_by!==0||
     compare.total_commits!==compare.ahead_by||
     !Array.isArray(compare.files)||compare.files.length===0||
     compare.files.length>=300||!Array.isArray(compare.commits)||
     compare.commits.at(-1)?.sha!==mainSha)return false;
  return compare.files.every(file=>file&&file.status!=="removed"&&
    typeof file.filename==="string"&&
    !file.filename.split("/").some(segment=>segment==="."||segment==="..")&&
    SAFE_NON_WEBSITE_PATH.test(file.filename));
}
export async function verifyPublishedSourceEquivalence(siteSha,mainSha,{
  fetcher=fetch,token=process.env.GITHUB_TOKEN??"",
}={}){
  if(!validSha(siteSha)||!validSha(mainSha)||siteSha===mainSha)return false;
  try{
    const url="https://api.github.com/repos/blocknine0/geomacro/compare/"+
      encodeURIComponent(siteSha)+"..."+encodeURIComponent(mainSha);
    const response=await fetcher(url,{redirect:"error",
      headers:{Accept:"application/vnd.github+json",
        "X-GitHub-Api-Version":"2022-11-28",
        ...(token?{Authorization:"Bearer "+token}:{})},
      signal:AbortSignal.timeout(12_000)});
    if(response.status!==200)return false;
    const body=await response.text();
    if(body.length>250_000)return false;
    return classifyPublishedSourceEquivalence(JSON.parse(body),siteSha,mainSha);
  }catch{return false;}
}

function originalPublication(s,now){
  if(!s||typeof s!=="object"||Array.isArray(s))return null;
  if(s.date_precision==="exact"){
    if(typeof s.published_at!=="string"||
       !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(s.published_at))return null;
    const at=Date.parse(s.published_at);
    return Number.isFinite(at)&&at<=now-DELAY_MS&&at>=now-RETENTION_MS?at:null;
  }
  if(s.date_precision==="day"){
    if(typeof s.published_at!=="string"||
       !/^\d{4}-\d\d-\d\d$/u.test(s.published_at))return null;
    const at=Date.parse(s.published_at+"T00:00:00.000Z");
    return Number.isFinite(at)&&new Date(at).toISOString().startsWith(s.published_at)&&
      at+36*60*60_000+DELAY_MS<=now&&at>=now-RETENTION_MS?at:null;
  }
  return null;
}
function decodeHtml(s){
  return s.replace(/&#x([0-9a-f]+);/giu,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/gu,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&(?:amp|quot|apos|lt|gt);/gu,m=>
      ({"&amp;":"&","&quot;":'"',"&apos;":"'","&lt;":"<","&gt;":">"})[m]);
}
function invalid(reason,counts){
  return {schema:"geomacro.minimum-free-production-health.v1",ok:false,
    reason,free_derived_ssr_ready:false,derived_rows:0,
    categories:counts??{geopolitics:0,macro:0,rare_earth:0},
    all_three_categories_have_recent_originals:false,
    legacy_signed_hot_products_verified:false,
    current_numerical_gri_verified:false,
    paid_delivery_authorized:false,d1_requests:0,b2_requests:0,supabase_requests:0,payments:0};
}
/**
 * "Minimum" means one actually dated free Find makes the public newsroom
 * usable; it does NOT claim fresh news in all three categories. When there
 * are no recent originals, fail instead of inventing a synthetic story.
 */
export function classifyMinimumFreeProduction({
  journalStatus,journal,siteStatus,siteHtml,buildStatus,build,
  expectedSha,websiteSourceEquivalent=false,nowMs=Date.now(),
}={}){
  if(!validSha(expectedSha)||!Number.isFinite(nowMs))
    return invalid("EXPECTED_DEPLOYMENT_SHA_INVALID");
  if(buildStatus!==200||!build||build.schema_version!=="geomacro.deployment-build.v1"||
    build.canonical_repository!=="blocknine0/geomacro"||
    build.production_activation_performed!==false||
    !(build.canonical_main_sha===expectedSha||
      (websiteSourceEquivalent===true&&validSha(build.canonical_main_sha))))
    return invalid("LIVE_BUILD_PARITY_UNVERIFIED");
  if(journalStatus!==200||!journal||journal.ok!==true||
    journal.schema!=="geomacro.website-derived-news-feed.v1"||
    journal.scored!==false||journal.chargeable!==false||journal.supabase_dependency!==false||
    (journal.original_release_delay_minutes!==0&&journal.original_release_delay_minutes!==15)||
    journal.retention_hours!==72||journal.retention_days!==3||
    journal.delivery_scope!=="free_website_only"||
    !Array.isArray(journal.signals)||journal.signals.length>250)
    return invalid("FREE_ARCHIVE_CONTRACT_INVALID");
  const counts={geopolitics:0,macro:0,rare_earth:0};
  const checkedAt=Date.parse(String(journal.checked_at??""));
  if(!Number.isFinite(checkedAt)||checkedAt>nowMs+60_000||
     nowMs-checkedAt>MAX_STATIC_REFRESH_LAG_MS)
    return invalid("FREE_ARCHIVE_CLOCK_INVALID",counts);
  const titles=[];
  for(const row of journal.signals){
    const common=typeof row?.title==="string"&&row.title.startsWith("Geomacro finds ")&&
      CATEGORIES.includes(row.category)&&
      row.severity===null&&row.same_event_corrob_verified===false&&
      // A row must have been valid at static snapshot creation. A harmless
      // subsequent 72h expiry does not invalidate other current rows.
      originalPublication(row,checkedAt)!==null&&
      !/(?:https?:\/\/|www\.)/iu.test(JSON.stringify({...row,sources_credited:[]}));
    if(row?.status==="osint_feed_observed_unverified"){
      const credits=Array.isArray(row.sources_credited)?row.sources_credited:[];
      const validOsint=common&&row.date_precision==="exact"&&
        row.development_type==="unverified OSINT feed observation"&&row.geography===null&&
        credits.length===1&&typeof credits[0]==="string"&&
        credits[0].startsWith("Monitored feed: ");
      if(!validOsint)return invalid("FREE_ARCHIVE_OSINT_ROW_INVALID",counts);
      // An OSINT feed observation is visible unverified, but cannot stand in
      // for an original-dated official release in this launch receipt.
      continue;
    }
    const valid=common&&
      (row.status==="official_release_observed_unscored"||
       row.status==="official_feed_candidate_unscored");
    if(!valid)return invalid("FREE_ARCHIVE_ORIGINAL_TIME_OR_RIGHTS_SHAPE_INVALID",counts);
    if(originalPublication(row,nowMs)===null)continue;
    counts[row.category]++;
    titles.push(row.title);
  }
  if(!titles.length)return invalid("NO_RETAINED_CURRENT_OFFICIAL_ORIGINALS",counts);
  if(siteStatus!==200||typeof siteHtml!=="string")
    return invalid("FREE_INTELLIGENCE_HTML_UNAVAILABLE",counts);
  const html=decodeHtml(siteHtml);
  if(!html.includes("What changed in the world")||!html.includes("GEOMACRO FINDS")||
    !titles.some(title=>html.includes(title))||
    html.includes("No current verified scored development"))
    return invalid("FREE_ARCHIVE_STORIES_NOT_RENDERED_IN_FIRST_HTML",counts);
  return {schema:"geomacro.minimum-free-production-health.v1",ok:true,
    reason:"FREE_DERIVED_NEWS_SSR_VERIFIED",free_derived_ssr_ready:true,
    website_parity_mode:build.canonical_main_sha===expectedSha
      ?"EXACT_MAIN_SHA":"VERIFIED_NO_WEBSITE_SOURCE_CHANGES",
    derived_rows:titles.length,categories:counts,
    all_three_categories_have_recent_originals:CATEGORIES.every(c=>counts[c]>0),
    legacy_signed_hot_products_verified:false,
    current_numerical_gri_verified:false,
    paid_delivery_authorized:false,d1_requests:0,b2_requests:0,supabase_requests:0,payments:0};
}
// Public providers occasionally time out during edge publication. Retry only
// transient transport/status failures, never malformed 200 JSON, a forbidden
// redirect, unexpected shapes, a stale build or a missing current original.
// No fake data or production mutation. Total attempts per URL: 3.
const RETRIABLE_PUBLIC_STATUS=new Set([408,425,429,500,502,503,504]);
export async function readPublicHealthResource(url,{json=false,
  fetchImpl=fetch,wait=ms=>new Promise(done=>setTimeout(done,ms)),
}={}){
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{
   response=await fetchImpl(url,{redirect:"error",
     headers:{"Accept":json?"application/json":"text/html","Cache-Control":"no-cache"},
     signal:AbortSignal.timeout(16_000)});
  }catch(error){
   // Do not chase redirects; no cross-site fallback is authorized.
   if(error instanceof TypeError&&/redirect/iu.test(error.message))
    throw Error("MINIMUM_PUBLIC_REDIRECT_FORBIDDEN");
   if(attempt===2)throw Error("MINIMUM_PUBLIC_READBACK_NETWORK_UNAVAILABLE");
   await wait(300*(attempt+1));continue;
  }
  if(response.redirected===true||response.status>=300&&response.status<400)
   throw Error("MINIMUM_PUBLIC_REDIRECT_FORBIDDEN");
  if(RETRIABLE_PUBLIC_STATUS.has(response.status)){
   try{await response.body?.cancel()}catch{}
   if(attempt===2)throw Error("MINIMUM_PUBLIC_READBACK_PROVIDER_UNAVAILABLE");
   await wait(300*(attempt+1));continue;
  }
  const body=await response.text();
  if(body.length>1_500_000)throw Error("MINIMUM_PUBLIC_READBACK_TOO_LARGE");
  // A malformed 200 response is an actual contract violation, not a green
  // candidate to hunt for at another edge/URL.
  let parsed=body;
  if(json)try{parsed=JSON.parse(body)}catch{
   throw Error("MINIMUM_PUBLIC_READBACK_JSON_INVALID");
  }
  return {status:response.status,body:parsed};
 }
 throw Error("MINIMUM_PUBLIC_READBACK_NETWORK_UNAVAILABLE");
}
export async function checkMinimumFreeProduction(expectedSha){
  // Three read-only requests only. No provider API, B2 GET, D1 write, money.
  const [j,s,b]=await Promise.all([
    readPublicHealthResource(ARCHIVE_FEED,{json:true}),
    readPublicHealthResource(ROOT+"/intelligence"),
    readPublicHealthResource(ROOT+"/.well-known/geomacro-build.json",{json:true}),
  ]);
  const observedSha=b.body?.canonical_main_sha;
  const websiteSourceEquivalent=observedSha===expectedSha?false:
    await verifyPublishedSourceEquivalence(observedSha,expectedSha);
  // Public deployment marker only; this allows a stale Lovable Publish to be
  // diagnosed without logging feed contents, headers, or credentials.
  console.log(JSON.stringify({schema:"geomacro.live-build-parity-diagnostic.v1",
    expected_main_sha:validSha(expectedSha)?expectedSha:null,
    published_canonical_main_sha:validSha(observedSha)?observedSha:null,
    exact_main_sha_match:observedSha===expectedSha,
    verified_no_website_source_changes:websiteSourceEquivalent}));
  return classifyMinimumFreeProduction({
    journalStatus:j.status,journal:j.body,siteStatus:s.status,siteHtml:s.body,
    buildStatus:b.status,build:b.body,expectedSha,websiteSourceEquivalent,
  });
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const result=await checkMinimumFreeProduction(process.env.GITHUB_SHA);
    console.log(JSON.stringify(result));
    if(!result.ok)process.exitCode=2;
  }catch{
    console.error("MINIMUM_FREE_PRODUCTION_PUBLIC_READBACK_UNAVAILABLE");
    process.exitCode=2;
  }
}
