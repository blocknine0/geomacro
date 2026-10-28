#!/usr/bin/env node
/**
 * Append-only, derived-only public Finds archive.
 *
 * This writes month/category shards on the dedicated archive branch and copies
 * them to a separate Workers Static Assets project. Public reads then bypass
 * D1 completely. The current D1 journal is read only once to seed recoverable
 * pre-archive rows; subsequent runs never read it for the public website feed.
 */
import {
  cpSync, existsSync, mkdirSync, readFileSync, writeFileSync,
} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {createHash} from "node:crypto";
import {isSafeDerivedNewsReadbackSignal} from "../lib/derived-news-readback-policy.mjs";

export const ARCHIVE_INDEX_SCHEMA="geomacro.permanent-derived-news-archive-index.v1";
export const ARCHIVE_MONTH_SCHEMA="geomacro.permanent-derived-news-archive-month.v1";
export const PUBLIC_FEED_SCHEMA="geomacro.website-derived-news-feed.v1";
export const CATEGORIES=["geopolitics","macro","rare_earth"];
export const SIGNAL_FIELDS=[
  "id","category","title","what_changed","why_it_matters","topic","geography",
  "development_type","published_at","date_precision","observed_release_count",
  "sources_credited","status","same_event_corrob_verified","severity",
];
const FIELD_SET=new Set(SIGNAL_FIELDS);
const CATEGORY_SET=new Set(CATEGORIES);
const D1_FEED_URL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/website-derived-news-immediate";
const MAX_SIGNAL_BYTES=5_000;
const MAX_MONTH_SHARD_BYTES=20*1024*1024;
const MAX_ARCHIVE_AGE_MS=72*60*60_000;
export const ARCHIVE_CURRENT_COVERAGE_SCHEMA="geomacro.free-derived-archive-eligibility.v1";

function parseObject(text,code){
  try{
    const value=JSON.parse(text);
    if(!value||typeof value!=="object"||Array.isArray(value))throw Error(code);
    return value;
  }catch{throw Error(code);}
}
function isoDateValid(value){
  if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return false;
  const ms=Date.parse(value+"T00:00:00.000Z");
  return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value;
}
function originalTime(signal){
  if(signal.date_precision==="day"){
    if(!isoDateValid(signal.published_at))return null;
    return {at:Date.parse(signal.published_at+"T00:00:00.000Z"),
      eligible_at:Date.parse(signal.published_at+"T00:00:00.000Z")+36*60*60_000};
  }
  if(signal.date_precision!=="exact"||typeof signal.published_at!=="string"||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(signal.published_at))
    return null;
  const at=Date.parse(signal.published_at);
  if(!Number.isFinite(at)||new Date(at).toISOString().slice(0,19)!==signal.published_at.slice(0,19))
    return null;
  return {at,eligible_at:at};
}

/** Structural/privacy validation that deliberately does not expire archived originals. */
export function isPermanentArchiveSignal(value,now=Date.now(),{allowHistorical=true}={}){
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const s=value;
  if(Object.keys(s).length!==FIELD_SET.size||Object.keys(s).some(k=>!FIELD_SET.has(k))||
     !isSafeDerivedNewsReadbackSignal(s)||
     !CATEGORY_SET.has(s.category)||
     typeof s.id!=="string"||!new RegExp("^(?:"+CATEGORIES.join("|")+ ")-[0-9a-f]{8}$","u").test(s.id)||
     typeof s.title!=="string"||!s.title.startsWith("Geomacro finds ")||s.title.length>240||
     typeof s.what_changed!=="string"||s.what_changed.length<30||s.what_changed.length>650||
     typeof s.why_it_matters!=="string"||s.why_it_matters.length<30||s.why_it_matters.length>700||
     typeof s.topic!=="string"||s.topic.length>120||
     !(s.geography===null||(typeof s.geography==="string"&&s.geography.length<=70))||
     typeof s.development_type!=="string"||s.development_type.length>80||
     !["exact","day"].includes(s.date_precision)||
     !["official_release_observed_unscored","official_feed_candidate_unscored","osint_feed_observed_unverified"].includes(s.status)||
     s.observed_release_count!==1||s.same_event_corrob_verified!==false||s.severity!==null||
     !Array.isArray(s.sources_credited)||s.sources_credited.length>2||
     s.sources_credited.some(x=>typeof x!=="string"||x.length>230))
    return false;
  const time=originalTime(s);
  if(!time||time.at>now||time.eligible_at>now)return false;
  if(!allowHistorical&&time.at<now-MAX_ARCHIVE_AGE_MS)return false;
  const raw=JSON.stringify(s);
  const proseOnly=s.status==="osint_feed_observed_unverified"
    ?JSON.stringify({...s,sources_credited:[]}):raw;
  if(raw.length>MAX_SIGNAL_BYTES||/https?:\/\/|www\./iu.test(proseOnly))return false;
  if(s.status==="osint_feed_observed_unverified"&&
     !/^Monitored feed: [a-z0-9.-]+(?: \(aggregator; original publisher not verified\))?$/u.test(s.sources_credited[0]||""))
    return false;
  return true;
}

