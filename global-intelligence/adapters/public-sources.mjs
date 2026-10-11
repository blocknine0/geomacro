import { getJson } from "./http.mjs";

async function fetchText(url, headers={}) {
  // Daily free-source monitoring must never download unlimited csv/xml pages
  // or remain suspended indefinitely if a third-party provider hangs.
  const res=await fetch(url,{
    headers:{accept:"*/*",...headers},
    signal:AbortSignal.timeout(15000),
  });
  if(!res.ok) throw new Error("PUBLIC_SOURCE_HTTP_"+res.status);
  if(new URL(res.url).protocol!=="https:" ||
     new URL(res.url).hostname!==new URL(url).hostname)
    throw Error("PUBLIC_SOURCE_REDIRECT_UNVERIFIED");
  const maxBytes=2*1024*1024;
  if(Number(res.headers.get("content-length")||0)>maxBytes)
    throw Error("PUBLIC_SOURCE_OVERSIZE");
  if(!res.body)throw Error("PUBLIC_SOURCE_NO_BODY");
  const reader=res.body.getReader(),chunks=[];
  let size=0;
  try {
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>maxBytes)throw Error("PUBLIC_SOURCE_OVERSIZE");
      chunks.push(Buffer.from(value));
    }
  } finally {
    try{await reader.cancel();}catch{}
    reader.releaseLock();
  }
  const body=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks));
  if(!body.trim())throw Error("PUBLIC_SOURCE_EMPTY_BODY");
  return body;
}
async function fetchJson(url, headers={}) { return getJson(url,{headers}); }

export const publicSources={
  ecb:async()=>{const body=await fetchText("https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2025-01-01&endPeriod=2025-01-03&format=csvdata");if(!body.includes("TIME_PERIOD"))throw new Error("ECB response missing TIME_PERIOD");return{source_id:"ecb",observations:Math.max(0,body.trim().split("\n").length-1)};},
  imf:async()=>{
    try{
      const body=await fetchText("https://sdmxcentral.imf.org/ws/public/sdmxapi/rest/dataflow/IMF/all/latest?format=sdmx-3.0");
      if(body.length>=100&&body.includes("Dataflow")) return{source_id:"imf_sdmx",observations:1};
    }catch(primaryError){
      const fallback=await fetchText("https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.RES/WEO/+/DEU.NGDP_RPCH.A?startPeriod=2020&endPeriod=2026&format=jsondata");
      if(fallback.length>100&&fallback.includes("data")) return{source_id:"imf_sdmx",observations:1};
      throw new Error(`IMF public endpoints unavailable: ${primaryError.message}`);
    }
    const fallback=await fetchText("https://www.imf.org/external/datamapper/api/v1/NGDP");
    if(fallback.length>100&&fallback.includes("NGDP")) return{source_id:"imf_sdmx",observations:1};
    throw new Error("IMF public data endpoints unavailable");
  },
  oecd:async()=>{
    // Do NOT download the entire current OECD dataflow registry: its giant
    // XML payload can exceed a free-tier 2 MiB bounded private health check.
    // Query one documented OECD Economic Accounts flow by exact first-party
    // SDMX structure identity; validate real SDMX dataflow, not line count.
    const body=await fetchText(
      "https://sdmx.oecd.org/public/rest/dataflow/OECD.SDD.NAD/DSD_NAAG@DF_NAAG_I/latest?references=none",
      {accept:"application/vnd.sdmx.structure+xml;version=2.1, application/xml;q=0.8"}
    );
    if(!/<(?:[a-z][a-z0-9._-]*:)?Dataflow\\b/iu.test(body))
      throw Error("OECD_SDMX_DATAFLOW_UNVERIFIED");
    return{source_id:"oecd_sdmx",observations:1};
  },
  bis:async()=>{const body=await fetchText("https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.US?format=csvfile");if(!body.includes("TIME_PERIOD")||!body.includes("OBS_VALUE"))throw new Error("BIS policy-rate CSV missing observations");return{source_id:"bis_statistics",observations:Math.max(0,body.trim().split("\n").length-1)};},
  eurostat:async()=>{const data=await fetchJson("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/namq_10_gdp?geo=DE&na_item=B1GQ&unit=CP_MEUR&sinceTimePeriod=2020");if(!data?.id?.length||data.value==null)throw new Error("Eurostat response missing observations");return{source_id:"eurostat",observations:Array.isArray(data.value)?data.value.length:Object.keys(data.value).length};},
  gdacs:async()=>{const data=await fetchJson("https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ&fromdate=2026-01-01&todate=2026-12-31");const collection=data?.features??data?.events??data;if(!collection||(Array.isArray(collection)&&!collection.length))throw new Error("GDACS returned no event collection");return{source_id:"gdacs_global_disasters",observations:Array.isArray(collection)?collection.length:1};},
  comtrade:async()=>{const data=await fetchJson("https://comtradeapi.un.org/public/v1/preview/C/A/HS?flowCode=X&reporterCode=156&period=2023&cmdCode=3304&partnerCode=0&maxRecords=5");const rows=data?.data;if(!Array.isArray(rows)||!rows.length)throw new Error("UN Comtrade returned no rows");return{source_id:"un_comtrade",observations:rows.length};},
  faostat:async()=>{const body=await fetchText("https://nsi-release-ro-statsuite.fao.org/rest/data/FAO,DF_SDG_ALL_INDICATORS,1.0/A.SN_ITK_DEFC..........?startPeriod=2023&dimensionAtObservation=AllDimensions");if(body.length<20)throw new Error("FAOSTAT response too short");return{source_id:"faostat_global",observations:1};},
  ilostat:async()=>{const body=await fetchText("https://rplumber.ilo.org/data/indicator/?id=EMP_TEMP_SEX_AGE_NB_A&ref_area=USA&timefrom=2024&timeto=2024");if(body.length<20)throw new Error("ILOSTAT response too short");return{source_id:"ilostat_global",observations:1};},
  swpc:async()=>{const data=await fetchJson("https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json");if(!data||(Array.isArray(data)&&!data.length))throw new Error("NOAA SWPC response missing data");return{source_id:"noaa_swpc",observations:Array.isArray(data)?data.length:1};},
  bgs:async()=>{const data=await fetchJson("https://ogcapi.bgs.ac.uk/collections/world-mineral-statistics/items?sortby=-year&f=json&limit=1");if(!data||!Array.isArray(data.features))throw new Error("BGS response missing features");return{source_id:"bgs_world_minerals_statistics",observations:data.features.length};},
  sec_edgar:async()=>{const data=await fetchJson("https://data.sec.gov/submissions/CIK0000320193.json",{"User-Agent":"Geomacro Risk Intelligence contact@geomacro.live"});if(!data?.filings?.recent?.form?.length)throw new Error("SEC EDGAR submissions response missing filings");return{source_id:"sec_edgar",observations:data.filings.recent.form.length};},
  copernicus_ems:async()=>{const data=await fetchJson("https://stac.dataspace.copernicus.eu/v1/collections");if(!data)throw new Error("Copernicus ODP response empty");return{source_id:"copernicus_ems",observations:Array.isArray(data.value)?data.value.length:1};}
};

export async function probePublicSource(sourceId){const fn=publicSources[sourceId];if(!fn)throw new Error(`Unsupported public source: ${sourceId}`);return fn();}
