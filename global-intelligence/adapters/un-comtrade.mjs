import {getJson,observation} from "./http.mjs";

const PREVIEW_BASE_URL="https://comtradeapi.un.org/public/v1";
const DATA_BASE_URL="https://comtradeapi.un.org/data/v1";
const REFERENCE_URL="https://comtradeapi.un.org/files/v1/app/reference/Reporters.json";

let reporterCatalogPromise=null;

function parseNumeric(value){
  if(value===null || value===undefined || value==="") return null;
  const n=Number(value);
  return Number.isFinite(n) ? n : null;
}

function flowLabel(flowCode){
  const code=String(flowCode).toUpperCase();
  if(code==="X") return "EXPORT";
  if(code==="M") return "IMPORT";
  throw new Error(`Unsupported flowCode ${flowCode}. Use X or M.`);
}

function normalizePeriods(period){
  const values=Array.isArray(period) ? period : String(period ?? "").split(",");
  const out=values.map(v=>String(v).trim()).filter(Boolean);
  if(!out.length) throw new Error("period is required.");
  for(const value of out){
    if(!/^\\d{4}(?:\\d{2})?$/.test(value)) throw new Error(`Invalid Comtrade period ${value}. Use YYYY or YYYYMM.`);
  }
  return out;
}

export async function fetchComtradeReporterCatalog(){
  if(!reporterCatalogPromise){
    reporterCatalogPromise=getJson(REFERENCE_URL).then(data=>{
      const results=Array.isArray(data?.results) ? data.results : [];
      const map={};
      for(const row of results){
        const iso3=String(row.reporterCodeIsoAlpha3 ?? row.ReporterCodeIsoAlpha3 ?? "").trim().toUpperCase();
        const code=Number(row.reporterCode);
        if(!/^[A-Z]{3}$/.test(iso3) || !Number.isInteger(code) || row.isGroup===true) continue;
        if(row.entryExpiredDate) continue;
        if(!map[iso3]) map[iso3]={code,name:row.reporterDesc ?? row.ReporterDesc ?? row.text ?? iso3};
      }
      return map;
    }).catch(error=>{ reporterCatalogPromise=null; throw error; });
  }
  return reporterCatalogPromise;
}

export async function reporterCodeForIso3(countryIso3,explicitCode=null){
  if(explicitCode!==null && explicitCode!==undefined && explicitCode!==""){
    const code=Number(explicitCode);
    if(!Number.isInteger(code) || code<=0) throw new Error("reporterCode must be a positive integer.");
    return code;
  }
  const iso3=String(countryIso3 || "").toUpperCase();
  if(!/^[A-Z]{3}$/.test(iso3)) throw new Error("countryIso3 must be a 3-letter ISO code.");
  const catalog=await fetchComtradeReporterCatalog();
  if(!catalog[iso3]) throw new Error(`UN Comtrade reporterCode is not available for ${iso3} in the official reference catalog.`);
  return catalog[iso3].code;
}

function buildUrl({baseUrl,reporterCode,period,cmdCode,flowCode,partnerCode,partner2Code,motCode,customsCode,breakdownMode,maxRecords,includeDesc,key}){
  const params=new URLSearchParams();
  params.set("reporterCode",String(reporterCode));
  params.set("period",normalizePeriods(period).join(","));
  params.set("cmdCode",String(cmdCode));
  params.set("flowCode",String(flowCode));
  params.set("partnerCode",String(partnerCode));
  if(partner2Code!==undefined && partner2Code!==null) params.set("partner2Code",String(partner2Code));
  if(motCode!==undefined && motCode!==null) params.set("motCode",String(motCode));
  if(customsCode!==undefined && customsCode!==null) params.set("customsCode",String(customsCode));
  if(breakdownMode!==undefined && breakdownMode!==null) params.set("breakdownMode",String(breakdownMode));
  if(maxRecords!==undefined && maxRecords!==null) params.set("maxRecords",String(maxRecords));
  if(includeDesc!==undefined && includeDesc!==null) params.set("includeDesc",String(includeDesc));
  if(key) params.set("subscription-key",key);
  return `${baseUrl}/C/A/HS?${params.toString()}`;
}

function observationDate(period){
  const p=String(period);
  if(/^\\d{6}$/.test(p)) return `${p.slice(0,4)}-${p.slice(4)}-01T00:00:00Z`;
  if(/^\\d{4}$/.test(p)) return `${p}-12-31T00:00:00Z`;
  return null;
}

