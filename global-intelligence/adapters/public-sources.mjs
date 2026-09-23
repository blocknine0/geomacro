import { getJson } from "./http.mjs";

async function fetchJson(url, options = {}) {
  return getJson(url, options);
}

export const publicSources = {
  ecb: async () => {
    const url = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2025-01-01&endPeriod=2025-01-03&format=csvdata";
    const text = await fetch(url).then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); });
    if (!text.includes("TIME_PERIOD")) throw new Error("ECB response missing TIME_PERIOD");
    return {source_id:"ecb", observations:Math.max(0,text.trim().split("\n").length-1)};
  },
  imf: async () => {
    const data = await fetchJson("https://www.imf.org/external/datamapper/api/v2/NGDP_RPCH/USA");
    const values = data?.values?.NGDP_RPCH?.USA;
    if (!values || typeof values !== "object") throw new Error("IMF DataMapper response missing USA series");
    return {source_id:"imf_sdmx", observations:Object.keys(values).length};
  },
  oecd: async () => {
    const data = await fetchJson("https://sdmx.oecd.org/public/rest/dataflow/all?format=csvfilewithlabels");
    if (!data) throw new Error("OECD dataflow response empty");
    return {source_id:"oecd_sdmx", observations:1};
  },
  bis: async () => {
    const data = await fetchJson("https://stats.bis.org/api/v2/dataflow/all/all/latest?format=csvfile");
    if (!data) throw new Error("BIS dataflow response empty");
    return {source_id:"bis_statistics", observations:1};
  },
  eurostat: async () => {
    const data = await fetchJson("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/namq_10_gdp?geo=DE&na_item=B1GQ&unit=CLV10_EUR_HAB&sinceTimePeriod=2024");
    if (!data?.id?.length || data.value == null) throw new Error("Eurostat response missing observations");
    return {source_id:"eurostat", observations:Array.isArray(data.value) ? data.value.length : Object.keys(data.value).length};
  },
  gdacs: async () => {
    const data = await fetchJson("https://www.gdacs.org/xml/rss.xml");
    if (!data) throw new Error("GDACS response empty");
    return {source_id:"gdacs_global_disasters", observations:1};
  },
  comtrade: async () => {
    const data = await fetchJson("https://comtradeapi.un.org/public/v1/preview/C/A/HS?period=2024&reporterCode=840&cmdCode=TOTAL&flowCode=M&partnerCode=0&partner2Code=0&motCode=0&maxRecords=5");
    const rows = data?.data;
    if (!Array.isArray(rows) || !rows.length) throw new Error("UN Comtrade returned no rows");
    return {source_id:"un_comtrade", observations:rows.length};
  },
  faostat: async () => {
    const data = await fetchJson("https://fenixservices.fao.org/api/faostat/definitions/domain");
    if (!data) throw new Error("FAOSTAT response empty");
    return {source_id:"faostat_global", observations:1};
  },
  ilostat: async () => {
    const data = await fetchJson("https://rplumber.ilo.org/data/indicator/?id=EMP_TEMP_SEX_AGE_NB_A&ref_area=USA&timefrom=2024&timeto=2024");
    if (!data) throw new Error("ILOSTAT response empty");
    return {source_id:"ilostat_global", observations:Array.isArray(data) ? data.length : 1};
  },
  swpc: async () => {
    const data = await fetchJson("https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json");
    if (!Array.isArray(data) || data.length < 2) throw new Error("NOAA SWPC response missing observations");
    return {source_id:"noaa_swpc", observations:data.length-1};
  },
  bgs: async () => {
    const data = await fetchJson("https://ogcapi.bgs.ac.uk/collections/wms_world_minerals_statistics/items?limit=1&f=json");
    if (!data || !Array.isArray(data.features)) throw new Error("BGS response missing features");
    return {source_id:"bgs_world_minerals_statistics", observations:data.features.length};
  }
};

export async function probePublicSource(sourceId) {
  const fn = publicSources[sourceId];
  if (!fn) throw new Error(`Unsupported public source: ${sourceId}`);
  return fn();
}
