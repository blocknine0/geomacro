import {fetchComtradeTradeFlows} from "../adapters/un-comtrade.mjs";

const countryIso3=process.env.COMTRADE_PROBE_COUNTRY || "IND";
const period=process.env.COMTRADE_PROBE_PERIOD || "2025";
const cmdCode=process.env.COMTRADE_PROBE_CMD || "TOTAL";

try {
  const result=await fetchComtradeTradeFlows(countryIso3,{period,cmdCode});
  const count=result.observations.length;
  if (!count || !result.trade_balance) throw new Error("No normalized trade-flow observations.");
  console.log(JSON.stringify({
    source_id:"un_comtrade",
    country_iso3:countryIso3,
    period,
    cmd_code:cmdCode,
    status:"PASS",
    observations:count,
    trade_balance:result.trade_balance.raw
  }));
} catch (error) {
  console.error(JSON.stringify({
    source_id:"un_comtrade",
    country_iso3:countryIso3,
    period,
    cmd_code:cmdCode,
    status:"FAIL",
    error:String(error.message || error),
    hint:process.env.UN_COMTRADE_API_KEY
      ? "API key was supplied; inspect endpoint/rate-limit response."
      : "No UN_COMTRADE_API_KEY supplied; preview access may be limited. Add the free API key before production certification."
  }));
  process.exitCode=1;
}
