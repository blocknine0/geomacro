import {getJson,observation} from "./http.mjs";
export async function fetchImf(url,countryIso3,category="MACRO") {
  const data=await getJson(url,{headers:process.env.IMF_API_TOKEN?{Authorization:`Bearer ${process.env.IMF_API_TOKEN}`}:{}});
  return [observation({sourceId:"imf_sdmx",category,countryIso3,title:"IMF SDMX response",summary:"Structured IMF dataset response.",url,confidence:0.7,raw:data})];
}
