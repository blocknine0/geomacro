import {getJson,observation} from "./http.mjs";
export async function fetchWorldBank(countryIso3,{indicator="NY.GDP.MKTP.CD",mrv=5}={}) {
  const url=`https://api.worldbank.org/v2/country/${countryIso3.toLowerCase()}/indicator/${indicator}?format=json&mrv=${mrv}`;
  const data=await getJson(url);
  const rows=Array.isArray(data) ? (data[1] ?? []) : [];
  return rows.filter(r=>r.value!==null).map(r=>observation({
    sourceId:"world_bank_indicators",category:"MACRO",countryIso3,
    publishedAt:r.date ? `${r.date}-12-31T00:00:00Z` : null,
    title:`${indicator} ${r.date}`,summary:String(r.value),url
  }));
}
