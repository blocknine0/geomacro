import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {validateRiskStreamItemLicense} from "../../workers/control-plane/src/risk-stream-item-license-guard.mjs";

const manifest=JSON.parse(readFileSync(new URL("../../config/risk-stream-source-rights-reviewed.v1.json",import.meta.url),"utf8"));
const source=id=>manifest.entries.find(entry=>entry.source_id===id);
function evidence(rights,{marker,itemUrl,licenseId="CC_BY_4.0"}={}){
 return {license_id:licenseId,license_url:rights.rights_evidence.licence_url,
  terms_url:rights.rights_evidence.terms_url,item_url:itemUrl,
  item_license_marker:marker,publisher_owned_content_only:false,
  third_party_exceptions:false,non_commercial:false,restricted_material:false,
  factual_record_only:true,original_text_republished:false};
}

test("GDELT approval admits only its allowlisted factual event/actor schema",()=>{
 const rights=source("gdelt_v2_factual_events"),itemUrl="https://gdeltproject.org/events/123";
 const marker="GDELT factual event metadata only";
 const raw=JSON.stringify({schema:"geomacro.gdelt.factual-event.v1",
  license_notice_url:rights.rights_evidence.licence_url,license_marker:marker,
  global_event_id:"123",sql_date:"20261115",actor1_code:"USA",
  actor2_code:"CHN",event_code:"042",goldstein_scale:-5.0,country_iso3:"USA",
  published_at:"2026-11-15T12:00:00.000Z",source_url:"https://example.com/source"});
 assert.doesNotThrow(()=>validateRiskStreamItemLicense(
  evidence(rights,{marker,itemUrl,licenseId:"GDELT_FACTS_ONLY"}),rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}));
 const withHeadline=JSON.stringify({...JSON.parse(raw),headline:"Copied article headline"});
 assert.throws(()=>validateRiskStreamItemLicense(
  evidence(rights,{marker,itemUrl,licenseId:"GDELT_FACTS_ONLY"}),rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:withHeadline}),
  /RISK_STREAM_ITEM_LICENSE_LICENSE_FAMILY_UNVERIFIED/u);
});

test("ECB approval admits unmodified reference statistics without expressive text",()=>{
 const rights=source("ecb_fx_reference_rates"),itemUrl="https://ecb.europa.eu/stats/fx/2026-11-15";
 const marker="ECB reference statistics, values unmodified";
 const raw=JSON.stringify({schema:"geomacro.ecb.reference-statistic.v1",
  license_notice_url:rights.rights_evidence.licence_url,license_marker:marker,
  series_key:"EXR.D.USD.EUR.SP00.A",observed_at:"2026-11-13",
  published_at:"2026-11-14T15:00:00.000Z",value:1.1623,unit:"USD per EUR",
  reference_currency:"EUR",counter_currency:"USD"});
 assert.doesNotThrow(()=>validateRiskStreamItemLicense(
  evidence(rights,{marker,itemUrl,licenseId:"ECB_REFERENCE_STATISTICS"}),rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}));
 const withText=JSON.stringify({...JSON.parse(raw),summary:"ECB statement text"});
 assert.throws(()=>validateRiskStreamItemLicense(
  evidence(rights,{marker,itemUrl,licenseId:"ECB_REFERENCE_STATISTICS"}),rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:withText}),
  /RISK_STREAM_ITEM_LICENSE_LICENSE_FAMILY_UNVERIFIED/u);
});

test("ReliefWeb item must carry CC-BY evidence and reject third-party exceptions",()=>{
 const rights=source("un_reliefweb_api_ccby"),itemUrl="https://reliefweb.int/report/example/123";
 const marker="CC BY 4.0 publisher-owned factual record";
 const raw=`${marker} ${rights.rights_evidence.licence_url} Verified factual record fields only.`;
 const item=evidence(rights,{marker,itemUrl});
 assert.doesNotThrow(()=>validateRiskStreamItemLicense(item,rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}));
 assert.throws(()=>validateRiskStreamItemLicense({...item,third_party_exceptions:true},rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}),
  /RISK_STREAM_ITEM_LICENSE_EXCEPTION_OR_REPUBLICATION_MARKER/u);
});