function readJsonIfPresent(path,code){
  if(!existsSync(path))return null;
  const text=readFileSync(path,"utf8");
  if(Buffer.byteLength(text)>MAX_MONTH_SHARD_BYTES&&path.includes("/archive/"))
    throw Error("PERMANENT_ARCHIVE_SHARD_TOO_LARGE");
  return parseObject(text,code);
}
function monthFor(signal){
  const time=originalTime(signal);
  if(!time)return null;
  return new Date(time.at).toISOString().slice(0,7);
}
function fileFor(dataDir,month,category){
  return join(dataDir,"archive",month,category+".json");
}
function sortSignals(signals){
  return signals.slice().sort((a,b)=>
    b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
}

const CATEGORY_HEADLINE_TERMS={
  geopolitics:/\b(?:war|attack|airstrike|missile|election|president|minister|diplomacy|diplomatic|sanctions|border|military|security|foreign policy|government|coup|treaty|conflict|ukraine|russia|israel|iran|china|taiwan|sudan|yemen|nato|united nations|embassy|vote|parliament|political)\b/giu,
  macro:/\b(?:inflation|prices?|gdp|central bank|interest rates?|currency|exchange rates?|forex|fx|monetary|fiscal|unemployment|jobs|output|growth|recession|economy|economic|bond|yield|reserves?|trade deficit|debt|cpi|pmi)\b/giu,
  rare_earth:/\b(?:rare earths?|critical minerals?|lithium|cobalt|nickel|graphite|copper|manganese|bauxite|ores?|mining|minerals?|batteries?|smelter|refining|uranium|tantalum|gallium|germanium|magnets?|metallurgy|supply chain)\b/giu,
};
function normalizeHeadline(title){
  return title.normalize("NFKC")
    .replace(/^Geomacro finds\s+/iu,"")
    .replace(/\s+[—–-]\s+(?:Al Jazeera|The Hindu|TASS|Xinhua|The Tribune-Democrat|Bozeman Daily Chronicle|Mining Weekly|Reuters|Associated Press|Bloomberg|Financial Times|The Guardian|The Independent|The New York Times|The Washington Post|BBC|CNN)\s*$/iu,"")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu," ")
    .trim().replace(/\s+/gu," ");
}
function isTemplateObservation(signal){
  const candidateText=[signal.title,signal.topic,signal.development_type,
    signal.what_changed].filter(value=>typeof value==="string").join(" ");
  const title=typeof signal.title==="string"?signal.title:"";
  return /\b(?:source[- ]feed observation|publisher candidate|unclassified publisher update)\b/iu
      .test(candidateText)||
    /(?:the dated original release concerns|does not establish a named actor performing a verifiable action)/iu
      .test(String(signal.what_changed??""))||
    /^Geomacro finds (?:official update on|announcement on|trade restriction on|security on|warning on|warning about)\b/iu
      .test(title);
}
function isOfficialObservation(signal){
  return signal.status==="official_release_observed_unscored"||
    signal.status==="official_feed_candidate_unscored";
}
function categoryRelevance(signal){
  const text=[signal.title,signal.topic,signal.what_changed].filter(x=>typeof x==="string").join(" ");
  const scores={geopolitics:0,macro:0,rare_earth:0};
  for(const category of CATEGORIES){
    const pattern=CATEGORY_HEADLINE_TERMS[category];
    pattern.lastIndex=0;
    scores[category]=[...text.matchAll(pattern)].length;
  }
  return scores[signal.category]-(Math.max(...CATEGORIES.filter(c=>c!==signal.category).map(c=>scores[c]))||0);
}
const AGGREGATOR_ONLY_CREDITS=new Set([
  "Monitored feed: news.google.com",
  "Monitored feed: news.google.com (aggregator; original publisher not verified)",
]);
function isAggregatorOnly(signal){
  return Array.isArray(signal.sources_credited)&&signal.sources_credited.some(
    credit=>typeof credit==="string"&&AGGREGATOR_ONLY_CREDITS.has(credit),
  );
}
function preferDuplicateCandidate(candidate,current){
  const relevanceDifference=categoryRelevance(candidate)-categoryRelevance(current);
  if(relevanceDifference!==0)return relevanceDifference>0;
  const officialDifference=Number(isOfficialObservation(candidate))-Number(isOfficialObservation(current));
  if(officialDifference!==0)return officialDifference>0;
  // Compare the whole source-credit label against the finite aggregator allowlist.
  // A substring match would incorrectly classify labels containing arbitrary hosts.
  const candidateDirect=!isAggregatorOnly(candidate);
  const currentDirect=!isAggregatorOnly(current);
  if(candidateDirect!==currentDirect)return candidateDirect;
  if(candidate.published_at!==current.published_at)return candidate.published_at>current.published_at;
  return candidate.id<current.id;
}
/**
 * Keep the rolling public feed factual and usable: drop generic OSINT template
 * placeholders, deduplicate equivalent normalized headlines across categories,
 * then round-robin real current rows so one high-volume domain cannot starve
 * macro or critical minerals. Permanent historical shards remain untouched.
 */
