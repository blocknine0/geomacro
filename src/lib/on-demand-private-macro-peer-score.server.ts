import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
import { createHash } from "node:crypto";
import { buildMacroNormalizationSnapshot } from "./country-risk-v02-normalization";
import { buildCountryMacroRiskComponent } from "./country-risk-v02-macro";
import { getFeatureMethodologyRule } from "./country-risk-v02-feature-methodology";
import type { PrivateOfficialMacroChange } from "./on-demand-global-discovery.server";
import type { PrivateOnDemandMacroRightsProof } from "./on-demand-private-macro-rights.server";
import type { CountryMacroRiskComponent } from "./country-risk-v02-macro-contract";

type Indicator = PrivateOfficialMacroChange["indicator"];
const INDICATOR_METRICS = {
  "FP.CPI.TOTL.ZG": {metric:"inflation_consumer_prices_annual_pct",key:"inflation"},
  "NY.GDP.MKTP.KD.ZG": {metric:"real_gdp_growth_annual_pct",key:"growth"},
} as const;
const MIN_PEERS = 100;
const MAX_RESPONSE_BYTES = 256*1024;
const MAX_COUNTRIES = 400;
const BASE = "https://api.worldbank.org/v2";

export type PrivatePeerMacroResult = {
  status:
    | "NO_CERTIFIED_MACRO_RIGHTS"
    | "INVALID_OFFICIAL_ANNUAL_EVIDENCE"
    | "OFFICIAL_PEERS_UNAVAILABLE"
    | "INSUFFICIENT_SAME_YEAR_PEERS"
    | "TARGET_OFFICIAL_VALUE_MISMATCH"
    | "PARTIAL_PEER_NORMALIZED_MACRO_SCORE_NOT_SIGNED";
  peer_normalized_dimension_count: number;
  coverage_ratio: number | null;
  // Private only: never include this object in a public API or x402 quote.
  private_component: CountryMacroRiskComponent | null;
  commercially_signed: false;
  payment_eligible: false;
};

function result(
  status:PrivatePeerMacroResult["status"],
  component:CountryMacroRiskComponent|null=null,
):PrivatePeerMacroResult {
  return {
    status,peer_normalized_dimension_count:component?.available_dimension_count??0,
    coverage_ratio:component?.coverage_ratio??null,private_component:component,
    commercially_signed:false,payment_eligible:false,
  };
}

