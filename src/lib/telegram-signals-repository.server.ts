import { fetchWithoutRedirect } from "./fetch-without-redirect";
import { country195ByIso3 } from "./canonical-country-registry-195";

/**
 * GeoMacro main can ONLY READ governed metadata from the Telegram producer API.
 * The isolated Supabase service-role key must never be configured in main.
 * Unverified Telegram leads cannot be treated as news facts or buyer evidence.
 */
type Domain="geopolitics"|"macro"|"rare_earth";
type Category="GEOPOLITICS"|"MACRO"|"CRITICAL_MINERALS";
const MAP:Readonly<Record<Domain,Category>>={
 geopolitics:"GEOPOLITICS",macro:"MACRO",rare_earth:"CRITICAL_MINERALS"
};
export type PrivateTelegramSignal={
 signal_id:string;category:Category;country_iso3:string|null;
 topic_code:string;event_family_key:string;content_hash:string;
 published_at:string;observed_at:string;
};
function configuration(){
 const raw=String(process.env.GEOMACRO_TELEGRAM_SIGNALS_READ_URL??"").trim();
 const token=String(process.env.GEOMACRO_TELEGRAM_SIGNALS_READ_TOKEN??"").trim();
 if(!raw||token.length<32)return null;
 try {
  const url=new URL(raw);
  if(url.protocol!=="https:"||url.username||url.password||url.search||
     url.hash||url.pathname!=="/v1/private/telegram/signals"||
     !url.hostname.includes(".")||url.hostname==="localhost"||
     /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(url.hostname))
   return null;
  return {url,token};
 }catch{return null}
}
export function hasPrivateTelegramSignalReader(){return Boolean(configuration());}
const ID=/^tg_[a-f0-9]{32}$/;
const HEX=/^[a-f0-9]{64}$/;
const CODE=/^[A-Z_]{3,48}$/;
function validate(payload:unknown,domain:Domain,country:string,limit:number):PrivateTelegramSignal[]{
 if(!payload||typeof payload!=="object"||Array.isArray(payload))throw Error("TELEGRAM_RESPONSE_INVALID");
 const p=payload as Record<string,unknown>;
 if(Object.keys(p).length!==5||p.schema!=="geomacro.private-telegram-signals.v1"||
    p.verification_status!=="UNVERIFIED"||p.commercial_eligible!==false||
    p.source_text_retained!==false||!Array.isArray(p.records)||p.records.length>limit)
   throw Error("TELEGRAM_UNTRUSTED_RESPONSE");
 const now=Date.now(),rows:PrivateTelegramSignal[]=[];
 for(const item of p.records){
  if(!item||typeof item!=="object"||Array.isArray(item))throw Error("TELEGRAM_RECORD_INVALID");
  const r=item as Record<string,unknown>;
  if(Object.keys(r).length!==8||!ID.test(String(r.signal_id))||
     r.category!==MAP[domain]||r.country_iso3!==country||
     !CODE.test(String(r.topic_code))||!HEX.test(String(r.content_hash))||
     !HEX.test(String(r.event_family_key)))throw Error("TELEGRAM_RECORD_UNSAFE");
  const published=Date.parse(String(r.published_at)),observed=Date.parse(String(r.observed_at));
  if(!Number.isFinite(published)||!Number.isFinite(observed)||
     published>now+300000||published<now-25*3600000||observed>now+300000)
   throw Error("TELEGRAM_RECORD_STALE");
  rows.push({
   signal_id:String(r.signal_id),category:r.category as Category,
   country_iso3:country,topic_code:String(r.topic_code),
   event_family_key:String(r.event_family_key),content_hash:String(r.content_hash),
   published_at:String(r.published_at),observed_at:String(r.observed_at)
  });
 }
 return rows;
}
export async function readPrivateTelegramSignals(input:{
 country_iso3:string;category:Domain;limit?:number;
}):Promise<PrivateTelegramSignal[]>{
 const cfg=configuration(),limit=input.limit??20;
 if(!cfg||!country195ByIso3(input.country_iso3)||
    !Object.hasOwn(MAP,input.category)||!Number.isSafeInteger(limit)||
    limit<1||limit>100)throw Error("TELEGRAM_READ_NOT_CONFIGURED_OR_INVALID");
 const url=new URL(cfg.url);
 url.searchParams.set("category",input.category);
 url.searchParams.set("country_iso3",input.country_iso3);
 url.searchParams.set("limit",String(limit));
 const response=await fetchWithoutRedirect(url.toString(),{
  method:"GET",redirect:"error",cache:"no-store",
  headers:{Authorization:`Bearer ${cfg.token}`},signal:AbortSignal.timeout(9000)
 });
 if(!response.ok||
    response.headers.get("content-type")?.split(";")[0]?.trim()!=="application/json"||
    Number(response.headers.get("content-length")??0)>24000)
  throw Error("TELEGRAM_PRIVATE_READ_FAILED");
 const text=await response.text();
 if(text.length>24000)throw Error("TELEGRAM_PRIVATE_READ_OVERSIZE");
 return validate(JSON.parse(text) as unknown,input.category,input.country_iso3,limit);
}
