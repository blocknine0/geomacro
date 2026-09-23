import {fetchWorldBank} from "../adapters/world-bank.mjs";
export async function runMacro({countryIso3,indicator="NY.GDP.MKTP.CD"}){
 if(!countryIso3) throw new Error("countryIso3 is required");
 return fetchWorldBank(countryIso3,{indicator});
}