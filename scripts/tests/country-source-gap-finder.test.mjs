import test from "node:test";
import assert from "node:assert/strict";
import {buildCountrySourceGapReport,buildApprovedRegistryUpserts,classifyCandidateRights,
 rolesForCategory} from "../lib/country-source-gap-finder.mjs";

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
  rights_status:"RIGHTS_NOT_EXACTLY_APPROVED"});
 assert.equal(classifyCandidateRights(candidate,[{...approved,status:"PENDING"}],now)
  .commercial_rights_approved,0);
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

test("only exact active rights-manifest approvals satisfy healthy country coverage",()=>{
 const report=buildCountrySourceGapReport({countries,hot50:["AAA"],sourceCatalog:[source],
  riskStreamSources:[{source_id:source.source_id,enabled:1,commercial_rights_approved:1}],
  probes:[probe],rightsEntries:[approved],now});
 assert.equal(report.gap_count,584);
 assert.equal(report.cells.some(x=>x.country_iso3==="AAA"&&x.category==="MACRO_FX"),false);
});

test("registry SQL contains only approved, current rights entries",()=>{
 const pending={...approved,status:"PENDING",source_id:"pending_source"};
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
 const undated=parseJsonFeed(JSON.stringify({items:[{id:"x",date_published:"2026-11-17T11:00:00"}]}),new Date(now));
 assert.equal(undated.native_dated_items,0);
});

test("wrong source_role never passes category rights classification",()=>{
 const candidate={...source,category:"MACRO_FX"};
 const wrong={...approved,source_role:"GOVERNMENT_WIRE"};
 assert.equal(classifyCandidateRights(candidate,[wrong],now).commercial_rights_approved,0);
});
