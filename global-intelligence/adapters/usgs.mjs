import {getJson,observation} from "./http.mjs";
export async function fetchUsgs(countryIso3,{commodity="Lithium"}={}) {
  const q=encodeURIComponent(`${commodity} ${countryIso3}`);
  const url=`https://www.usgs.gov/centers/national-minerals-information-center/data`;
  return [observation({
    sourceId:"usgs_mcs",category:"CRITICAL_MINERALS",countryIso3,
    title:`USGS minerals baseline: ${commodity}`,
    summary:`Country-scoped minerals evidence requires the current USGS machine-readable dataset mapping; source page is retained as the governed baseline.`,
    url,confidence:0.2
  })];
}
