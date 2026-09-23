import {fetchComtradeReporterCatalog,fetchComtradeTradeFlows} from "../adapters/un-comtrade.mjs";

const sample=["IND","USA","CHN","DEU","GBR"];
let failures=0;

try{
  const catalog=await fetchComtradeReporterCatalog();
  const missing=sample.filter(iso3=>!catalog[iso3]?.code);
  if(missing.length) throw new Error(`Missing reporter mappings: ${missing.join(",")}`);
  console.log(JSON.stringify({
    check:"official_reporter_catalog",
    status:"PASS",
    sample_codes:Object.fromEntries(sample.map(iso3=>[iso3,catalog[iso3].code]))
  }));
}catch(error){
  failures++;
  console.error(JSON.stringify({check:"official_reporter_catalog",status:"FAIL",error:String(error.message||error)}));
}

const countryIso3=process.env.COMTRADE_PROBE_COUNTRY || "IND";
const period=process.env.COMTRADE_PROBE_PERIOD || "2024";
try{
  const result=await fetchComtradeTradeFlows(countryIso3,{
    period,
    cmdCode:process.env.COMTRADE_PROBE_CMD || "TOTAL",
    category:"MACRO",
    allowPreview:true
  });
  if(!Array.isArray(result.observations)) throw new Error("observations is not an array");
  if(!result.trade_balance?.raw?.evidence_type) throw new Error("trade balance evidence type missing");
  console.log(JSON.stringify({
    check:`trade_flow:${countryIso3}:${period}`,
    status:"PASS",
    observations:result.observations.length,
    evidence_types:[...new Set(result.observations.map(x=>x.raw?.evidence_type))],
    trade_balance:result.trade_balance.raw
  }));
}catch(error){
  failures++;
  console.error(JSON.stringify({
    check:`trade_flow:${countryIso3}:${period}`,
    status:"FAIL",
    error:String(error.message||error),
    auth_mode:process.env.UN_COMTRADE_API_KEY ? "authenticated_data_api" : "public_preview"
  }));
}

console.log(JSON.stringify({
  auth_mode:process.env.UN_COMTRADE_API_KEY ? "authenticated_data_api" : "public_preview",
  production_requirement:process.env.UN_COMTRADE_API_KEY ? "free API key configured" : "UN_COMTRADE_API_KEY required for full free API access"
}));

process.exitCode=failures ? 1 : 0;
