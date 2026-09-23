import {getJson,observation} from "./http.mjs";
export async function fetchEurostat(url,countryIso3) {
  const data=await getJson(url);
  return [observation({sourceId:"eurostat",category:"MACRO",countryIso3,title:"Eurostat dataset response",summary:"Structured Eurostat response.",url,confidence:0.7,raw:data})];
}