async function getOfficialJson(
  url:string, fetchImpl:typeof fetch,
):Promise<unknown> {
  const response=await fetchWithoutRedirectUsing(fetchImpl,url,{
    method:"GET",redirect:"error",headers:{Accept:"application/json"},
    signal:AbortSignal.timeout(8_000),
  });
  if(!response.ok || !(response.headers.get("content-type")??"").toLowerCase().includes("json"))
    throw Error("OFFICIAL_WDI_HTTP_OR_CONTENT_TYPE");
  const declared=Number(response.headers.get("content-length")??0);
  if(!Number.isFinite(declared) || declared>MAX_RESPONSE_BYTES)throw Error("OFFICIAL_WDI_BODY_TOO_LARGE");
  const reader=response.body?.getReader();
  if(!reader)throw Error("OFFICIAL_WDI_EMPTY_BODY");
  let used=0;
  const chunks:Uint8Array[]=[];
  try {
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      used+=value.byteLength;
      if(used>MAX_RESPONSE_BYTES)throw Error("OFFICIAL_WDI_BODY_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(()=>{});
  }
  const bytes=new Uint8Array(used);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
function rowsOf(payload:unknown):{rows:unknown[];total:number}|null {
  if(!Array.isArray(payload)||payload.length!==2 ||
     !payload[0]||typeof payload[0]!=="object"||
     !Array.isArray(payload[1]))return null;
  const head=payload[0] as Record<string,unknown>;
  if(head.page!==1 || !Number.isInteger(head.total) ||
     (head.total as number)>MAX_COUNTRIES ||
     (head.total as number)!==payload[1].length)return null;
  return {rows:payload[1],total:head.total as number};
}
function activeCountries(records:unknown[]):Set<string>|null {
  const ids=new Set<string>();
  for(const r of records){
    if(!r||typeof r!=="object")return null;
    const row=r as {id?:unknown;region?:{id?:unknown;value?:unknown}};
    if(typeof row.id!=="string" || !/^[A-Z]{3}$/.test(row.id))continue;
    if(row.region?.id==="NA" || row.region?.value==="Aggregates")continue;
    if(typeof row.region?.id!=="string"||!row.region.id.trim())continue;
    if(ids.has(row.id))return null;
    ids.add(row.id);
  }
  return ids.size>=MIN_PEERS?ids:null;
}
function peerObservations(
  records:unknown[],countries:Set<string>,indicator:Indicator,year:number,
):Map<string,number>|null {
  const data=new Map<string,number>();
  for(const r of records){
    if(!r||typeof r!=="object")return null;
    const x=r as {
      countryiso3code?:unknown;date?:unknown;value?:unknown;
      indicator?:{id?:unknown};
    };
    if(typeof x.countryiso3code!=="string"||!countries.has(x.countryiso3code))continue;
    if(x.date!==String(year)||x.indicator?.id!==indicator ||
       typeof x.value!=="number"||!Number.isFinite(x.value) ||
       Math.abs(x.value)>10000)continue;
    // Never silently select one of duplicate conflicting/duplicated
    // observations, which would make peer ranks order-dependent.
    if(data.has(x.countryiso3code))return null;
    data.set(x.countryiso3code,x.value);
  }
  return data;
}

/**
 * Optional strictly bounded (at most 3 extra GETs) live peer normalization.
 * Uses the existing versioned Geomacro macro methodology. No database/model
 * or invented fresh event. Annual period end is NOT publisher release time.
 *
 * This is a PRIVATE partial macro component and is never signed or charged.
 * The caller must first obtain a certified derived-use rights receipt;
 * unit tests can inject a synthetic rights proof but it is not a licence.
 */
export async function scorePrivateOnDemandMacroPeers(
  changes:readonly PrivateOfficialMacroChange[],
  rights:PrivateOnDemandMacroRightsProof,
  options:{fetchImpl?:typeof fetch;now?:Date}={},
):Promise<PrivatePeerMacroResult>{
  if(rights.status!=="DERIVED_SOURCE_RIGHTS_VERIFIED_NOT_A_PAID_PRODUCT" ||
     rights.rights_verified_driver_count!==changes.length ||
     changes.length===0 || rights.payment_eligible!==false ||
     rights.signed_intelligence_verified!==false)
    return result("NO_CERTIFIED_MACRO_RIGHTS");
  const now=options.now??new Date();
  if(!Number.isFinite(now.getTime())||changes.length>2)return result("INVALID_OFFICIAL_ANNUAL_EVIDENCE");
  const subject=changes[0].country_iso3;
  const seen=new Set<Indicator>();
  for(const ch of changes){
    if(!/^[A-Z]{3}$/.test(ch.country_iso3)||ch.country_iso3!==subject||
       !Object.prototype.hasOwnProperty.call(INDICATOR_METRICS,ch.indicator)||
       seen.has(ch.indicator)||ch.latest_observation_year>now.getUTCFullYear()||
       ch.latest_observation_year<1961 ||
       ch.latest_observation_year>=now.getUTCFullYear() ||
       ch.previous_observation_year!==ch.latest_observation_year-1 ||
       !Number.isFinite(ch.latest_annual_pct) || !Number.isFinite(ch.previous_annual_pct) ||
       Math.abs(ch.latest_annual_pct)>10000 ||
       ch.annual_rate_change_percentage_points!==
         Math.round((ch.latest_annual_pct-ch.previous_annual_pct)*1e5)/1e5 ||
       !/^[a-f0-9]{64}$/.test(ch.source_observation_sha256) ||
       ch.source_observation_sha256!==createHash("sha256").update(JSON.stringify([
         ch.country_iso3,ch.indicator,ch.latest_observation_year,
         ch.latest_annual_pct,ch.previous_observation_year,ch.previous_annual_pct,
       ])).digest("hex") ||
       ch.derived_commercial_rights_verified!==false||
       ch.risk_score_verified!==false||ch.paid_delivery_allowed!==false||
       ch.observation_type!=="ANNUAL_STRUCTURAL_NOT_CURRENT_NEWS")
      return result("INVALID_OFFICIAL_ANNUAL_EVIDENCE");
    seen.add(ch.indicator);
  }
  // Verify against original World Bank country registry to exclude aggregates.
  const fetchImpl=options.fetchImpl??fetch;
  let countryData:unknown;
  try {
    countryData=await getOfficialJson(BASE+"/country?format=json&per_page=400",fetchImpl);
  }catch{return result("OFFICIAL_PEERS_UNAVAILABLE");}
  const validCountryRows=rowsOf(countryData);
  const countries=validCountryRows&&activeCountries(validCountryRows.rows);
  if(!countries||!countries.has(subject))return result("INSUFFICIENT_SAME_YEAR_PEERS");
  // At most two concurrent fixed issuer calls; every response is bounded and
  // requires the *same annual year* as its country-specific source evidence.
  const records=await Promise.all(changes.map(async ch=>{
    try{
      const path=BASE+"/country/all/indicator/"+encodeURIComponent(ch.indicator)+
        "?format=json&per_page=400&date="+ch.latest_observation_year;
      return rowsOf(await getOfficialJson(path,fetchImpl));
    }catch{return null;}
  }));
  if(records.some(x=>x===null))return result("OFFICIAL_PEERS_UNAVAILABLE");
  const snapshots:Record<string,ReturnType<typeof buildMacroNormalizationSnapshot>>={};
  for(let i=0;i<changes.length;i++){
    const ch=changes[i];const found=peerObservations(
      records[i]!.rows,countries,ch.indicator,ch.latest_observation_year);
    if(!found||found.size<MIN_PEERS)return result("INSUFFICIENT_SAME_YEAR_PEERS");
    const actual=found.get(subject);
    if(actual===undefined || Math.abs(actual-ch.latest_annual_pct)>1e-8)
      return result("TARGET_OFFICIAL_VALUE_MISMATCH");
    const meta=INDICATOR_METRICS[ch.indicator];
    const rule=getFeatureMethodologyRule("MACRO",meta.metric);
    if(rule.mode!=="SCORE_READY"||rule.direction==="NON_DIRECTIONAL")
      return result("INVALID_OFFICIAL_ANNUAL_EVIDENCE");
    const periodEnd=`${ch.latest_observation_year}-12-31T00:00:00.000Z`;
    const age=(now.getTime()-Date.parse(periodEnd))/86400000;
    const freshness=age<=400?"CURRENT":age<=800?"AGING":"STALE";
    const snapshot=buildMacroNormalizationSnapshot({
      metric:meta.metric,direction:rule.direction,as_of:now.toISOString(),
      observations:[...found].map(([country_iso3,value_numeric])=>({
        country_iso3,metric:meta.metric,value_numeric,
        unit:"annual_pct",observed_at:periodEnd,freshness_status:freshness,
      })),
    });
    snapshots[meta.key]=snapshot;
  }
  const component=buildCountryMacroRiskComponent({
    country_iso3:subject,as_of:now.toISOString(),snapshots,
  });
  // Pilot macro requires minimum 100 peers per included dimension; absent
  // labour/debt coverage cannot be laundered into a complete country score.
  if(component.available_dimension_count!==changes.length ||
     component.coverage_ratio>0.5 || component.weighted_observed_risk===null)
    return result("INSUFFICIENT_SAME_YEAR_PEERS");
  return result("PARTIAL_PEER_NORMALIZED_MACRO_SCORE_NOT_SIGNED",component);
}