function distinctHeadlineArchiveRows(signals){
  if(!Array.isArray(signals))
    throw Error("PERMANENT_ARCHIVE_LATEST_INPUT_INVALID");
  const ids=new Set();
  for(const signal of signals){
    if(!signal||typeof signal!=="object"||Array.isArray(signal)||
       !CATEGORY_SET.has(signal.category)||typeof signal.id!=="string"||
       typeof signal.title!=="string"||typeof signal.published_at!=="string"||
       !Number.isFinite(Date.parse(signal.published_at))||ids.has(signal.id))
      throw Error("PERMANENT_ARCHIVE_LATEST_INPUT_INVALID");
    ids.add(signal.id);
  }
  const uniqueByHeadline=new Map();
  for(const signal of signals){
    if(isTemplateObservation(signal))continue;
    const key=normalizeHeadline(signal.title);
    if(!key)continue;
    const current=uniqueByHeadline.get(key);
    if(!current||preferDuplicateCandidate(signal,current))uniqueByHeadline.set(key,signal);
  }
  return sortSignals([...uniqueByHeadline.values()]);
}
/** The rolling 250-row latest feed is a preview, not the full immutable archive. */
export function selectCurrentArchiveSignals(signals,limit=250){
  if(!Number.isSafeInteger(limit)||limit<1||limit>250)
    throw Error("PERMANENT_ARCHIVE_LATEST_SELECTION_INVALID");
  const unique=distinctHeadlineArchiveRows(signals);
  const groups=new Map(CATEGORIES.map(category=>[
    category,sortSignals(unique.filter(signal=>signal.category===category)),
  ]));
  const selected=[];
  for(let offset=0;selected.length<limit;offset++){
    let added=false;
    for(const category of CATEGORIES){
      const signal=groups.get(category)[offset];
      if(signal&&selected.length<limit){selected.push(signal);added=true;}
    }
    if(!added)break;
  }
  return sortSignals(selected);
}
/**
 * Zero-D1, automatic FREE coverage census over ALL current archive shards.
 * Only concrete official original releases qualify. Candidate publisher
 * entries and OSINT monitoring remain visible in distinct pending buckets;
 * no item is converted into paid eligibility, a signature or a risk score.
 * Unlike latest.json, this census is not truncated at 250 rows.
 */
