#!/usr/bin/env node
// Additional official-publisher release/structural observation lane.
// Read-only and PRIVATE: never a scoring, rights, B2, D1, Supabase or x402
// writer. Source polling success is NOT event occurrence or 195-country proof.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES=192*1024;
const DAY_MS=86_400_000;
export const EXPANDED_OFFICIAL_SOURCES=Object.freeze([
  Object.freeze({
    id:"eu_sanctions_guidance_official_rss_review",
    domain:"geopolitics",kind:"policy_guidance_release",
    url:"https://finance.ec.europa.eu/node/1296/rss_en",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  Object.freeze({
    id:"ecb_statistical_press_official_rss_review",
    domain:"macro",kind:"statistical_press_release",
    url:"https://www.ecb.europa.eu/rss/statpress.html",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  Object.freeze({
    id:"eurostat_stats_update_official_rss_review",
    domain:"macro",kind:"statistical_dataset_release",
    url:"https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/en/statistics-update.rss",
    // Same originating publisher, NOT independent corroboration. One alternate
    // only for a primary 404 or server-side error (never a 401/403/429 bypass).
    alternate_url:"https://ec.europa.eu/eurostat/api/dissemination/catalogue/rss/de/statistics-update.rss",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  Object.freeze({
    id:"eiti_implementing_country_official_api_review",
    domain:"rare_earth",kind:"structural_extractives_country_metadata",
    url:"https://eiti.org/api/v2.0/implementing_country",
    media:"json",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
  Object.freeze({
    id:"eu_official_featured_news_minerals_private_rss_review",
    domain:"rare_earth",kind:"cross_sector_original_publisher_link_discovery",
    url:"https://european-union.europa.eu/node/309/rss_en",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
    topic:/\b(?:critical raw materials?|rare[- ]earths?|lithium|cobalt|nickel|graphite|gallium|germanium|tungsten|magnesium|strategic minerals?|mineral (?:supply|projects?|security))\b/iu,
  }),
  Object.freeze({
    id:"nrcan_simply_science_official_rss_review",
    domain:"rare_earth",kind:"natural_resources_science_release",
    url:"https://natural-resources.canada.ca/simply-science/rss.xml",
    media:"rss",rights:"UNVERIFIED",poll:"six_hourly",
    event_intelligence:false,country_coverage_verified:false,
  }),
]);

const XML_MIME=/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu;
const JSON_MIME=/^(?:application\/(?:json|[a-z0-9.+-]+\+json))(?:;|$)/iu;
const SOURCE_DOMAINS=["geopolitics","macro","rare_earth"];

function rssDateCounts(xml,now,topic=null) {
  if (!/<rss(?:\s|>)/iu.test(xml) || /<!DOCTYPE|<!ENTITY/iu.test(xml)) return null;
  const entries=[...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0,80);
  let dated=0,recent=0,topicalRecent=0;
  for(const [,item] of entries) {
    const date=item.match(/<pubDate(?:\s[^>]*)?>([\s\S]*?)<\/pubDate>/iu)?.[1];
    // Only a source-native per-item date. Never the channel clock, retrieval,
    // processing time, or feed update time; and never an event risk claim.
    if (!date) continue;
    const ms=Date.parse(date.trim());
    if (!Number.isFinite(ms) || ms>now.getTime()) continue;
    dated++;
    if(now.getTime()-ms<=DAY_MS){
      recent++;
      const headline=item.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/iu)?.[1]??"";
      // The official aggregator is a discovery pointer, not an independent
      // original publisher, and headline relevance is NOT event acceptance.
      if(topic?.test(headline))topicalRecent++;
    }
  }
  return {seen:entries.length,native_dated:dated,within_24h:recent,topical_within_24h:topicalRecent};
}

function jsonShape(value) {
  // A structural country listing only; no annual series or event time inferred.
  if (!value || typeof value!=="object" || Array.isArray(value)) return false;
  return Array.isArray(value.data) || Array.isArray(value.results) ||
    Array.isArray(value.items);
}

export async function probeExpandedSource(source,{
  fetchImpl=fetch,now=new Date(), timeoutMs=5000,
}={}) {
  if(!EXPANDED_OFFICIAL_SOURCES.includes(source))throw Error("SOURCE_NOT_FIXED");
  const row={
    source_id:source.id,domain:source.domain,kind:source.kind,
    publisher_reachable:false,format_valid:false,
    source_native_release_items:null,source_native_24h_release_items:null,
    topical_private_release_links_24h:null,
    official_locale_fallback_attempted:false,
    official_locale_fallback_used:false,
    // Sanitized numeric transport status only; never forward upstream bodies.
    primary_http_status:null,fallback_http_status:null,
    same_event_independent_corroboration_verified:false,
    source_native_release_is_scored_event:false,
    country_coverage_verified:false,commercial_rights_verified:false,
    current_scored_intelligence_verified:false,
    commercial_eligible:false,reason:"TRANSPORT_UNAVAILABLE",
  };
  const fetchOfficial=async url=>fetchImpl(url,{
    redirect:"error",
    signal:AbortSignal.timeout(timeoutMs),
    headers:{accept:source.media==="rss"
      ?"application/rss+xml, application/xml;q=0.9, text/xml;q=0.8"
      :"application/json","user-agent":"Geomacro-Official-Expanded-Source-Private-Monitor/1.0"},
  });
  let response;
  try{response=await fetchOfficial(source.url);}catch{return row;}
  row.primary_http_status=response.status;
  // Documented language variant at the SAME official publisher. Do not
  // retry on 401/403/429, network/redirect error or MIME/body/shape rejection.
  // Strictly one extra request; primary or alternate stays fail-closed.
  if(source.alternate_url && (response.status===404 ||
    (response.status>=500 && response.status<=599))){
    row.official_locale_fallback_attempted=true;
    try{response=await fetchOfficial(source.alternate_url);}catch{return row;}
    row.fallback_http_status=response.status;
  }
  if(!response.ok) {
    row.reason=response.status===429?"PUBLISHER_RATE_LIMITED":
      response.status===401||response.status===403?"PUBLISHER_DENIED":"PUBLISHER_HTTP_NOT_OK";
    return row;
  }
  const mime=response.headers.get("content-type")??"";
  if(!(source.media==="rss"?XML_MIME:JSON_MIME).test(mime)) {
    row.reason="SOURCE_CONTENT_TYPE_INVALID";return row;
  }
  if(Number(response.headers.get("content-length")||0)>MAX_BODY_BYTES||!response.body) {
    row.reason="SOURCE_BODY_UNAVAILABLE_OR_OVERSIZE";return row;
  }
  const reader=response.body.getReader();
  const chunks=[];let size=0;
  try {
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>MAX_BODY_BYTES){row.reason="SOURCE_BODY_UNAVAILABLE_OR_OVERSIZE";return row;}
      chunks.push(Buffer.from(value));
    }
  }catch{row.reason="SOURCE_BODY_READ_FAILURE";return row;}
  finally{reader.releaseLock();}
  let body;
  try{body=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));}
  catch{row.reason="SOURCE_ENCODING_INVALID";return row;}
  let valid=false,counts=null;
  if(source.media==="rss"){
    counts=rssDateCounts(body,now,source.topic??null);
    valid=counts!==null;
  }else{
    try{valid=jsonShape(JSON.parse(body));}catch{valid=false;}
  }
  if(!valid){row.reason="SOURCE_SHAPE_UNVERIFIED";return row;}
  row.publisher_reachable=true;
  row.format_valid=true;
  row.official_locale_fallback_used=row.official_locale_fallback_attempted;
  row.reason="PRIVATE_SOURCE_TRANSPORT_ONLY";
  if(counts){
    row.source_native_release_items=counts.native_dated;
    row.source_native_24h_release_items=counts.within_24h;
    if(source.topic)row.topical_private_release_links_24h=counts.topical_within_24h;
  }
  return row;
}

export async function probeExpandedOfficialMesh({fetchImpl=fetch,now=new Date()}={}){
  const entries=[];
  for(const source of EXPANDED_OFFICIAL_SOURCES){
    entries.push(await probeExpandedSource(source,{fetchImpl,now}));
  }
  return {
    schema:"geomacro.expanded-official-source-observation.v1",
    observed_at:now.toISOString(),
    status:entries.every(x=>x.format_valid)?"SOURCE_TRANSPORT_OBSERVED":"SOURCE_TRANSPORT_DEGRADED",
    // All three domains included is NOT global geographical or event coverage.
    domains_observed:SOURCE_DOMAINS,
    globally_current_scored_coverage_verified:false,
    verified_country_count:0,verified_current_event_domains:0,
    commercial_eligible:false,
    source_rights_verified:false,source_family_independence_verified:false,
    supabase_reads:0,supabase_writes:0,d1_writes:0,b2_requests:0,
    payment_performed:false,
    sources:entries,
  };
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=await probeExpandedOfficialMesh();
  mkdirSync("artifacts/expanded-official-source",{recursive:true});
  writeFileSync("artifacts/expanded-official-source/transport.json",
    JSON.stringify(result,null,2)+"\n",{mode:0o600});
  console.log(JSON.stringify(result));
  if(result.status==="SOURCE_TRANSPORT_DEGRADED")process.exitCode=3;
}
