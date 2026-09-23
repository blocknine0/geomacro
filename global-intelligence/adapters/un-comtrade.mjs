import {getJson,observation} from "./http.mjs";
export async function fetchComtrade(countryIso3,{reporterCode,period="2025",cmdCode="TOTAL",flowCode="X",partnerCode="0",partner2Code="0"}={}) {
  const key=process.env.UN_COMTRADE_API_KEY;
  if(!key) throw new Error("UN_COMTRADE_API_KEY is required for the full free-key API path.");
  if(!reporterCode) throw new Error("UN Comtrade requires the numeric reporterCode mapping for this country.");
  const url=`https://comtradeapi.un.org/public/v1/preview/C/A/HS?reporterCode=${encodeURIComponent(reporterCode)}&period=${period}&cmdCode=${cmdCode}&flowCode=${flowCode}&partnerCode=${partnerCode}&partner2Code=${partner2Code}&motCode=0&maxRecords=500&customsCode=0&breakdownMode=classic&includeDesc=true&subscription-key=${encodeURIComponent(key)}`;
  const data=await getJson(url);
  return (data.data ?? []).map(r=>observation({
    sourceId:"un_comtrade",category:"CRITICAL_MINERALS",countryIso3,
    publishedAt:r.period ? `${r.period}-12-31T00:00:00Z` : null,
    title:`UN Comtrade ${r.cmdCode}`,summary:JSON.stringify(r),url,confidence:0.65,raw:r
  }));
}
