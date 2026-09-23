import {getJson, observation} from "./http.mjs";

export function buildOfficialUrl(baseUrl,{path="",query={}}={}) {
  const base=String(baseUrl).replace(/\/$/,"");
  const cleanPath=String(path || "").replace(/^\//,"");
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(query || {})){
    if(value === undefined || value === null || value === "") continue;
    for(const item of (Array.isArray(value) ? value : [value])) params.append(key,item);
  }
  return base + (cleanPath ? "/" + cleanPath : "") + (params.toString() ? "?" + params.toString() : "");
}

function flatten(value,prefix="",out=[]) {
  if(value === null || value === undefined) return out;
  if(Array.isArray(value)){ value.forEach((v,i)=>flatten(v,prefix+"["+i+"]",out)); return out; }
  if(typeof value === "object"){ Object.entries(value).forEach(([k,v])=>flatten(v,prefix ? prefix+"."+k : k,out)); return out; }
  out.push({path:prefix,value});
  return out;
}

export async function fetchOfficialJson({sourceId,countryIso3,category="MACRO",baseUrl,path="",query={},url=null,headers={}}) {
  const target=url || buildOfficialUrl(baseUrl,{path,query});
  const raw=await getJson(target,{headers});
  return flatten(raw).map(row=>observation({
    sourceId,category,countryIso3,title:sourceId+" official observation",
    summary:row.path+"="+String(row.value),url:target,confidence:0.85,
    raw:{path:row.path,value:row.value}
  }));
}

export async function fetchOfficialDataset(config) {
  if(!config?.source_id) throw new Error("source_id is required");
  if(!config?.country_iso3) throw new Error("country_iso3 is required");
  if(!config?.url && !config?.base_url) throw new Error("url or base_url is required");
  return fetchOfficialJson({
    sourceId:config.source_id,countryIso3:config.country_iso3,
    category:config.category || "MACRO",baseUrl:config.base_url,path:config.path,
    query:config.query,url:config.url,headers:config.headers
  });
}
