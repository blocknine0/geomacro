import {getJson,observation} from "./http.mjs";

const DEFAULT_RELEASE_URL="https://www.usgs.gov/data/2024-minerals-yearbook-volume-iii-area-reports-international-country-reports-global-production";
const DEFAULT_PRODUCTION_URL=process.env.USGS_2024_MYB_PRODUCTION_URL || "";
const DEFAULT_FACILITIES_URL=process.env.USGS_2024_MYB_FACILITIES_URL || "";

function clean(value){
  return String(value ?? "").trim();
}

function number(value){
  if(value===null || value===undefined || clean(value)==="") return null;
  const normalized=clean(value).replace(/,/g,"").replace(/^\((.*)\)$/,"-$1");
  const n=Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function splitCsvLine(line){
  const out=[]; let current=""; let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch === '"' && line[i + 1] === '"' && quoted){ current += '"'; i++; continue; }
    if(ch==="""){ quoted=!quoted; continue; }
    if(ch==="," && !quoted){ out.push(current); current=""; continue; }
    current+=ch;
  }
  out.push(current);
  return out;
}

function parseCsv(text){
  const lines=String(text).replace(/^\uFEFF/,"").split(/\r?\n/).filter(line=>line.trim()!=="");
  if(!lines.length) return [];
  const headers=splitCsvLine(lines[0]).map(clean);
  return lines.slice(1).map(line=>{
    const cells=splitCsvLine(line);
    const row={};
    headers.forEach((header,index)=>{ row[header]=cells[index] ?? ""; });
    return row;
  });
}

function findKey(row,patterns){
  const keys=Object.keys(row);
  for(const pattern of patterns){
    const key=keys.find(k=>pattern.test(k));
    if(key) return key;
  }
  return null;
}

function normalizeCountry(row,countryIso3=null){
  const key=findKey(row,[/iso.?3/i,/country.?code/i,/country.?name/i,/country/i,/area/i]);
  return {
    iso3:countryIso3 ? String(countryIso3).toUpperCase() : null,
    name:key ? clean(row[key]) : null,
    source_field:key
  };
}

function normalizeProductionRow(row,{countryIso3=null,releaseUrl=DEFAULT_RELEASE_URL}={}){
  const country=normalizeCountry(row,countryIso3);
  const mineralKey=findKey(row,[/commodity/i,/mineral/i,/material/i,/product/i]);
  const unitKey=findKey(row,[/^unit$/i,/units/i,/measure/i]);
  const yearKeys=Object.keys(row).filter(k=>/^\d{4}$/.test(clean(k)));
  const observations=[];
  for(const yearKey of yearKeys){
    const value=number(row[yearKey]);
    if(value===null) continue;
    observations.push(observation({
      sourceId:"usgs_myb_international",
      category:"CRITICAL_MINERALS",
      countryIso3:country.iso3,
      publishedAt:"2026-08-31T00:00:00Z",
      observedAt:`${yearKey}-12-31T00:00:00Z`,
      title:`USGS mineral production: ${clean(row[mineralKey])}`,
      summary:`${clean(row[mineralKey])}: ${value} ${unitKey ? clean(row[unitKey]) : ""}`,
      url:releaseUrl,
      confidence:0.95,
      raw:{
        evidence_type:"PRODUCTION",
        country_name:country.name,
        country_iso3:country.iso3,
        mineral:mineralKey ? clean(row[mineralKey]) : null,
        year:Number(yearKey),
        value,
        unit:unitKey ? clean(row[unitKey]) : null,
        raw:row
      }
    }));
  }
  return observations;
}

export function parseUsGSMineralsYearbookProductionCsv(csvText,options={}){
  return parseCsv(csvText).flatMap(row=>normalizeProductionRow(row,options));
}

export function parseUsGSMineralsYearbookFacilitiesCsv(csvText,{countryIso3=null,releaseUrl=DEFAULT_RELEASE_URL}={}){
  return parseCsv(csvText).map(row=>{
    const country=normalizeCountry(row,countryIso3);
    const mineralKey=findKey(row,[/commodity/i,/mineral/i,/material/i,/product/i]);
    const facilityKey=findKey(row,[/facility/i,/mine/i,/plant/i,/operation/i]);
    const capacityKey=findKey(row,[/capacity/i,/annual.*production/i]);
    return observation({
      sourceId:"usgs_myb_international",
      category:"CRITICAL_MINERALS",
      countryIso3:country.iso3,
      publishedAt:"2026-08-31T00:00:00Z",
      observedAt:null,
      title:`USGS mineral facility: ${clean(row[facilityKey])}`,
      summary:`${clean(row[mineralKey])} facility ${clean(row[facilityKey])}`,
      url:releaseUrl,
      confidence:0.92,
      raw:{
        evidence_type:"FACILITY",
        country_name:country.name,
        country_iso3:country.iso3,
        mineral:mineralKey ? clean(row[mineralKey]) : null,
        facility:facilityKey ? clean(row[facilityKey]) : null,
        capacity:capacityKey ? number(row[capacityKey]) : null,
        capacity_raw:capacityKey ? clean(row[capacityKey]) : null,
        raw:row
      }
    });
  });
}

export async function fetchUsGSMineralsYearbookProduction({
  countryIso3=null, csvUrl=DEFAULT_PRODUCTION_URL
}={}){
  if(!csvUrl) throw new Error("USGS_2024_MYB_PRODUCTION_URL is required for runtime fetch.");
  const text=await (await fetch(csvUrl)).text();
  return parseUsGSMineralsYearbookProductionCsv(text,{countryIso3});
}

export async function fetchUsGSMineralsYearbookFacilities({
  countryIso3=null, csvUrl=DEFAULT_FACILITIES_URL
}={}){
  if(!csvUrl) throw new Error("USGS_2024_MYB_FACILITIES_URL is required for runtime fetch.");
  const text=await (await fetch(csvUrl)).text();
  return parseUsGSMineralsYearbookFacilitiesCsv(text,{countryIso3});
}
