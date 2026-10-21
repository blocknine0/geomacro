/**
 * One free per-run issuer-original readback bundle shared by all 3 categories.
 *
 * The 6-request HARD ceiling is deliberately higher than its 4-request
 * normal allowance. The other 2 are RESERVED: never quietly consumed by
 * this optional HTML audit. Each distinct HTTPS origin has an additional
 * safety cap, preventing one noisy/rate-limited publisher from draining the
 * bundle. The daily/account-wide upstream quota is UNKNOWN; this contract
 * does not pretend to know it or override publisher 403/429.
 *
 * All counters are ephemeral; no URL/host, raw news, B2, Supabase or signing
 * state is serialized to the public receipt.
 */
export const ORIGINAL_BUNDLE_HARD_CEILING=6;
export const ORIGINAL_BUNDLE_NORMAL_ALLOWANCE=4;
export const ORIGINAL_BUNDLE_RESERVE=2;
export const ORIGINAL_BUNDLE_PER_HOST_MAX=1;

export function createBundledOriginalReadbackBudget({
 hardCeiling=ORIGINAL_BUNDLE_HARD_CEILING,
 reserved=ORIGINAL_BUNDLE_RESERVE,
 perHostMax=ORIGINAL_BUNDLE_PER_HOST_MAX,
}={}){
 if(!Number.isSafeInteger(hardCeiling)||hardCeiling<0||
    hardCeiling>ORIGINAL_BUNDLE_HARD_CEILING||
    !Number.isSafeInteger(reserved)||reserved<0||reserved>hardCeiling||
    !Number.isSafeInteger(perHostMax)||perHostMax<1||perHostMax>2)
  throw Error("ORIGINAL_BUNDLE_INVALID");
 const available=hardCeiling-reserved;
 const hosts=new Map();
 let used=0;
 return Object.freeze({
  admit(host){
   // Even the identity of a prior publisher is private; never return it.
   if(typeof host!=="string"||!/^([a-z0-9-]+\.)+[a-z]{2,24}$/u.test(host))
    throw Error("ORIGINAL_BUNDLE_UNTRUSTED_HOST");
   if(used>=available)return false;
   if((hosts.get(host)??0)>=perHostMax)return false;
   hosts.set(host,(hosts.get(host)??0)+1);
   used++;
   return true;
  },
  snapshot(){
   return Object.freeze({
    schema:"geomacro.original-source-shared-bundle.v1",
    hard_ceiling:hardCeiling,normal_allowance:available,
    protected_unused_reserve:reserved,readbacks_used:used,
    normal_remaining:available-used,
    distinct_hosts_checked:hosts.size,
    reserve_touched:false,
    upstream_daily_quota_independently_verified:false,
    no_provider_hostnames_logged:true,
   });
  },
 });
}

/** Equal opportunity before recency competition: each publisher category gets
 * one turn per round, using the newest news FIRST inside each category.
 * No extra GET, and unclassified or stale cards remain in the audit output.
 */
export function bundleRoundRobinNews(signals){
 if(!Array.isArray(signals))throw Error("ORIGINAL_BUNDLE_NEWS_INVALID");
 const domains=["geopolitics","macro","rare_earth"];
 const groups=new Map(domains.map(c=>[c,[]]));
 const remaining=[];
 for(const item of signals){
  if(!item||typeof item!=="object"||!groups.has(item.category))
   remaining.push(item);
  else groups.get(item.category).push(item);
 }
 const sort=(a,b)=>String(b?.published_at??"").localeCompare(
   String(a?.published_at??""))||
   String(a?.id??"").localeCompare(String(b?.id??""));
 for(const group of groups.values())group.sort(sort);
 const rows=[];
 let index=0;
 while([...groups.values()].some(x=>x.length)){
  for(const domain of domains){
   const next=groups.get(domain)[index];
   if(next)rows.push(next);
  }
  index++;
 }
 return [...rows,...remaining];
}
