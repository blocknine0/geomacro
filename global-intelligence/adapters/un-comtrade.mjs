import {getJson,observation} from "./http.mjs";

const PREVIEW_BASE_URL="https://comtradeapi.un.org/public/v1/preview";
const DATA_BASE_URL="https://comtradeapi.un.org/data/v1/get";
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
    if(!/^\d{4}(?:\d{2})?$/.test(value)) throw new Error(`Invalid Comtrade period ${value}. Use YYYY or YYYYMM.`);
  }
  return out;
}

export async function fetchComtradeReporterCatalog(){
  if(!reporterCatalogPromise){
    reporterCatalogPromise=getJson(REFERENCE_URL,{maxBytes:512*1024,redirect:'error'}).then(data=>{
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


export async function fetchComtrade(countryIso3,{
  reporterCode=null,period="2025",cmdCode="TOTAL",flowCode="X",partnerCode="0",
  // Do not send invented optional zero filters to no-key preview: the
  // publisher documents only reporter/period/flow/commodity/partner for
  // minimal requests. Optional filters are applied only when explicit.
  partner2Code=null,motCode=null,customsCode=null,breakdownMode=null,
  maxRecords=500,includeDesc=null,allowPreview=true,category="CRITICAL_MINERALS"
}={}){
  const key=process.env.UN_COMTRADE_API_KEY || "";
  if(!key && !allowPreview) throw new Error("UN_COMTRADE_API_KEY is required when allowPreview=false.");

  // Do not infer mineral-only evidence from TOTAL or mixed headings.
  if(category==="CRITICAL_MINERALS" && !["260300","260400","260500"].includes(String(cmdCode)))
    throw Error("UN_COMTRADE_MINERAL_SCOPE_UNVERIFIED");
  if(!/^(?:TOTAL|[0-9]{2}|[0-9]{4}|[0-9]{6})$/u.test(String(cmdCode)))
    throw Error("UN_COMTRADE_HS_CODE_INVALID");
  if(normalizePeriods(period).length!==1)throw Error("UN_COMTRADE_SINGLE_PERIOD_REQUIRED");
  if(!Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>500)
    throw Error("UN_COMTRADE_RECORDS_LIMIT_INVALID");
  const reporter=await reporterCodeForIso3(countryIso3,reporterCode);
  const baseUrl=key ? DATA_BASE_URL : PREVIEW_BASE_URL;
  const url=buildUrl({baseUrl,reporterCode:reporter,period,cmdCode,flowCode,partnerCode,partner2Code,motCode,customsCode,breakdownMode,maxRecords,includeDesc,key:key||null});
  const safeUrl=new URL(url);safeUrl.searchParams.delete('subscription-key');
  const data=await getJson(url,{maxBytes:1024*1024,redirect:'error'});
  const rows=Array.isArray(data?.data) ? data.data : [];
  if(rows.some(r=>Number(r?.reporterCode)!==reporter || String(r?.period)!==String(period) || String(r?.cmdCode)!==String(cmdCode) || String(r?.flowCode).toUpperCase()!==String(flowCode).toUpperCase() || String(r?.partnerCode)!==String(partnerCode)))
    throw Error('UN_COMTRADE_ROW_SCOPE_UNVERIFIED');
  const flow=flowLabel(flowCode);
  const iso3=String(countryIso3).toUpperCase();
  const sourceId=category==="MACRO" ? "un_comtrade" : "un_comtrade_minerals";

  return rows.map(r=>{
    const tradeValue=parseNumeric(r.primaryValue ?? r.primary_value ?? r.cifvalue ?? r.fobvalue);
    const netWeight=parseNumeric(r.netWgt ?? r.netweight);
    const rowPeriod=String(r.period ?? period).split(",")[0];
    return observation({
      sourceId,category,countryIso3:iso3,
      publishedAt:null,observedAt:new Date().toISOString(),
      title:`UN Comtrade ${flow} ${r.cmdCode ?? cmdCode}`,
      summary:`${flow} trade value=${tradeValue ?? "null"}${netWeight!==null ? `, net weight=${netWeight}` : ""}`,
      url:safeUrl.toString(),confidence:0.85,
      raw:{
        evidence_type:flow==="EXPORT" ? "TRADE_EXPORT" : "TRADE_IMPORT",
        reporter_code:reporter,reporter_iso3:iso3,period:r.period ?? period,
        cmd_code:r.cmdCode ?? cmdCode,flow_code:r.flowCode ?? flowCode,flow,
        partner_code:r.partnerCode ?? partnerCode,partner2_code:r.partner2Code ?? partner2Code,
        trade_value:tradeValue,net_weight:netWeight,raw:r,
        native_release_at:null,period_is_publication_date:false,
        hs_vintage_verified:false,commercial_rights_verified:false,
        preview_limited:!key
      }
    });
  });
}

export async function fetchComtradeTradeFlows(countryIso3,{
  reporterCode=null,period="2025",cmdCode="TOTAL",partnerCode="0",
  partner2Code=null,motCode=null,customsCode=null,maxRecords=500,
  allowPreview=true,category="CRITICAL_MINERALS"
}={}){
  const [exportsRows,importsRows]=await Promise.all([
    fetchComtrade(countryIso3,{reporterCode,period,cmdCode,flowCode:"X",partnerCode,partner2Code,motCode,customsCode,maxRecords,allowPreview,category}),
    fetchComtrade(countryIso3,{reporterCode,period,cmdCode,flowCode:"M",partnerCode,partner2Code,motCode,customsCode,maxRecords,allowPreview,category})
  ]);
  // A missing/import-only/export-only or multi-row result is not zero trade.
  // Do not silently add partial pages or mixed classifications.
  const aggregate=exportsRows.length===1&&importsRows.length===1&&
    [exportsRows[0],importsRows[0]].every(r=>r.raw?.trade_value!==null&&
      Number.isFinite(r.raw?.trade_value));
  const exportsValue=aggregate?exportsRows[0].raw.trade_value:null;
  const importsValue=aggregate?importsRows[0].raw.trade_value:null;
  const balance=aggregate?exportsValue-importsValue:null;
  const iso3=String(countryIso3).toUpperCase();
  const sourceId=category==="MACRO" ? "un_comtrade" : "un_comtrade_minerals";
  const periods=normalizePeriods(period);
  return {
    source:sourceId,country_iso3:iso3,period:periods.length===1 ? periods[0] : periods,
    cmd_code:String(cmdCode),observations:[...exportsRows,...importsRows],
    trade_balance_complete:aggregate,
    trade_balance:aggregate?observation({
      sourceId,category,countryIso3:iso3,publishedAt:null,observedAt:null,
      title:`UN Comtrade TRADE_BALANCE ${cmdCode}`,
      summary:`exports=${exportsValue}; imports=${importsValue}; balance=${balance}`,
      url:exportsRows[0]?.url || importsRows[0]?.url || null,confidence:0.85,
      raw:{evidence_type:"TRADE_BALANCE",exports_value:exportsValue,imports_value:importsValue,balance,currency:"USD",period:periods,cmd_code:String(cmdCode),partner_code:String(partnerCode),commercial_rights_verified:false,hs_vintage_verified:false}
    }):null
  };
}
