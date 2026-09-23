import {fetchComtrade} from "../adapters/un-comtrade.mjs";
export async function runCriticalMinerals({countryIso3,reporterCode,period="2025"}){
 if(!countryIso3) throw new Error("countryIso3 is required");
 return fetchComtrade(countryIso3,{reporterCode,period});
}