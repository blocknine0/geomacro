import test from "node:test";
import assert from "node:assert/strict";
import {buildCountrySourceGapReport,buildApprovedRegistryUpserts,buildHealthyApprovedSourceManifest,classifyCandidateRights,
 rolesForCategory} from "../lib/country-source-gap-finder.mjs";
import {parseJsonFeed} from "../ops/discover-missing-country-sources.mjs";

const countries=Array.from({length:195},(_,i)=>({iso3:i===0?"AAA":
 "A"+String.fromCharCode(65+Math.floor(i/26),65+i%26),name:"country-"+i}));
const now=Date.parse("2026-11-17T12:00:00.000Z");
const approved={source_id:"aaa_macro_source",publisher_root_domain:"stats.example.gov",
 parent_media_entity:"aaa_statistics_office",source_role:"OFFICIAL_STATISTICS",
 categories:["MACRO_FX"],status:"APPROVED",
 rights_evidence:{licence_url:"https://example.gov/license",terms_url:"https://example.gov/terms",
  reviewed_at:"2026-11-16T00:00:00.000Z",reviewer:"reviewed",notes:"Explicit open license review."},
 rights_expire_at:"2027-11-16"};
const source={source_id:"aaa_macro_source",publisher_country_iso3:"AAA",
 categories:["macro"],format:"atom",url:"https://stats.example.gov/feed"};
const probe={source_id:source.source_id,status:"WORKING",http_status:200,
 last_successful_http_fetch_at:"2026-11-17T11:00:00.000Z",
 last_source_native_publication_at:"2026-11-17T10:00:00.000Z"};

test("category policy preserves exact Risk Gate role pairs",()=>{
 assert.deepEqual(rolesForCategory("GEOPOLITICS"),["GOVERNMENT_WIRE","INDEPENDENT_REGIONAL"]);
 assert.deepEqual(rolesForCategory("MACRO_FX"),["OFFICIAL_STATISTICS","MARKET_PRICE"]);
 assert.deepEqual(rolesForCategory("CRITICAL_MINERALS"),["TRADE_CUSTOMS","INDEPENDENT_INDUSTRY"]);
});

test("HTTP probe or D1 approval cannot grant commercial rights without exact reviewed manifest entry",()=>{
 const candidate={...source,category:"MACRO_FX"};
 assert.deepEqual(classifyCandidateRights(candidate,[],now),{
  commercial_rights_approved:0,lane:"PRIVATE_OSINT_REDACTED_CORROBORATION",
  raw_source_redacted:true,licensed_source_text_included:false,
  rights_status:"RIGHTS_NOT_EXACTLY_APPROVED"});
 assert.equal(classifyCandidateRights(candidate,[{...approved,status:"PENDING"}],now)
  .commercial_rights_approved,0);
 assert.equal(classifyCandidateRights(candidate,[{...approved,rights_evidence:{...approved.rights_evidence,
  licence_url:"http://example.gov/license"}}],now).commercial_rights_approved,0);
 assert.equal(classifyCandidateRights(candidate,[approved],now).commercial_rights_approved,1);
});

test("gap finder marks missing health and non-approved sources as gaps across all 585 cells",()=>{
 const report=buildCountrySourceGapReport({countries,hot50:["AAA"],sourceCatalog:[source],
  riskStreamSources:[{source_id:source.source_id,enabled:1,commercial_rights_approved:1}],
  probes:[],rightsEntries:[approved],now});
 assert.equal(report.cell_count,585);
 assert.equal(report.gap_count,585);
 assert.equal(report.hot50_gap_count,3);
 const macro=report.cells.find(x=>x.country_iso3==="AAA"&&x.category==="MACRO_FX");
 assert.ok(macro.gap_reasons.includes("LIVE_HEALTH_UNVERIFIED_OR_STALE"));
 assert.equal(macro.candidate_sources[0].commercial_rights_approved,1);
 const other=report.cells.find(x=>x.country_iso3==="AAB"&&x.category==="GEOPOLITICS");
 assert.ok(other.gap_reasons.includes("NO_COUNTRY_SPECIFIC_CATALOG_CANDIDATE"));
});

test("only exact active rights-manifest role pairs satisfy healthy country coverage",()=>{
 const marketSource={...source,source_id:"aaa_market_source"};
 const marketApproved={...approved,source_id:marketSource.source_id,
  publisher_root_domain:"prices.example.gov",parent_media_entity:"aaa_market_office",
  source_role:"MARKET_PRICE"};
 const marketProbe={...probe,source_id:marketSource.source_id};
 const rows=[approved,marketApproved].map(entry=>({source_id:entry.source_id,enabled:1,
  commercial_rights_approved:1,publisher_root_domain:entry.publisher_root_domain,
  parent_media_entity:entry.parent_media_entity,source_role:entry.source_role,
  reviewed_at:entry.rights_evidence.reviewed_at,rights_expire_at:entry.rights_expire_at}));
 const report=buildCountrySourceGapReport({countries,hot50:["AAA"],sourceCatalog:[source,marketSource],
  riskStreamSources:rows,probes:[probe,marketProbe],rightsEntries:[approved,marketApproved],now});
 assert.equal(report.gap_count,584);
 assert.equal(report.cells.some(x=>x.country_iso3==="AAA"&&x.category==="MACRO_FX"),false);
});

