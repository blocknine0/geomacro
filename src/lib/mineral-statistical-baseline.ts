import { country195ByIso3 } from "./canonical-country-registry-195";

/** A separate annual/structural observation. It is NEVER a current news item. */
export type MineralStatisticalObservation = Readonly<{
  source: "USGS_MCS_2026" | "UN_COMTRADE";
  country_iso3: string;
  commodity: string;
  reference_year: number;
  metric: "MINE_PRODUCTION" | "IMPORT_VALUE" | "EXPORT_VALUE";
  value: number;
  unit: string;
  dataset_url: string;
  period_verified: true;
  country_mapping_verified: true;
  commodity_mapping_verified: true;
}>;
const SOURCES={
  USGS_MCS_2026:"https://www.usgs.gov/data/mineral-commodity-summaries-2026-data-release",
  UN_COMTRADE:"https://comtradeapi.un.org/",
} as const;
const UNITS=new Set(["metric_tonnes","tonnes","kilograms","usd","usd_current","thousand_metric_tonnes"]);
const COMMODITIES=new Set(["lithium","cobalt","copper","nickel","graphite","rare_earths","manganese",
  "gallium","germanium","tungsten","bauxite","antimony","vanadium","platinum"]);
function valid(r:MineralStatisticalObservation):boolean{
 if(!r||!country195ByIso3(r.country_iso3)||!COMMODITIES.has(r.commodity)||
    !Number.isSafeInteger(r.reference_year)||r.reference_year<2000||r.reference_year>2026||
    !Number.isFinite(r.value)||r.value<0||!UNITS.has(r.unit)||
    r.period_verified!==true||r.country_mapping_verified!==true||
    r.commodity_mapping_verified!==true||!Object.hasOwn(SOURCES,r.source)||
    r.dataset_url!==SOURCES[r.source]||
    !["MINE_PRODUCTION","IMPORT_VALUE","EXPORT_VALUE"].includes(r.metric))return false;
 // The USGS MCS 2026 CSV world table is NOT proof of every reporter's imports.
 // The UN Comtrade HS trade endpoint is NOT proof of mine production.
 if(r.source==="USGS_MCS_2026"&&(r.metric!=="MINE_PRODUCTION"||!["metric_tonnes","tonnes","kilograms","thousand_metric_tonnes"].includes(r.unit)))return false;
 if(r.source==="UN_COMTRADE"&&(r.metric==="MINE_PRODUCTION"||!["usd","usd_current"].includes(r.unit)))return false;
 return true;
}
/** Use ONLY observed, already parsed official country/commodity/year cells.
 * Never fill gaps with zero, "no mines", import dependence or guessed values. */
export function buildMineralStatisticalFivePart(input:Readonly<{
  country_iso3:string;commodity:string;observations:readonly MineralStatisticalObservation[];
}>) {
 if(!country195ByIso3(input.country_iso3)||!COMMODITIES.has(input.commodity)||
    !Array.isArray(input.observations))return null;
 const rows=input.observations.filter(r=>
   valid(r)&&r.country_iso3===input.country_iso3&&r.commodity===input.commodity)
   .sort((a,b)=>b.reference_year-a.reference_year||a.source.localeCompare(b.source));
 if(rows.length===0)return null;
 const r=rows[0];
 const m=r.metric==="MINE_PRODUCTION"?"mine production":
   r.metric==="IMPORT_VALUE"?"reported imports":"reported exports";
 const title=r.country_iso3+" "+r.commodity+" "+m+
   " in "+r.reference_year+": "+r.value+" "+r.unit;
 return {
   schema:"geomacro.mineral-statistical-five-part.v1" as const,
   status:"OFFICIAL_STATISTICAL_BASELINE_ONLY" as const,
   category:"rare_earth" as const,
   country_iso3:r.country_iso3,commodity:r.commodity,reference_year:r.reference_year,
   news_event_count:0,current_news_verified:false,
   five_part:{
     what_happened:{text:title,kind:"ANNUAL_STATISTICAL_OBSERVATION_NOT_NEWS" as const},
     why_it_matters:{text:"This official historical series provides a dated production or trade reference, not evidence of a current supply disruption.",independent_causality_verified:false as const},
     market_relevance:{status:"POTENTIAL_MINERAL_SUPPLY_CHANNEL_ONLY" as const,
       observed_price_impact_verified:false as const,price_direction:null},
     what_to_watch:{text:"Check the next official country/commodity release and any new dated primary-source event.",next_release_date_verified:false as const},
     evidence_and_confidence:{source:r.source,dataset_url:r.dataset_url,
       country_mapping_verified:true as const,commodity_mapping_verified:true as const,
       reference_year:r.reference_year,unit:r.unit,metric:r.metric,
       current_event_verified:false as const,confidence_tier:"OFFICIAL_ANNUAL_REFERENCE_NOT_NEWS" as const,
       commercial_rights_verified:false as const}
   },
   delivery:{chargeable:false as const,payment_authorized:false as const,signed:false as const,
     execution_authorized:false as const},
 };
}
