import {describe,expect,it} from "vitest";
import {buildMineralStatisticalFivePart,type MineralStatisticalObservation} from "./mineral-statistical-baseline";
const usgs:MineralStatisticalObservation={
 source:"USGS_MCS_2026",country_iso3:"CHL",commodity:"copper",reference_year:2025,
 metric:"MINE_PRODUCTION",value:100,unit:"metric_tonnes",
 dataset_url:"https://www.usgs.gov/data/mineral-commodity-summaries-2026-data-release",
 period_verified:true,country_mapping_verified:true,commodity_mapping_verified:true,
};
const comtrade:MineralStatisticalObservation={
 source:"UN_COMTRADE",country_iso3:"CHL",commodity:"copper",reference_year:2024,
 metric:"EXPORT_VALUE",value:900,unit:"usd",
 dataset_url:"https://comtradeapi.un.org/",
 period_verified:true,country_mapping_verified:true,commodity_mapping_verified:true,
};
describe("source-bound statistical mineral fallback without fake daily news",()=>{
 it("produces five-part dated annual data without signing or charging",()=>{
  const r=buildMineralStatisticalFivePart({country_iso3:"CHL",commodity:"copper",observations:[usgs,comtrade]})!;
  expect(r.status).toBe("OFFICIAL_STATISTICAL_BASELINE_ONLY");
  expect(r.news_event_count).toBe(0);
  expect(r.reference_year).toBe(2025);
  expect(r.five_part.what_happened.text).toContain("2025");
  expect(Object.keys(r.five_part).sort()).toEqual([
   "what_happened","why_it_matters","market_relevance","what_to_watch","evidence_and_confidence"].sort());
  expect(r.delivery.chargeable).toBe(false);
  expect(r.five_part.evidence_and_confidence.current_event_verified).toBe(false);
 });
 it("never infers zero production or import reliance from missing country/year",()=>{
  expect(buildMineralStatisticalFivePart({country_iso3:"LUX",commodity:"copper",observations:[usgs]})).toBeNull();
  expect(buildMineralStatisticalFivePart({country_iso3:"CHL",commodity:"lithium",observations:[usgs]})).toBeNull();
  expect(buildMineralStatisticalFivePart({country_iso3:"VAT",commodity:"nickel",observations:[]})).toBeNull();
 });
 it("rejects cross-country, fabricated data sources, unsupported metrics and unverifiable period",()=>{
  const changed=(x:Partial<MineralStatisticalObservation>)=>({...usgs,...x} as MineralStatisticalObservation);
  for(const row of [
   changed({country_iso3:"CAN"}),changed({period_verified:false as true}),
   changed({source:"UN_COMTRADE"}),changed({metric:"IMPORT_VALUE"}),
   changed({value:Number.NaN}),changed({value:-1}),changed({dataset_url:"https://example.com/stats"}),
   changed({reference_year:2029}),
  ])expect(buildMineralStatisticalFivePart({country_iso3:"CHL",commodity:"copper",observations:[row]})).toBeNull();
 });
 it("accepts scoped Comtrade export-value reference without treating it as mine production",()=>{
  const r=buildMineralStatisticalFivePart({country_iso3:"CHL",commodity:"copper",observations:[comtrade]})!;
  expect(r.five_part.what_happened.text).toContain("reported exports");
  expect(r.five_part.evidence_and_confidence.metric).toBe("EXPORT_VALUE");
  expect(r.current_news_verified).toBe(false);
 });
});
