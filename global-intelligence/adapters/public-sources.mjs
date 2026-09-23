import { getJson } from "./http.mjs";

async function fetchText(url) {
  const res = await fetch(url, {headers:{accept:"*/*"}});
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0,300)}`);
  if (!body.trim()) throw new Error("Empty response");
  return body;
}

async function fetchJson(url) { return getJson(url); }

export const publicSources = {
  ecb: async () => {
    const body = await fetchText("https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2025-01-01&endPeriod=2025-01-03&format=csvdata");
    if (!body.includes("TIME_PERIOD")) throw new Error("ECB response missing TIME_PERIOD");
    return {source_id:"ecb", observations:Math.max(0,body.trim().split("\n").length-1)};
  },
  imf: async () => {
    const data = await fetchJson("https://www.imf.org/external/datamapper/api/v2/NGDP_RPCH/USA");
    const values=data?.values?.NGDP_RPCH?.USA;
    if (!values || typeof values!=="object") throw new Error("IMF DataMapper response missing USA series");
    return {source_id:"imf_sdmx",observations:Object.keys(values).length};
  },
  oecd: async () => {
    const body=await fetchText("https://sdmx.oecd.org/public/rest/dataflow/all?format=csvfilewithlabels");
    if (!body.includes("DATAFLOW")) throw new Error("OECD dataflow response missing DATAFLOW");
    return {source_id:"oecd_sdmx",observations:Math.max(1,body.trim().split("\n").length-1)};
  },
  bis: async () => {
    const body=await fetchText("https://stats.bis.org/api/v2/dataflow/all/all/latest?format=csvfile");
    if (body.trim().split("\n").length<2) throw new Error("BIS dataflow response empty");
    return {source_id:"bis_statistics",observations:Math.max(1,body.trim().split("\n").length-1)};
  },
  eurostat: async () => {
    const data=await fetchJson("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/namq_10_gdp?geo=DE&na_item=B1GQ&unit=CLV10_EUR_HAB&sinceTimePeriod=2024");
    if (!data?.id?.length || data.value==null) throw new Error("Eurostat response missing observations");
    return {source_id:"eurostat",observations:Array.isArray(data.value)?data.value.length:Object.keys(data.value).length};
  },
  gdacs: async () => {
    const data=await fetchJson("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ&fromdate=2026-01-01&todate=2026-12-31");
    const collection=data?.features??data?.events??data;
    if (!collection || (Array.isArray(collection)&&!collection.length)) throw new Error("GDACS returned no event collection");
    return {source_id:"gdacs_global_disasters",observations:Array.isArray(collection)?collection.length:1};
  },
  comtrade: async () => {
    const data=await fetchJson("https://comtradeapi.un.org/public/v1/preview/C/A/HS?period=2024&reporterCode=840&cmdCode=TOTAL&flowCode=M&partnerCode=0&partner2Code=0&motCode=0&maxRecords=5");
    const rows=data?.data;
    if (!Array.isArray(rows)||!rows.length) throw new Error("UN Comtrade returned no rows");
    return {source_id:"un_comtrade",observations:rows.length};
  },
  faostat: async () => {
    const body=await fetchText("https://bulks-faostat.fao.org/production/datasets_E.json");
    if (!body.includes("Dataset") && !body.includes("dataset")) throw new Error("FAOSTAT dataset catalogue response invalid");
    return {source_id:"faostat_global",observations:1};
  },
  ilostat: async () => {
    const body=await fetchText("https://rplumber.ilo.org/data/indicator/?id=EMP_TEMP_SEX_AGE_NB_A&ref_area=USA&timefrom=2024&timeto=2024");
    if (!body.includes("ref_area") && !body.includes("OBS_VALUE")) throw new Error("ILOSTAT response missing expected fields");
    return {source_id:"ilostat_global",observations:1};
  },
  swpc: async () => {
    const data=await fetchJson("https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json");
    if (!data || (Array.isArray(data)&&!data.length)) throw new Error("NOAA SWPC response missing data");
    return {source_id:"noaa_swpc",observations:Array.isArray(data)?data.length:1};
  },
  bgs: async () => {
    const data=await fetchJson("https://ogcapi.bgs.ac.uk/collections/wms_world_minerals_statistics/items?limit=1&f=json");
    if (!data||!Array.isArray(data.features)) throw new Error("BGS response missing features");
    return {source_id:"bgs_world_minerals_statistics",observations:data.features.length};
  }
};

export async function probePublicSource(sourceId) {
  const fn=publicSources[sourceId];
  if (!fn) throw new Error(`Unsupported public source: ${sourceId}`);
  return fn();
}