export async function fetchComtrade(countryIso3,{
  reporterCode=null,period="2025",cmdCode="TOTAL",flowCode="X",partnerCode="0",
  partner2Code="0",motCode="0",customsCode="0",breakdownMode="classic",
  maxRecords=500,includeDesc=true,allowPreview=true,category="CRITICAL_MINERALS"
}={}){
  const key=process.env.UN_COMTRADE_API_KEY || "";
  if(!key && !allowPreview) throw new Error("UN_COMTRADE_API_KEY is required when allowPreview=false.");

  const reporter=await reporterCodeForIso3(countryIso3,reporterCode);
  const baseUrl=key ? DATA_BASE_URL : PREVIEW_BASE_URL;
  const url=buildUrl({baseUrl,reporterCode:reporter,period,cmdCode,flowCode,partnerCode,partner2Code,motCode,customsCode,breakdownMode,maxRecords,includeDesc,key:key||null});
  const data=await getJson(url);
  const rows=Array.isArray(data?.data) ? data.data : [];
  const flow=flowLabel(flowCode);
  const iso3=String(countryIso3).toUpperCase();
  const sourceId=category==="MACRO" ? "un_comtrade" : "un_comtrade_minerals";

  return rows.map(r=>{
    const tradeValue=parseNumeric(r.primaryValue ?? r.primary_value ?? r.cifvalue ?? r.fobvalue);
    const netWeight=parseNumeric(r.netWgt ?? r.netweight);
    const rowPeriod=String(r.period ?? period).split(",")[0];
    return observation({
      sourceId,category,countryIso3:iso3,
      publishedAt:observationDate(rowPeriod),observedAt:observationDate(rowPeriod),
      title:`UN Comtrade ${flow} ${r.cmdCode ?? cmdCode}`,
      summary:`${flow} trade value=${tradeValue ?? "null"}${netWeight!==null ? `, net weight=${netWeight}` : ""}`,
      url,confidence:0.85,
      raw:{
        evidence_type:flow==="EXPORT" ? "TRADE_EXPORT" : "TRADE_IMPORT",
        reporter_code:reporter,reporter_iso3:iso3,period:r.period ?? period,
        cmd_code:r.cmdCode ?? cmdCode,flow_code:r.flowCode ?? flowCode,flow,
        partner_code:r.partnerCode ?? partnerCode,partner2_code:r.partner2Code ?? partner2Code,
        trade_value:tradeValue,net_weight:netWeight,raw:r
      }
    });
  });
}

export async function fetchComtradeTradeFlows(countryIso3,{
  reporterCode=null,period="2025",cmdCode="TOTAL",partnerCode="0",
  partner2Code="0",motCode="0",customsCode="0",maxRecords=500,
  allowPreview=true,category="CRITICAL_MINERALS"
}={}){
  const [exportsRows,importsRows]=await Promise.all([
    fetchComtrade(countryIso3,{reporterCode,period,cmdCode,flowCode:"X",partnerCode,partner2Code,motCode,customsCode,maxRecords,allowPreview,category}),
    fetchComtrade(countryIso3,{reporterCode,period,cmdCode,flowCode:"M",partnerCode,partner2Code,motCode,customsCode,maxRecords,allowPreview,category})
  ]);
  const sum=rows=>rows.reduce((total,row)=>{
    const value=parseNumeric(row.raw?.trade_value);
    return total+(value===null ? 0 : value);
  },0);
  const exportsValue=sum(exportsRows);
  const importsValue=sum(importsRows);
  const balance=exportsValue-importsValue;
  const iso3=String(countryIso3).toUpperCase();
  const sourceId=category==="MACRO" ? "un_comtrade" : "un_comtrade_minerals";
  const periods=normalizePeriods(period);
  return {
    source:sourceId,country_iso3:iso3,period:periods.length===1 ? periods[0] : periods,
    cmd_code:String(cmdCode),observations:[...exportsRows,...importsRows],
    trade_balance:observation({
      sourceId,category,countryIso3:iso3,publishedAt:null,observedAt:null,
      title:`UN Comtrade TRADE_BALANCE ${cmdCode}`,
      summary:`exports=${exportsValue}; imports=${importsValue}; balance=${balance}`,
      url:exportsRows[0]?.url || importsRows[0]?.url || null,confidence:0.85,
      raw:{evidence_type:"TRADE_BALANCE",exports_value:exportsValue,imports_value:importsValue,balance,currency:"USD",period:periods,cmd_code:String(cmdCode),partner_code:String(partnerCode)}
    })
  };
}
