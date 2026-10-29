/**
 * Query-time access to continuously polled accepted feeds plus pinned
 * country-feed candidates. This is a lead mesh only: country-of-publisher never
 * assigns event country, and every candidate still needs first-party page
 * validation plus exact subject/topic checks in on-demand discovery.
 */
import manifest from "../../config/private-osint-working-sources.v1.json" with {type:"json"};
import nationalGaps from "../../config/private-osint-national-gap-feeds.v1.json" with {type:"json"};
import localCandidates from "../../config/private-osint-local-rss-candidates.v1.json" with {type:"json"};
import officialCandidates from "../../config/private-osint-official-feed-additions.v1.json" with {type:"json"};
import macroMineralCandidates from "../../config/private-osint-macro-minerals-additions.v1.json" with {type:"json"};
import regionalCandidates from "../../config/private-osint-regional-corridor-additions.v1.json" with {type:"json"};
if(manifest?.schema!=="geomacro.private-osint-working-sources.v1"||
   !Array.isArray(manifest.sources))
  throw Error("ON_DEMAND_COUNTRY_PUBLISHER_MANIFEST_INVALID");

const CATEGORY=new Set(["geopolitics","macro","rare_earth"]);
const FEED_TYPE=new Set(["rss","atom"]);
function normalizeSource(source,{accepted=false}={}){
  let url,reference;
  try{
    url=new URL(source.url);
    if(!accepted)reference=new URL(source.discovery_reference_url??source.discovery_url);
  }catch{return null}
  if(!/^private_[a-z0-9_]+$/u.test(source.id)||
     !/^[A-Z]{3}$/u.test(source.publisher_country_iso3??"")||
     url.protocol!=="https:"||url.username||url.password||url.port||url.hash||
     !FEED_TYPE.has(source.type)||
     source.private_discovery_index_only===true||
     !Array.isArray(source.categories))return null;
  if(accepted&&(source.acceptance?.http_status!==200||
     source.acceptance?.feed_parsed!==true||
     source.acceptance?.native_publication_clock_present!==true))return null;
  if(!accepted&&(source.activation_state!=="RUNTIME_PROBE_REQUIRED"||
     source.provider_rights_verified!==false||source.commercial_eligible!==false||
     source.access_verified_in_production!==false||source.publicly_deliverable!==false||
     reference.protocol!=="https:"||reference.username||reference.password||
     reference.port||reference.hash||
     !(reference.hostname===url.hostname||source.id==="private_gap_bhr_alayam_local")))return null;
  const categories=[...new Set(source.categories.filter(category=>CATEGORY.has(category)))];
  if(!categories.length)return null;
  return {id:source.id,url:source.url,host:url.hostname,
    article_host:accepted||source.id!=="private_gap_bhr_alayam_local"
      ?url.hostname:reference.hostname,
    country_iso3:source.publisher_country_iso3,type:source.type,categories,
    accepted_at_registration:accepted};
}
const SOURCE_ROWS=Object.freeze(manifest.sources.flatMap(source=>{
  const row=normalizeSource(source,{accepted:true});return row?[row]:[];
}));
// Candidate feeds are allowed as query-time first-party leads only because
// the request itself performs a fresh bounded GET and requires a native feed
// clock plus exact original-page checks. Their registry state remains
// RUNTIME_PROBE_REQUIRED; registration alone never means the source worked.
const CANDIDATE_INPUTS=[nationalGaps,localCandidates,officialCandidates,
  macroMineralCandidates,regionalCandidates].flatMap(x=>Array.isArray(x?.sources)?x.sources:[]);
const CANDIDATE_ROWS=Object.freeze(CANDIDATE_INPUTS.flatMap(source=>{
  const row=normalizeSource(source);return row?[row]:[];
}));
const ALL_SOURCE_ROWS=Object.freeze([...SOURCE_ROWS,...CANDIDATE_ROWS]);

export function onDemandCountryPublisherFeeds(countryIso3,category,{limit=3}={}){
  const country=String(countryIso3??"").toUpperCase();
  if(!/^[A-Z]{3}$/u.test(country)||!CATEGORY.has(category)||
     !Number.isSafeInteger(limit)||limit<1||limit>12)
    throw Error("ON_DEMAND_COUNTRY_PUBLISHER_QUERY_INVALID");
  const specialist=source=>{
    const identity=(source.id+" "+source.host).toLowerCase();
    const patterns={
      geopolitics:/(?:official|government|presiden|foreign|diplom|defen[cs]e|security|parliament|unsc|council|state_department|mfa)/u,
      macro:/(?:central.?bank|reserve.?bank|bankof|federal.?reserve|fed_|bls|stats|statistics|treasury|finance|ministry.?of.?finance|nbs|imf|oecd)/u,
      rare_earth:/(?:mineral|mining|geolog|rare.?earth|critical.?raw|nrcan|usgs|earth.?science|extractive|industry.?department)/u,
    };
    return patterns[category].test(identity)?0:1;
  };
  const seenHosts=new Set();
  return ALL_SOURCE_ROWS.filter(source=>source.country_iso3===country&&
    source.categories.includes(category))
    .sort((a,b)=>specialist(a)-specialist(b)||
      Number(b.accepted_at_registration)-Number(a.accepted_at_registration)||
      a.id.localeCompare(b.id))
    .filter(source=>!seenHosts.has(source.article_host)&&seenHosts.add(source.article_host))
    .slice(0,limit).map(source=>({...source}));
}

export function isPinnedCountryPublisherHost(host){
  return typeof host==="string"&&ALL_SOURCE_ROWS.some(source=>
    source.host===host||source.article_host===host);
}

export function isPinnedCountryPublisherUrl(raw,{allowFeedQuery=false}={}){
  try{
    const url=new URL(raw);
    return url.protocol==="https:"&&!url.username&&!url.password&&!url.port&&
      !url.hash&&isPinnedCountryPublisherHost(url.hostname)&&
      (allowFeedQuery||!url.search);
  }catch{return false}
}
