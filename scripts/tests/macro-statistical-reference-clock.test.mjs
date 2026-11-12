import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCommodityRow,parseWorldBankPinkSheetReleaseMetadata} from "../../global-intelligence/adapters/world-bank-commodity-prices.mjs";
import {normalizeUnctadStatObservation,parseUnctadPublisherReleaseMetadata,parseUnctadPublisherReleaseCalendarHtml} from "../../global-intelligence/adapters/unctadstat.mjs";
import {parseWorldBankPublisherUpdateMetadata} from "../../global-intelligence/adapters/world-bank.mjs";
const now="2026-10-20T08:00:00.000Z";
test("monthly World Bank Pink Sheet observation never invents a published day",()=>{
 const r=normalizeCommodityRow({commodity:"Copper",period:"2026-08",
   value:9450.25,unit:"USD/mt",retrievedAt:now});
 assert.equal(r.observation_period,"2026-08");
 assert.equal(r.clock_semantics,"reference_month");
 assert.equal(r.published_at,null);
 assert.equal(r.native_publication_time_verified,false);
 assert.equal(r.observed_at,now);
 assert.equal(r.value_numeric,9450.25);
 assert.doesNotMatch(JSON.stringify(r),/2026-08-01T00:00:00/);
});
test("World Bank Pink Sheet release metadata uses the dated publisher release card",()=>{
 const page='<html><head><title>World Bank Commodity Markets</title></head><body>'+
  '<h2>Latest Commodity Prices Published</h2><p>(11/03/2026). The energy price index rose in October.</p>'+
  '<p>Monthly prices: November 2026</p></body></html>';
 const clock=parseWorldBankPinkSheetReleaseMetadata(page);
 assert.equal(clock.publisher_release_date,"2026-11-03");
 assert.equal(clock.published_at,"2026-11-03T00:00:00.000Z");
 assert.equal(clock.clock_source,"WORLD_BANK_COMMODITY_MARKETS_LATEST_RELEASE_CARD");
 const row=normalizeCommodityRow({commodity:"Copper",period:"2026-10",value:9000,
  retrievedAt:now,publisherMetadata:page});
 assert.equal(row.published_at,clock.published_at);
 assert.equal(row.native_publication_time_verified,true);
 assert.throws(()=>parseWorldBankPinkSheetReleaseMetadata(
  '<html><body>World Bank Commodity Markets Monthly prices: 2026-10</body></html>'),
  /WORLD_BANK_PINK_SHEET_RELEASE_LABEL_MISSING/);
});
test("UNCTAD month, year, quarter stay distinct from original publisher clock",()=>{
 for(const [period,clock] of [["2026","reference_year"],["2026-08","reference_month"],["2026-Q3","reference_quarter"]]){
  const r=normalizeUnctadStatObservation({
    dataset:"merchandise trade",series:"Exports",period,
    value:42.5,unit:"USD million",countryIso3:"IND",retrievedAt:now
  });
  assert.equal(r.observation_period,period);
  assert.equal(r.clock_semantics,clock);
  assert.equal(r.native_publication_time_verified,false);
  assert.equal(r.published_at,null);
  assert.equal(r.observed_at,now);
  assert.equal(r.country_iso3,"IND");
  assert.equal(r.value_numeric,42.5);
 }
});
test("bad statistical periods cannot become publication dates",()=>{
 for(const period of ["2026-00","2026-13","2026-08-01","2026-8","2026-Q5","2026/08","2026-12-31"]){
  assert.throws(()=>normalizeUnctadStatObservation({
    dataset:"trade",series:"exports",period,value:42.5
  }),/Invalid UNCTADstat observation/);
  assert.throws(()=>normalizeCommodityRow({
    commodity:"copper",period,value:9450.25
  }),/Invalid World Bank commodity observation/);
 }
});
test("same historical reference does not acquire current publication merely on later retrieval",()=>{
 const a=normalizeUnctadStatObservation({dataset:"trade",series:"exports",period:"2025",
  value:100,retrievedAt:"2026-10-20T07:00:00.000Z"});
 const b=normalizeUnctadStatObservation({dataset:"trade",series:"exports",period:"2025",
  value:100,retrievedAt:"2026-10-21T07:00:00.000Z"});
 assert.equal(a.source_record_id,b.source_record_id);
 assert.equal(a.published_at,b.published_at);
 assert.equal(a.observation_period,b.observation_period);
});
test("UNCTAD release clock accepts publisher metadata and rejects statistical periods",()=>{
 const clock=parseUnctadPublisherReleaseMetadata({metadata:{release_date:"2026-11-05",observation_period:"2026-10"}});
 assert.equal(clock.published_at,"2026-11-05T00:00:00.000Z");
 const apiClock=parseUnctadPublisherReleaseMetadata({report:{lastUpdated:"2026-11-09T09:30:00Z",period:"2026-10"}});
 assert.equal(apiClock.published_at,"2026-11-09T09:30:00.000Z");
 assert.throws(()=>parseUnctadPublisherReleaseMetadata({metadata:{observation_period:"2026-10"}}),/UNCTAD_NATIVE_RELEASE_CLOCK_MISSING/);
 assert.equal(parseUnctadPublisherReleaseMetadata({metadata:{release_date:"2026-11-05"}}).published_at,"2026-11-05T00:00:00.000Z");
});
test("World Bank publisher update date comes from API envelope only",()=>{
 const clock=parseWorldBankPublisherUpdateMetadata([{lastupdated:"2026-11-03"},[{date:"2025"}]]);
 assert.equal(clock.publisher_update_date,"2026-11-03");
 assert.equal(clock.clock_source,"WORLD_BANK_API_ENVELOPE_LASTUPDATED");
 assert.throws(()=>parseWorldBankPublisherUpdateMetadata([{page:1},[{date:"2026"}]]),/WORLD_BANK_NATIVE_UPDATE_DATE_MISSING/);
});

test("UNCTAD release calendar binds the exact release date to the commodity index record",()=>{
 const page='<html><body><h1>UNCTAD Data Hub</h1><h2>November 2026</h2>'+
  '<h3>9 November 2026</h3><p>Commodity prices: UNCTAD Commodity Price Index - Monthly</p>'+
  '<p>Jan 1995 - Sep 2026 Published</p><h3>16 November 2026</h3><p>Other dataset</p></body></html>';
 const clock=parseUnctadPublisherReleaseCalendarHtml(page);
 assert.equal(clock.publisher_release_date,"2026-11-09");
 const normalized=normalizeUnctadStatObservation({dataset:"commodity prices",series:"index",period:"2026-09",
  value:100,retrievedAt:now,publisherMetadata:page});
 assert.equal(normalized.published_at,clock.published_at);
 assert.equal(normalized.native_publication_time_verified,true);
 assert.equal(clock.published_at,"2026-11-09T00:00:00.000Z");
 assert.equal(clock.clock_source,"UNCTAD_OFFICIAL_RELEASE_CALENDAR");
 assert.throws(()=>parseUnctadPublisherReleaseCalendarHtml(
  '<html><body>UNCTAD Data Hub Jan 1995 - Sep 2026 published</body></html>'),
  /UNCTAD_RELEASE_CALENDAR_RECORD_OR_DATE_MISSING/);
});
