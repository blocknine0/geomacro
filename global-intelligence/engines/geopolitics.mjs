import {searchGdelt} from "../adapters/gdelt.mjs";
export async function runGeopolitics({countryIso2,queryExtra=""}){
 if(!countryIso2) throw new Error("countryIso2 is required");
 return searchGdelt(countryIso2,{queryExtra});
}