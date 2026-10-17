import {describe,expect,it,vi} from "vitest";
import {parseLiveStructuredRequest,liveStructuredData} from "./live-structured-on-demand.server";
import type {readCategoryOpenData} from "./category-open-data.server";
import type {answerOfficialNumeric} from "./ask-official-numeric.server";
import {COUNTRIES_195} from "./canonical-country-registry-195";
import type {answerFromOriginalPlan} from "./ask-on-demand-original.server";
type CategorySnapshot=Awaited<ReturnType<typeof readCategoryOpenData>>;
type NumericAnswer=Awaited<ReturnType<typeof answerOfficialNumeric>>;
const now=()=>new Date("2026-10-17T12:00:00Z");
const signal=(kind:string,period:string,clock:string)=>({
 observation_type:kind,observation_period:period,clock_semantics:clock,
 finding_key:kind+":a1b2c3d4",geomacro_finds:"Independent Geomacro finding.",
 why_it_matters:"May affect operational monitoring.",
 evidence_class:"official_open_data_unscored",independent_same_event_verification:false,score:null,
});
const snapshot=(category:string,findings:unknown[])=>({
 category,checked_at:now().toISOString(),status:"DERIVED_CONTEXT_AVAILABLE",
 findings,source_families_readable:1,source_families_attempted:1,
});
describe("stateless live structured open-data output",()=>{
 it("routes exactly all 585 canonical country/category combinations",()=>{
  for(const country of COUNTRIES_195)for(const category of ["geopolitics","macro-fx","critical-minerals"]){
   expect(parseLiveStructuredRequest({country_iso3:country.iso3,category})).toEqual({
    country_iso3:country.iso3,category,lookback_days:1});
  }
  for(const input of [{country_iso3:"ZZZ",category:"macro-fx"},
   {country_iso3:"IND",category:"macro-fx",lookback_days:0},
   {country_iso3:"IND",category:"macro-fx",lookback_days:8},
   {country_iso3:"IND",category:"macro-fx",lookback_days:1.5},
   {country_iso3:"IND",category:"macro-fx",url:"https://arbitrary.example"}])
   expect(parseLiveStructuredRequest(input)).toBeNull();
 });
 it("accepts one fixed category or bounded question",()=>{
  expect(parseLiveStructuredRequest({category:"macro-fx"})).toEqual({category:"macro-fx"});
  for(const invalid of [{category:"macro-fx",question:"some question"},
   {category:"all"},{question:"a"},{category:"macro-fx",pay:true},null,[],{question:"<script>"}])
   expect(parseLiveStructuredRequest(invalid)).toBeNull();
 });
 it("filters uncertain source rights; never signs, bills or stores",async()=>{
  const reader=vi.fn(async()=>snapshot("critical-minerals",[
   signal("bgs_world_mineral_statistics_period","2025","reference_year"),
   signal("usgs_mcs_dataset_catalog","2026","dataset_edition"),
   signal("critical_minerals_federal_award","2026-10-14","award_obligation_day"),
  ]) as CategorySnapshot);
  const out=await liveStructuredData({category:"critical-minerals"},{now,categoryReader:reader});
  expect(out.statusCode).toBe(200);
  const body=out.body as any;
  expect(body.observations).toHaveLength(1);
  expect(body.observations[0].kind).toBe("usgs_mcs_dataset_catalog");
  expect(body.observations[0].original_event_time_verified).toBe(false);
  expect(body.signed_gro_required).toBe(false);
  expect(body.chargeable).toBe(false);
  expect(body.durable_storage_written).toBe(false);
  expect(JSON.stringify(body)).not.toContain("bgs_world_mineral");
 });
 it("never equates historical source period with fetch time",async()=>{
  const reader=async()=>snapshot("macro-fx",[
    signal("annual_gdp_reference_period","2024","reference_year"),
  ]) as CategorySnapshot;
  const out=await liveStructuredData({category:"macro-fx"},{now,categoryReader:reader});
  expect(out.statusCode).toBe(200);
  expect((out.body as any).observations[0].original_event_time_verified).toBe(false);
  expect((out.body as any).observations[0].clock_semantics).toBe("reference_year");
 });
 it("returns no-charge 422 if all source types lack reviewed use rights",async()=>{
  const reader=async()=>snapshot("critical-minerals",[
    signal("bgs_world_mineral_statistics_period","2025","reference_year"),
  ]) as CategorySnapshot;
  const out=await liveStructuredData({category:"critical-minerals"},{now,categoryReader:reader});
  expect(out.statusCode).toBe(422);
  expect((out.body as any).observations).toEqual([]);
  expect((out.body as any).chargeable).toBe(false);
 });
 it("official numeric pathway does not sign, bill or persist observations",async()=>{
  const answer={
   summary:"India annual GDP growth is 6.2% for 2025.",
   what_changed:"Compared with 2024 the annual rate changed 0.1 points.",
   why_it_matters:"Annual only",geomacro_view:"WDI.",
   evidence:[{eventId:"live:official:numeric",title:"Official period 2025",relevance:100}],
   insufficient_evidence:false,durable_live_storage_write:false,
  } as NumericAnswer;
  const numeric=vi.fn(async()=>answer);
  const out=await liveStructuredData({question:"What is the latest annual GDP growth for India?"},{now,numericReader:numeric});
  expect(out.statusCode).toBe(200);
  const body=out.body as any;
  expect(body.clock_semantics).toBe("reference_year");
  expect(body.observation_period).toBe("2025");
  expect(body.country_iso3).toBe("IND");
  expect(body.signature).toBeNull();
  expect(body.payment_required).toBe(false);
 });
 it("cannot launder unsourced current news into chargeable output",async()=>{
  const out=await liveStructuredData({question:"Latest sanctions in China today"},{now});
  expect(out.statusCode).toBe(422);
  expect((out.body as any).reason).toBe("QUERY_NOT_SUPPORTED_BY_REVIEWED_NUMERIC_SOURCES");
 });
 it("returns own structured country observations immediately without serializing private evidence",async()=>{
  const original=vi.fn(async()=>({
   summary:"Geomacro observes a country-matched monetary-policy release.",
   what_changed:"An official monetary-policy announcement was published.",
   why_it_matters:"Financing conditions merit monitoring; no direction inferred.",
   insufficient_evidence:false,source_identity_exposed:false,durable_live_storage_write:false,
   signed_gro_generated:false,latest_original_published_at:"2026-10-17T11:58:00.000Z",
   evidence:[{title:"PRIVATE RAW TITLE",eventId:"PRIVATE SOURCE ID"}],
  })) as unknown as typeof answerFromOriginalPlan;
  const out=await liveStructuredData({country_iso3:"USA",category:"macro-fx"},
    {now,originalReader:original});
  expect(out.statusCode).toBe(200);
  expect((out.body as any).source_mode).toBe("DIRECT_ORIGINAL_PUBLISHERS");
  expect((out.body as any).clock_semantics).toBe("original_publication");
  expect((out.body as any).chargeable).toBe(false);
  expect((out.body as any).source_commercial_rights_verified).toBe(false);
  expect(JSON.stringify(out.body)).not.toContain("PRIVATE");
  expect(original).toHaveBeenCalledWith(expect.objectContaining({country_iso3:"USA",
   categories:["macro"],topics:["macro_risk","sovereign_risk","fx_external_risk"],
   max_age_seconds:86400}),{now:now(),websiteDelay:false});
 });
 it.each([null,"2026-10-15T00:00:00.000Z","2026-10-18T00:00:00.000Z"])(
  "never substitutes fetch time for missing, stale or future original %s",async(stamp)=>{
   const reader=vi.fn(async()=>stamp?({insufficient_evidence:false,source_identity_exposed:false,
    durable_live_storage_write:false,signed_gro_generated:false,latest_original_published_at:stamp}):null
   ) as unknown as typeof answerFromOriginalPlan;
   const out=await liveStructuredData({country_iso3:"IND",category:"critical-minerals"},
    {now,originalReader:reader});
   expect(out.statusCode).toBe(422);
   expect((out.body as any).observations).toEqual([]);
  });
});