export function buildCurrentArchiveEligibility(signals,now=Date.now(),latest=[]){
  if(!Array.isArray(signals)||!Number.isFinite(now)||!Array.isArray(latest))
    throw Error("PERMANENT_ARCHIVE_ELIGIBILITY_INPUT_INVALID");
  const current=signals.filter(s=>isPermanentArchiveSignal(s,now,{allowHistorical:false}));
  const distinct=distinctHeadlineArchiveRows(current);
  const totalCounts=()=>({geopolitics:0,macro:0,rare_earth:0});
  const eligible=totalCounts(),candidates=totalCounts(),unverified=totalCounts();
  const eligibleIds=[];
  for(const row of distinct){
    if(row.status==="official_release_observed_unscored"){
      eligible[row.category]++;eligibleIds.push(row.id);
    }else if(row.status==="official_feed_candidate_unscored"){
      candidates[row.category]++;
    }else if(row.status==="osint_feed_observed_unverified"){
      unverified[row.category]++;
    }
  }
  const sum=counts=>Object.values(counts).reduce((a,b)=>a+b,0);
  const uniqueCount=distinct.length;
  const displayableByCategory=totalCounts();
  for(const row of distinct)displayableByCategory[row.category]++;
  const latestIds=new Set(latest.map(row=>row.id));
  if(latestIds.size!==latest.length||latest.some(row=>!distinct.some(s=>s.id===row.id)))
    throw Error("PERMANENT_ARCHIVE_ELIGIBILITY_LATEST_MISMATCH");
  const latestEligible=latest.filter(row=>row.status==="official_release_observed_unscored");
  const countAll=eligibleIds.length;
  return Object.freeze({
    schema:ARCHIVE_CURRENT_COVERAGE_SCHEMA,
    checked_at:new Date(now).toISOString(),
    retention_hours:72,
    eligibility_policy:"CONCRETE_ORIGINAL_RELEASE_UNSCORED_ONLY",
    original_release_eligible_total:countAll,
    original_release_by_category:eligible,
    pending_publisher_candidate_total:sum(candidates),
    pending_publisher_by_category:candidates,
    pending_osint_total:sum(unverified),
    pending_osint_by_category:unverified,
    unique_current_findings:uniqueCount,
    free_displayable_findings_total:uniqueCount,
    free_displayable_by_category:displayableByCategory,
    free_displayable_outside_latest_preview:distinct.filter(row=>!latestIds.has(row.id)).length,
    free_displayable_status:"MIXED_OFFICIAL_AND_EXPLICITLY_UNVERIFIED",
    duplicate_or_template_excluded:current.length-uniqueCount,
    latest_preview_rows:latest.length,
    latest_preview_official_rows:latestEligible.length,
    eligible_outside_latest_preview:eligibleIds.filter(id=>!latestIds.has(id)).length,
    eligible_ids_sha256:createHash("sha256").update(eligibleIds.sort().join("\n")).digest("hex"),
    automatic_on_static_archive_refresh:true,
    free_website_only:true,
    unverified_promoted:false,
    signed_or_scored:false,
    paid_customer_eligible:false,
    live_payment_authorized:false,
    d1_reads:0,b2_reads:0,payments:0,
  });
}

