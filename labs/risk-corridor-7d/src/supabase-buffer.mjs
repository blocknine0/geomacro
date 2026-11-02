// Optional 7-day auxiliary data; never the paid GRO / payment authority.
import {DOMAINS} from "./contract.mjs";
const TTL_MS=7*86400_000;
const ISO3=/^[A-Z]{3}$/;
const sha=/^[a-f0-9]{64}$/;
export const DEDICATED_RISK_SUPABASE_REF="ymjuwuvbialsevfawvvq";
export const DEDICATED_RISK_SUPABASE_URL="https://"+DEDICATED_RISK_SUPABASE_REF+".supabase.co";
export function sevenDayCutoff(now=new Date()) {
  if (!Number.isFinite(now.getTime())) throw Error("BUFFER_CLOCK_INVALID");
  return new Date(now.getTime()-TTL_MS).toISOString();
}
export function requireDerivedSignal(row,now=new Date()) {
  if (!row || !DOMAINS.includes(row.domain)||!ISO3.test(row.country_iso3)||
      !sha.test(row.event_sha256)||!sha.test(row.verified_gro_sha256)||
      row.verification_status!=="VERIFIED"||
      typeof row.signal_kind!=="string"||!/^[a-z_]{1,64}$/.test(row.signal_kind)||
      !Number.isFinite(row.intensity)||row.intensity<0||row.intensity>100) throw Error("UNVERIFIED_OR_INVALID_SIGNAL");
  if (!Number.isFinite(Date.parse(row.original_at)) || Date.parse(row.original_at)>now.getTime()+300000)
    throw Error("SOURCE_TIME_INVALID");
  // Do not persist titles, URLs, original articles, user data or publisher payloads.
  return {event_sha256:row.event_sha256,verified_gro_sha256:row.verified_gro_sha256,
    country_iso3:row.country_iso3,domain:row.domain,signal_kind:row.signal_kind,
    intensity:row.intensity,verification_status:"VERIFIED",original_at:row.original_at};
}
export function createSevenDayBuffer({url,serviceKey,fetchImpl=fetch,now=()=>new Date()}) {
  if (typeof url!=="string"||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)||
      typeof serviceKey!=="string"||serviceKey.length<30 ||
      url.replace(/\/$/,"")!==DEDICATED_RISK_SUPABASE_URL) throw Error("SUPABASE_BUFFER_NOT_CONFIGURED");
  const base=url.replace(/\/$/,"");
  async function query(table,method,queryString,body) {
    if (!["geomacro_risk_signal_7d","geomacro_corridor_candidate_7d","geomacro_risk_assessment_7d"].includes(table))
      throw Error("BUFFER_TABLE_INVALID");
    const endpoint=base+"/rest/v1/"+table+(queryString?"?"+queryString:"");
    const response=await fetchImpl(endpoint,{
      method,headers:{"apikey":serviceKey,...(serviceKey.startsWith("sb_secret_") ? {} : {"Authorization":"Bearer "+serviceKey}),
        "Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},
      body:body?JSON.stringify(body):undefined,redirect:"error",
      signal:AbortSignal.timeout(12000)
    });
    if (!response.ok) throw Error("BUFFER_REQUEST_FAILED_"+response.status);
    return response;
  }
  return {
    async putVerifiedSignal(raw) {
      const row=requireDerivedSignal(raw,now());
      return query("geomacro_risk_signal_7d","POST","on_conflict=event_sha256%2Ccountry_iso3%2Cdomain",row);
    },
    async listRecentSignals(countryIso3,domain) {
      if (!ISO3.test(countryIso3)||!DOMAINS.includes(domain)) throw Error("BUFFER_FILTER_INVALID");
      const params=new URLSearchParams({country_iso3:"eq."+countryIso3,
        domain:"eq."+domain,ingested_at:"gte."+sevenDayCutoff(now()),
        order:"ingested_at.desc",limit:"200",
        select:"event_sha256,verified_gro_sha256,country_iso3,domain,signal_kind,intensity,original_at,ingested_at"});
      const response=await query("geomacro_risk_signal_7d","GET",params.toString());
      const rows=await response.json();
      return Array.isArray(rows)?rows.filter(r=>Date.parse(r.ingested_at)>=Date.parse(sevenDayCutoff(now()))):[];
    }
  };
}
