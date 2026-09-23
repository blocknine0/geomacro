import {getJson,observation} from "./http.mjs";

const BASE_URL = "https://comtradeapi.un.org/public/v1";

const ISO3_TO_REPORTER = Object.freeze({
  USA:842, IND:699, CHN:156, DEU:276, GBR:826, FRA:251, JPN:392,
  KOR:410, CAN:124, AUS:36, BRA:76, RUS:643, ZAF:710, SAU:682,
  ARE:784, IDN:360, VNM:704, MEX:484, TUR:792, ITA:380, ESP:724
});

export function reporterCodeForIso3(countryIso3, explicitCode=null) {
  if (explicitCode !== null && explicitCode !== undefined && explicitCode !== "") {
    const code=Number(explicitCode);
    if (!Number.isInteger(code) || code <= 0) throw new Error("reporterCode must be a positive integer.");
    return code;
  }
  const iso3=String(countryIso3 || "").toUpperCase();
  const code=ISO3_TO_REPORTER[iso3];
  if (!code) throw new Error(
    `No numeric UN Comtrade reporterCode mapping is configured for ${iso3}. ` +
    "Provide reporterCode from the official Comtrade reporter reference table."
  );
  return code;
}

function parseNumeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const n=Number(value);
  return Number.isFinite(n) ? n : null;
}

function flowLabel(flowCode) {
  return String(flowCode).toUpperCase() === "M" ? "IMPORT" : "EXPORT";
}

function makeUrl({
  reporterCode,period,cmdCode,flowCode,partnerCode,partner2Code,
  motCode,customsCode,breakdownMode,maxRecords,includeDesc,key
}) {
  const params=new URLSearchParams({
    reporterCode:String(reporterCode), period:String(period), cmdCode:String(cmdCode),
    flowCode:String(flowCode), partnerCode:String(partnerCode),
    partner2Code:String(partner2Code), motCode:String(motCode),
    customsCode:String(customsCode), breakdownMode:String(breakdownMode),
    maxRecords:String(maxRecords), includeDesc:String(includeDesc)
  });
  if (key) params.set("subscription-key",key);
  return `${BASE_URL}/preview/C/A/HS?${params.toString()}`;
}

export async function fetchComtrade(countryIso3, {
  reporterCode=null, period="2025", cmdCode="TOTAL", flowCode="X",
  partnerCode="0", partner2Code="0", motCode="0", customsCode="0",
  breakdownMode="classic", maxRecords=500, includeDesc=true,
  allowPreview=true
}={}) {
  const key=process.env.UN_COMTRADE_API_KEY || "";
  if (!key && !allowPreview) {
    throw new Error("UN_COMTRADE_API_KEY is required when allowPreview=false.");
  }

  const reporter=reporterCodeForIso3(countryIso3,reporterCode);
  const url=makeUrl({
    reporterCode:reporter,period,cmdCode,flowCode,partnerCode,partner2Code,
    motCode,customsCode,breakdownMode,maxRecords,includeDesc,key
  });
  const data=await getJson(url);
  const rows=Array.isArray(data?.data) ? data.data : [];

  return rows.map(r => {
    const tradeValue=parseNumeric(r.primaryValue ?? r.primary_value ?? r.cifvalue ?? r.fobvalue);
    const netWeight=parseNumeric(r.netWgt ?? r.netweight);
    const flow=flowLabel(flowCode);
    return observation({
      sourceId:"un_comtrade",
      category:"CRITICAL_MINERALS",
      countryIso3:String(countryIso3).toUpperCase(),
      publishedAt:r.period ? `${String(r.period).slice(0,4)}-12-31T00:00:00Z` : null,
      observedAt:r.period ? `${String(r.period).slice(0,4)}-12-31T00:00:00Z` : null,
      title:`UN Comtrade ${flow} ${r.cmdCode ?? cmdCode}`,
      summary:`${flow} trade value=${tradeValue ?? "null"}${netWeight !== null ? `, net weight=${netWeight}` : ""}`,
      url,
      confidence:0.85,
      raw:{
        reporter_code:reporter,
        reporter_iso3:String(countryIso3).toUpperCase(),
        period:r.period ?? period,
        cmd_code:r.cmdCode ?? cmdCode,
        flow_code:r.flowCode ?? flowCode,
        flow,
        partner_code:r.partnerCode ?? partnerCode,
        partner2_code:r.partner2Code ?? partner2Code,
        trade_value:tradeValue,
        net_weight:netWeight,
        raw:r
      }
    });
  });
}

export async function fetchComtradeTradeFlows(countryIso3, {
  reporterCode=null, period="2025", cmdCode="TOTAL", partnerCode="0",
  partner2Code="0", motCode="0", customsCode="0", maxRecords=500,
  allowPreview=true
}={}) {
  const [exportsRows,importsRows]=await Promise.all([
    fetchComtrade(countryIso3,{reporterCode,period,cmdCode,flowCode:"X",partnerCode,partner2Code,motCode,customsCode,maxRecords,allowPreview,category,sourceId}),
    fetchComtrade(countryIso3,{reporterCode,period,cmdCode,flowCode:"M",partnerCode,partner2Code,motCode,customsCode,maxRecords,allowPreview,category,sourceId})
  ]);

  const sum=(rows,key) => rows.reduce((total,row)=>{
    const value=parseNumeric(row.raw?.trade_value);
    return total + (value === null ? 0 : value);
  },0);

  const exportsValue=sum(exportsRows);
  const importsValue=sum(importsRows);
  const balance=exportsValue-importsValue;
  const iso3=String(countryIso3).toUpperCase();

  return {
    source:"un_comtrade",
    country_iso3:iso3,
    period:String(period),
    cmd_code:String(cmdCode),
    observations:[...exportsRows,...importsRows],
    trade_balance:observation({
      sourceId:"un_comtrade",
      category:"CRITICAL_MINERALS",
      countryIso3:iso3,
      publishedAt:`${String(period).slice(0,4)}-12-31T00:00:00Z`,
      observedAt:`${String(period).slice(0,4)}-12-31T00:00:00Z`,
      title:`UN Comtrade TRADE_BALANCE ${cmdCode}`,
      summary:`exports=${exportsValue}; imports=${importsValue}; balance=${balance}`,
      url:exportsRows[0]?.url || importsRows[0]?.url || null,
      confidence:0.85,
      raw:{evidence_type:"TRADE_BALANCE",exports_value:exportsValue,imports_value:importsValue,balance}
    })
  };
}
