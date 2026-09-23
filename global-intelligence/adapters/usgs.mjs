import {getJson,observation} from "./http.mjs";

const RELEASES={
  MCS_2026:"https://www.usgs.gov/data/mineral-commodity-summaries-2026-data-release",
  YEARBOOK_2024:"https://www.usgs.gov/data/2024-minerals-yearbook-volume-iii-area-reports-international-country-reports-global-production"
};

export async function fetchUsgs(countryIso3,{release="YEARBOOK_2024",commodity=null}={}) {
  const url=RELEASES[release];
  if(!url) throw new Error(`Unknown USGS release: ${release}`);
  const html=await fetch(url).then(async r=>{if(!r.ok)throw new Error(`USGS HTTP ${r.status}`);return r.text();});
  const hasCsvHint=/\.csv|CSV/i.test(html);
  const hasCountry=countryIso3 ? new RegExp(countryIso3,"i").test(html) : false;
  const hasCommodity=commodity ? new RegExp(commodity,"i").test(html) : true;
  return [observation({
    sourceId:"usgs_mcs",category:"CRITICAL_MINERALS",countryIso3,
    title:`USGS ${release}${commodity?` ${commodity}`:""}`,
    summary:`USGS governed release discovered: CSV=${hasCsvHint}; country_hint=${hasCountry}; commodity_hint=${hasCommodity}.`,
    url,confidence:hasCsvHint?0.6:0.35
  })];
}