test("registry SQL contains only approved, current rights entries",()=>{
 const pending={...approved,status:"PENDING",source_id:"pending_source",rights_expire_at:null,
  rights_evidence:{licence_url:null,terms_url:null,reviewed_at:null,reviewer:null,
   notes:"Awaiting explicit rights review."}};
 const manifest={schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries:[approved,pending]};
 const sql=buildApprovedRegistryUpserts(manifest,now);
 assert.equal(sql.length,1);
 assert.match(sql[0],/commercial_rights_approved,enabled/);
 assert.match(sql[0],/VALUES \('aaa_macro_source'.*,1,1,/);
 assert.doesNotMatch(sql[0],/pending_source/);
});

test("JSON Feed candidates require a native timestamp with an explicit timezone",()=>{
 const parsed=parseJsonFeed(JSON.stringify({version:"https://jsonfeed.org/version/1.1",items:[
  {id:"x",date_published:"2026-11-17T11:00:00Z"}]}),new Date(now));
 assert.equal(parsed.ok,true);
 assert.equal(parsed.native_dated_items,1);
 assert.equal(parsed.recent_native_dated_items,1);
 const undated=parseJsonFeed(JSON.stringify({version:"https://jsonfeed.org/version/1.1",items:[{id:"x",date_published:"2026-11-17T11:00:00"}]}),new Date(now));
 assert.equal(undated.native_dated_items,0);
 const arbitrary=parseJsonFeed(JSON.stringify({items:[{date_published:"2026-11-17T11:00:00Z"}]}),new Date(now));
 assert.equal(arbitrary.ok,false);
});

test("wrong source_role never passes category rights classification",()=>{
 const candidate={...source,category:"MACRO_FX"};
 const wrong={...approved,source_role:"GOVERNMENT_WIRE"};
 assert.equal(classifyCandidateRights(candidate,[wrong],now).commercial_rights_approved,0);
});

test("provider row identity drift keeps a source in the gap report",()=>{
 const report=buildCountrySourceGapReport({countries,hot50:["AAA"],sourceCatalog:[source],
  riskStreamSources:[{source_id:source.source_id,enabled:1,commercial_rights_approved:1,
   publisher_root_domain:"different.example",parent_media_entity:approved.parent_media_entity,
   source_role:approved.source_role,reviewed_at:approved.rights_evidence.reviewed_at,
   rights_expire_at:approved.rights_expire_at}],
  probes:[probe],rightsEntries:[approved],now});
 const cell=report.cells.find(x=>x.country_iso3==="AAA"&&x.category==="MACRO_FX");
 assert.ok(cell.gap_reasons.includes("RIGHTS_REGISTRY_IDENTITY_MISMATCH"));
 assert.equal(cell.candidate_sources[0].registry_identity_matches_reviewed_entry,false);
});

test("HTTP 200 without a native publisher timestamp stays a redacted gap",()=>{
 const report=buildCountrySourceGapReport({countries,hot50:["AAA"],sourceCatalog:[source],
  riskStreamSources:[{source_id:source.source_id,enabled:1,commercial_rights_approved:1,
   publisher_root_domain:approved.publisher_root_domain,parent_media_entity:approved.parent_media_entity,
   source_role:approved.source_role,reviewed_at:approved.rights_evidence.reviewed_at,
   rights_expire_at:approved.rights_expire_at}],
  probes:[{...probe,last_source_native_publication_at:null}],rightsEntries:[approved],now});
 const cell=report.cells.find(x=>x.country_iso3==="AAA"&&x.category==="MACRO_FX");
 assert.ok(cell.gap_reasons.includes("LIVE_HEALTH_UNVERIFIED_OR_STALE"));
 assert.equal(cell.candidate_sources[0].raw_source_redacted,true);
 assert.equal(cell.candidate_sources[0].licensed_source_text_included,false);
});

test("scheduled sync accepts only approved country candidates with a fresh live native-clock proof",()=>{
 const report={schema:"geomacro.country-source-gap-report.v1",
  generated_at:new Date(now-1000).toISOString(),cell_count:585,
  cells:[{country_iso3:"AAA",category:"MACRO_FX",candidate_sources:[{
   source_id:source.source_id,country_specific:true,commercial_rights_approved:1,
   lane:"PRIMARY_COMMERCIAL_EVIDENCE",health_status:"HEALTHY",source_role:"OFFICIAL_STATISTICS"}]}],
  probes_this_run:[probe]};
 const selected=buildHealthyApprovedSourceManifest(
  {schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries:[approved]},report,now);
 assert.equal(selected.entries.length,1);
 assert.equal(selected.entries[0].source_id,approved.source_id);
 assert.equal(selected.rights_status_changed,false);
 const stale={...report,generated_at:new Date(now-31*60_000).toISOString()};
 assert.throws(()=>buildHealthyApprovedSourceManifest(
  {schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries:[approved]},stale,now),
  /COUNTRY_SOURCE_GAP_LIVE_HEALTH_REPORT_STALE/u);
});
