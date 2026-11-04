/**
 * Stable ordering of fetch attempts only. Every registered endpoint is still
 * attempted once and original indexes, quotas, timeouts, dedupe and D1/B2
 * admission remain unchanged. An earlier fetch is not verification.
 */
import {HOT50_COUNTRY_SET} from "./hot-50-country-watch.mjs";
const priority=s=>{
 if(s?.private_hot50_original_candidate===true)return 0;
 if(HOT50_COUNTRY_SET.has(s?.publisher_country_iso3)&&
    s?.private_discovery_index_only!==true)return 1;
 if(s?.scope==="national_primary"&&s?.private_discovery_index_only!==true)return 2;
 if(s?.private_discovery_index_only!==true)return 3;
 if(HOT50_COUNTRY_SET.has(s?.discovery_country_iso3))return 4;
 return 5;
};
export function orderHot50PrivateFetchJobs(pending){
 if(!Array.isArray(pending)||pending.length>512||
  pending.some(x=>!x||!Number.isSafeInteger(x.index)||x.index<0||
   typeof x.host!=="string"||!x.source||
   typeof x.source.url!=="string"))
  throw Error("HOT50_PRIVATE_FETCH_ORDER_INVALID");
 const ids=new Set();
 for(const x of pending){
  if(ids.has(x.index))throw Error("HOT50_PRIVATE_FETCH_INDEX_DUPLICATED");
  ids.add(x.index);
 }
 return [...pending].sort((a,b)=>priority(a.source)-priority(b.source)||a.index-b.index);
}
