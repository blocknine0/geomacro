import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCommodityRow} from "../../global-intelligence/adapters/world-bank-commodity-prices.mjs";
import {normalizeUnctadStatObservation} from "../../global-intelligence/adapters/unctadstat.mjs";
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