function readIndex(dataDir){
  const path=join(dataDir,"index.json");
  if(!existsSync(path))return {
    schema:ARCHIVE_INDEX_SCHEMA,updated_at:null,months:[],
    categories:CATEGORIES,seed_complete:false,total_signals:0,
  };
  const index=parseObject(readFileSync(path,"utf8"),"PERMANENT_ARCHIVE_INDEX_INVALID");
  if(index.schema!==ARCHIVE_INDEX_SCHEMA||!Array.isArray(index.months)||
     index.months.some(m=>typeof m!=="string"||!/^\d{4}-\d{2}$/u.test(m))||
     !Array.isArray(index.categories)||index.categories.length!==3||
     !CATEGORIES.every(c=>index.categories.includes(c))||
     typeof index.seed_complete!=="boolean")
    throw Error("PERMANENT_ARCHIVE_INDEX_INVALID");
  return index;
}

/** Read current D1 archive one time for migration/seed only; fail open for publication, not for validation. */
export async function readRecoverableD1Seed(fetchImpl=fetch,now=Date.now()){
  const collected=[];
  for(const offset of [0,250,500]){
    const url=D1_FEED_URL+(offset===0?"":"?offset="+offset);
    const response=await fetchImpl(url,{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{Accept:"application/json","Cache-Control":"no-cache"},
      signal:AbortSignal.timeout(8_000),
    });
    if(!response.ok||Number(response.headers.get("content-length")??0)>512_000)
      throw Error("PERMANENT_ARCHIVE_D1_SEED_UNAVAILABLE");
    const body=await response.text();
    if(Buffer.byteLength(body)>512_000)throw Error("PERMANENT_ARCHIVE_D1_SEED_TOO_LARGE");
    const doc=parseObject(body,"PERMANENT_ARCHIVE_D1_SEED_INVALID");
    const checked=Date.parse(String(doc.checked_at??""));
    if(doc.ok!==true||doc.schema!==PUBLIC_FEED_SCHEMA||
       ![0,15].includes(doc.original_release_delay_minutes)||
       doc.retention_days!==3||doc.retention_hours!==72||
       doc.delivery_scope!=="free_website_only"||
       !Array.isArray(doc.signals)||doc.signals.length>250||
       !Number.isFinite(checked)||checked>now+5_000||now-checked>30_000||
       doc.page_offset!==offset||doc.page_size!==250||
       typeof doc.has_more!=="boolean")
      throw Error("PERMANENT_ARCHIVE_D1_SEED_CONTRACT_INVALID");
    for(const signal of doc.signals){
      if(isPermanentArchiveSignal(signal,now,{allowHistorical:false})&&
         !isTemplateObservation(signal))collected.push(signal);
    }
    if(doc.has_more===false){
      if(doc.next_offset!==null)throw Error("PERMANENT_ARCHIVE_D1_SEED_CURSOR_INVALID");
      return sortSignals([...new Map(collected.map(s=>[s.id,s])).values()]);
    }
    if(offset===500||doc.next_offset!==offset+250)
      throw Error("PERMANENT_ARCHIVE_D1_SEED_CURSOR_INVALID");
  }
  throw Error("PERMANENT_ARCHIVE_D1_SEED_INCOMPLETE");
}

function readCandidates(path,now){
  if(!existsSync(path))return [];
  const doc=parseObject(readFileSync(path,"utf8"),"PERMANENT_ARCHIVE_CANDIDATE_DOCUMENT_INVALID");
  if(doc.schema!=="geomacro.permanent-derived-news-candidates.v1"||
     !Array.isArray(doc.signals)||doc.signals.length>1500)
    throw Error("PERMANENT_ARCHIVE_CANDIDATE_DOCUMENT_INVALID");
  const seen=new Set();
  const accepted=[];
  for(const signal of doc.signals){
    if(!isPermanentArchiveSignal(signal,now,{allowHistorical:false})||
       isTemplateObservation(signal))continue;
    if(seen.has(signal.id))continue;
    seen.add(signal.id);
    accepted.push(signal);
  }
  return accepted;
}