test("Bank of Canada OGL admits only structured FX fact records",()=>{
 const rights=source("bank_of_canada_fx_ogl"),itemUrl="https://www.bankofcanada.ca/valet/observations/FXINRCAD";
 const marker="Bank of Canada factual FX observation only";
 const raw=JSON.stringify({schema:"geomacro.boc.fx-rate.v1",
  license_notice_url:rights.rights_evidence.licence_url,license_marker:marker,
  observed_at:"2026-11-20T00:00:00.000Z",published_at:"2026-11-20T12:00:00.000Z",
  country_iso3:"IND",currency:"INR",reference_currency:"CAD",value:60.2345});
 const item=evidence(rights,{marker,itemUrl,licenseId:"BANK_OF_CANADA_OGL"});
 assert.doesNotThrow(()=>validateRiskStreamItemLicense(item,rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}));
 assert.throws(()=>validateRiskStreamItemLicense(item,rights,
  {sourceUrl:itemUrl,sourceDomain:"example.com",rawPayload:raw}),
  /RISK_STREAM_ITEM_LICENSE_ITEM_URL_HOST_MISMATCH/u);
 assert.throws(()=>validateRiskStreamItemLicense(item,rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,
   rawPayload:JSON.stringify({...JSON.parse(raw),article_text:"not allowed"})}),
  /RISK_STREAM_ITEM_LICENSE_LICENSE_FAMILY_UNVERIFIED/u);
});

test("RBA CC BY 4 family accepts factual rate records only",()=>{
 const rights=source("rba_fx_ccby"),itemUrl="https://www.rba.gov.au/statistics/frequency/exchange-rates.html";
 const marker="Reserve Bank of Australia factual FX observation only";
 const raw=JSON.stringify({schema:"geomacro.rba.fx-rate.v1",
  license_notice_url:rights.rights_evidence.licence_url,license_marker:marker,
  observed_at:"2026-11-20T10:00:00.000Z",published_at:"2026-11-20T10:00:00.000Z",
  country_iso3:"USA",currency:"USD",reference_currency:"AUD",value:1.5312});
 const item=evidence(rights,{marker,itemUrl,licenseId:"RBA_CC_BY_4"});
 assert.doesNotThrow(()=>validateRiskStreamItemLicense(item,rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}));
 assert.throws(()=>validateRiskStreamItemLicense({...item,terms_url:"https://www.rba.gov.au/terms/"},
  rights,{sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}),
  /RISK_STREAM_ITEM_LICENSE_REGISTRY_RIGHTS_EVIDENCE_MISMATCH/u);
});

test("UN News terms family admits metadata facts and rejects republished text",()=>{
 const rights=source("un_news_org_rss"),itemUrl="https://news.un.org/en/story/2026/11/1234567";
 const marker="UN News factual metadata only; no article text republished";
 const raw=JSON.stringify({schema:"geomacro.un-news.factual-record.v1",
  license_notice_url:rights.rights_evidence.licence_url,license_marker:marker,
  record_id:"un-news-20261120-1",published_at:"2026-11-20T09:30:00.000Z",
  country_iso3:"IND",category:"GEOPOLITICS",event_type:"sanctions_policy",item_url:itemUrl});
 const item=evidence(rights,{marker,itemUrl,licenseId:"UN_NEWS_TERMS"});
 assert.doesNotThrow(()=>validateRiskStreamItemLicense(item,rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}));
 assert.throws(()=>validateRiskStreamItemLicense({...item,original_text_republished:true},rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,rawPayload:raw}),
  /RISK_STREAM_ITEM_LICENSE_EXCEPTION_OR_REPUBLICATION_MARKER/u);
 assert.throws(()=>validateRiskStreamItemLicense(item,rights,
  {sourceUrl:itemUrl,sourceDomain:rights.publisher_root_domain,
   rawPayload:JSON.stringify({...JSON.parse(raw),headline:"article headline"})}),
  /RISK_STREAM_ITEM_LICENSE_LICENSE_FAMILY_UNVERIFIED/u);
});