export async function publishPermanentDerivedNewsArchive({
  archiveDir,assetsDir,candidatePath,
  fetchImpl=fetch,now=Date.now(),
}={}){
  if(!archiveDir||!assetsDir||!candidatePath||!Number.isFinite(now))
    throw Error("PERMANENT_ARCHIVE_CONFIGURATION_INVALID");
  const dataDir=join(resolve(archiveDir),"data");
  mkdirSync(dataDir,{recursive:true});
  const originalIndex=readIndex(dataDir);
  const index={...originalIndex,months:originalIndex.months.slice()};
  const grouped=new Map();
  const existingById=new Map();
  let totalExisting=0;

  // Every existing shard is mandatory and immutable. Missing/corrupt historical
  // content aborts the update instead of silently rebuilding a shortened archive.
  for(const month of index.months){
    for(const category of CATEGORIES){
      const path=fileFor(dataDir,month,category);
      const doc=readJsonIfPresent(path,"PERMANENT_ARCHIVE_MONTH_INVALID");
      if(!doc||doc.schema!==ARCHIVE_MONTH_SCHEMA||doc.month!==month||
         doc.category!==category||!Array.isArray(doc.signals)||doc.signals.length>100_000)
        throw Error("PERMANENT_ARCHIVE_MONTH_INVALID");
      for(const signal of doc.signals){
        if(signal.category!==category||monthFor(signal)!==month||
           !isPermanentArchiveSignal(signal,now,{allowHistorical:true}))
          throw Error("PERMANENT_ARCHIVE_EXISTING_SIGNAL_INVALID");
        if(existingById.has(signal.id))throw Error("PERMANENT_ARCHIVE_DUPLICATE_ID_EXISTING");
        existingById.set(signal.id,signal);
        totalExisting++;
      }
      grouped.set(month+"|"+category,doc.signals.slice());
    }
  }

  let seedCompleteThisRun=false;
  let seedRows=[];
  if(!index.seed_complete){
    try{
      seedRows=await readRecoverableD1Seed(fetchImpl,now);
      index.seed_complete=true;
      seedCompleteThisRun=true;
    }catch{
      // D1 may be over quota or temporarily unavailable. It cannot block new
      // candidates and it cannot delete or replace any earlier archive entry.
      console.warn("PERMANENT_ARCHIVE_D1_SEED_DEFERRED");
    }
  }
  const candidates=readCandidates(candidatePath,now);
  const allIncoming=[...seedRows,...candidates];
  let added=0;
  let touchedMonths=new Set();
  for(const signal of allIncoming){
    const month=monthFor(signal);
    if(!month||existingById.has(signal.id))continue;
    const key=month+"|"+signal.category;
    const rows=grouped.get(key)??[];
    if(rows.some(s=>s.id===signal.id))continue;
    rows.push(signal);
    grouped.set(key,rows);
    existingById.set(signal.id,signal);
    touchedMonths.add(month);
    added++;
  }

  // Preserve all old shards. Update only months receiving new immutable IDs.
  for(const month of touchedMonths){
    mkdirSync(join(dataDir,"archive",month),{recursive:true});
    for(const category of CATEGORIES){
      const rows=sortSignals(grouped.get(month+"|"+category)??[]);
      const doc={schema:ARCHIVE_MONTH_SCHEMA,month,category,
        updated_at:new Date(now).toISOString(),signals:rows};
      const text=JSON.stringify(doc,null,2)+"\n";
      if(Buffer.byteLength(text)>MAX_MONTH_SHARD_BYTES)
        throw Error("PERMANENT_ARCHIVE_SHARD_TOO_LARGE");
      writeFileSync(fileFor(dataDir,month,category),text,{encoding:"utf8",mode:0o644});
    }
  }

  const allSignals=sortSignals([...existingById.values()]);
  const months=[...new Set(allSignals.map(monthFor).filter(Boolean))].sort().reverse();
  const totalSignals=allSignals.length;
  const dataLatest=join(dataDir,"latest.json");
  const shouldUpdateSnapshots=added>0||seedCompleteThisRun||!existsSync(dataLatest);
  if(shouldUpdateSnapshots){
    const recent=allSignals.filter(s=>isPermanentArchiveSignal(s,now,{allowHistorical:false}));
    const latest={
      ok:true,schema:PUBLIC_FEED_SCHEMA,checked_at:new Date(now).toISOString(),
      original_release_delay_minutes:0,retention_days:3,retention_hours:72,
      delivery_scope:"free_website_only",scored:false,chargeable:false,
      supabase_dependency:false,signals:selectCurrentArchiveSignals(recent,250),
    };
    writeFileSync(dataLatest,JSON.stringify(latest,null,2)+"\n",{encoding:"utf8",mode:0o644});
    const coverage=buildCurrentArchiveEligibility(recent,now,latest.signals);
    writeFileSync(join(dataDir,"coverage-72h.json"),JSON.stringify(coverage,null,2)+"\n",{encoding:"utf8",mode:0o644});
  }

  const indexChanged=added>0||seedCompleteThisRun||index.total_signals!==totalSignals;
  if(indexChanged){
    index.schema=ARCHIVE_INDEX_SCHEMA;
    index.updated_at=new Date(now).toISOString();
    index.months=months;
    index.categories=CATEGORIES;
    index.seed_complete=Boolean(index.seed_complete);
    index.total_signals=totalSignals;
    writeFileSync(join(dataDir,"index.json"),JSON.stringify(index,null,2)+"\n",
      {encoding:"utf8",mode:0o644});
  }

  let publishedIndexMatches=false;
  if(totalSignals>0||index.seed_complete){
    try{
      const publicResponse=await fetchImpl("https://geomacro-public-finds-archive.daspallab202391.workers.dev/index.json",{
        method:"GET",redirect:"error",cache:"no-store",headers:{Accept:"application/json"},
        signal:AbortSignal.timeout(5_000),
      });
      if(publicResponse.ok){
        const publicText=await publicResponse.text();
        if(Buffer.byteLength(publicText)<=256_000){
          const publicIndex=parseObject(publicText,"PERMANENT_ARCHIVE_PUBLIC_INDEX_INVALID");
          publishedIndexMatches=publicIndex.schema===index.schema&&
            publicIndex.updated_at===index.updated_at&&
            publicIndex.total_signals===totalSignals&&
            publicIndex.seed_complete===Boolean(index.seed_complete)&&
            JSON.stringify(publicIndex.months)===JSON.stringify(months);
        }
      }
    }catch{/* First deployment or a temporarily unavailable asset; deploy on the next archive run. */}
  }
  const deployNeeded=Boolean((totalSignals>0||index.seed_complete)&&!publishedIndexMatches&&
    (added>0||seedCompleteThisRun||indexChanged||!publishedIndexMatches));
  mkdirSync(resolve(assetsDir),{recursive:true});
  if(deployNeeded)cpSync(dataDir,resolve(assetsDir),{recursive:true,force:true});
  const result={
    schema:"geomacro.permanent-derived-news-archive-publish.v1",
    deploy_needed:deployNeeded,
    seed_complete:index.seed_complete,
    seed_completed_this_run:seedCompleteThisRun,
    new_signals_added:added,
    total_signals:totalSignals,
    month_partitions:months.length,
    d1_used_for_public_reads:false,
    old_signals_deleted:0,
    duplicate_ids_overwritten:0,
    raw_upstream_stored:false,
    source_urls_logged:false,
    payments:0,
  };
  const resultPath=join(resolve(process.env.RUNNER_TEMP||dirname(resolve(candidatePath))),
    "permanent-derived-news-archive-result.json");
  mkdirSync(dirname(resultPath),{recursive:true});
  writeFileSync(resultPath,JSON.stringify(result,null,2)+"\n",{encoding:"utf8",mode:0o600});
  console.log(JSON.stringify(result));
  return result;
}

if(process.argv[1]&&import.meta.url===new URL("file://"+resolve(process.argv[1])).href){
  const [archiveDir,assetsDir,candidatePath]=process.argv.slice(2);
  publishPermanentDerivedNewsArchive({archiveDir,assetsDir,candidatePath}).catch(error=>{
    const code=error instanceof Error&&/^PERMANENT_ARCHIVE_[A-Z0-9_]+$/.test(error.message)
      ?error.message:"PERMANENT_ARCHIVE_UPDATE_FAILED";
    console.error(code);
    process.exitCode=2;
  });
}
