/**
 * Optional one-shot Groq BUILT-IN browser_search for Ask Geomacro.
 * The official free-source and country-native retrievers are ALWAYS first.
 * Browser-generated results are UNVERIFIED research leads; never a paid GRO.
 * Groq browser_search is incompatible with response_format=json_schema.
 * Consequently parse and strictly validate a best-effort JSON TEXT payload.
 */
import {createHash} from "node:crypto";
const CATEGORIES=Object.freeze({
 GEOPOLITICS:"official geopolitics sanctions trade diplomacy conflict releases",
 MACRO:"official central bank macroeconomic economic statistics exchange-rate releases",
 CRITICAL_MINERALS:"official critical minerals rare earth supply mining policy releases"
});
const BROWSER_MODEL="openai/gpt-oss-20b";
const GROQ_URL="https://api.groq.com/openai/v1/chat/completions";
// Owner confirmed on 2026-10-22: Groq organization is FREE and the existing
// GROQ_API_KEY is already in Lovable server Secrets. Enable on this narrow
// official-source MISS path without requiring scarce Lovable AI credits.
// An explicit runtime opt-out overrides the owner confirmation immediately.
// Free Groq traffic is quota-bound/429; never upgrade tiers or add a card.
export const OWNER_CONFIRMED_EXISTING_GROQ_FREE_20261022=true;
const MAX_PER_HOUR_PER_RUNTIME=6;
const MAX_PER_DAY_PER_RUNTIME=12;
const inMemoryBrowserBudget={hourStart:0,hourCount:0,dayStart:0,dayCount:0};
export function reserveBoundedFreeBrowserSlot(nowMs=Date.now(),budget=inMemoryBrowserBudget){
 if(!Number.isFinite(nowMs)||nowMs<0)reject();
 const hour=Math.floor(nowMs/3600_000),day=Math.floor(nowMs/86400_000);
 if(budget.hourStart!==hour){budget.hourStart=hour;budget.hourCount=0;}
 if(budget.dayStart!==day){budget.dayStart=day;budget.dayCount=0;}
 if(budget.hourCount>=MAX_PER_HOUR_PER_RUNTIME||
    budget.dayCount>=MAX_PER_DAY_PER_RUNTIME)return false;
 budget.hourCount++;budget.dayCount++;
 return true;
}
const SOURCE_STATUS="BROWSER_SEARCH_LEAD_NOT_ORIGINAL_SOURCE_VERIFIED";
const K=/^[A-Z]{3}$/u;
const HOST=/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/u;
function internalClaimedHostname(value){
 // A browser model may emit a URL instead of an origin host. If so,
 // accept ONLY its parsed HTTPS hostname, never expose path, query, text.
 if(typeof value!=="string"||value.length>300)return null;
 let host=value;
 if(value.startsWith("https://")){
  try{
   const u=new URL(value);
   if(u.protocol!=="https:"||u.username||u.password||u.port)return null;
   host=u.hostname;
  }catch{return null}
 }
 host=host.toLowerCase().replace(/^www\./u,"");
 if(!HOST.test(host)||host.includes(".."))return null;
 return host;
}
function allowedCategory(value){
 const normalized=typeof value==="string"?
  value.trim().toUpperCase().replace(/[ -]/gu,"_"):null;
 return normalized==="GEOPOLITICS"||normalized==="MACRO"||
  normalized==="CRITICAL_MINERALS"?normalized:null;
}
function claimedCalendarDate(v){
 if(v===null||v===""||v===undefined)return null;
 if(typeof v!=="string")return undefined;
 if(/^\d{4}-\d\d-\d\d$/u.test(v))return v;
 if(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(v))
  return v.slice(0,10);
 return undefined;
}
const SECRET=/https?:\/\/|www\.|<[^>]+>|-----BEGIN|(?:api[_ -]?key|private[_ -]?key)[\s:=]/iu;
const takeKeys=(obj,keys)=>obj&&typeof obj==="object"&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join(",")===keys.slice().sort().join(",");
const within=(text,min,max)=>typeof text==="string"&&text.length>=min&&
 text.length<=max&&!SECRET.test(text)&&!text.includes("\n")&&!text.includes("\r");
const reject=()=>{throw Error("GROQ_BROWSER_RESEARCH_UNVERIFIED_OR_UNAVAILABLE")};
function safeCountry(country_iso3,country_name) {
 if(country_iso3===null||country_iso3===undefined){
  if(country_name!==null&&country_name!==undefined)reject();
  return {iso3:null,name:null};
 }
 if(!K.test(country_iso3)||typeof country_name!=="string"||
   country_name.length<2||country_name.length>72||
   !/^[\p{L}\p{M} .,'()-]+$/u.test(country_name))reject();
 return {iso3:country_iso3,name:country_name};
}
export function planBoundedGroqBrowserSearch({categories,country_iso3=null,country_name=null}={}){
 if(!Array.isArray(categories)||categories.length<1||categories.length>3||
  categories.some(c=>!Object.hasOwn(CATEGORIES,c))||
  new Set(categories).size!==categories.length)reject();
 const country=safeCountry(country_iso3,country_name);
 return Object.freeze({
  schema:"geomacro.groq-browser-fixed-official-scope.v1",
  categories:Object.freeze([...categories]),
  country_iso3:country.iso3,
  country_name:country.name,
  search_terms:categories.map(c=>CATEGORIES[c]),
  personal_question_forwarded:false
 });
}
export function validateGroqBrowserLeadText(content,{categories,now=new Date()}={}){
 if(typeof content!=="string"||content.length>4000)reject();
 const trimmed=content.trim();
 // Strict JSON text. Browser search and structured-output modes are incompatible;
 // reject markdown, citations/out-of-band snippets, or other loose model prose.
 if(!trimmed.startsWith("{")||!trimmed.endsWith("}"))reject();
 let root;try{root=JSON.parse(trimmed)}catch{reject()}
 if(!takeKeys(root,["schema","leads"])||
  root.schema!=="geomacro.groq.browser-research-leads.v1"||
  !Array.isArray(root.leads)||root.leads.length>3)reject();
 const allowed=new Set(categories),clock=now.getTime();
 if(!Number.isFinite(clock))reject();
 const leads=root.leads.map(l=>{
  const cat=allowedCategory(l?.category);
  const host=internalClaimedHostname(l?.source_domain);
  const calendar=claimedCalendarDate(l?.source_date);
  // Extras in an untrusted model JSON object are IGNORED, never forwarded;
  // the five required typed claims remain strictly validated.
  if(!l||typeof l!=="object"||Array.isArray(l)||
   !allowed.has(cat)||!within(l.what_changed,25,300)||
   !within(l.why_it_matters,25,320)||!host||calendar===undefined)reject();
  if(calendar!==null){
   const d=Date.parse(calendar+"T00:00:00.000Z");
   if(!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==calendar||
      d>clock+86400_000||clock-d>7*86400_000)reject();
  }
  return Object.freeze({category:cat,what_changed:l.what_changed,
   why_it_matters:l.why_it_matters,
   // Model-supplied claimed identity/date are internal leads, not original proof.
   source_claim_fingerprint:createHash("sha256").update(host).digest("hex"),
   claimed_original_calendar_day:calendar,
   source_native_date_verified:false,original_html_verified:false,
   factual_claim_independently_verified:false,commercial_permission_verified:false
  });
 });
 return Object.freeze(leads);
}
export async function groqBrowserResearchForMissingOfficial({
 categories,country_iso3=null,country_name=null,
 env=process.env,fetchImpl=fetch,now=new Date()
}={}){
 const plan=planBoundedGroqBrowserSearch({categories,country_iso3,country_name});
 // The owner has confirmed Groq FREE + the existing Lovable server
 // secret. No Lovable AI edit credits are required: the versioned code opt-in
 // works with existing GROQ_API_KEY; explicit runtime 0/DENY stops it.
 // Per-process slot limits are an additional conservative bound, NOT a
 // distributed 195-country traffic governor. Groq Free returns 429 at limits.
 if(!OWNER_CONFIRMED_EXISTING_GROQ_FREE_20261022||
    env.GROQ_BROWSER_SEARCH_ENABLED==="0"||
    env.GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK==="DENY"||
    typeof env.GROQ_API_KEY!=="string"||!env.GROQ_API_KEY.trim())
  return null;
 // Never consume a shared free-tier token until the official/index paths
 // have already failed and we have one supported fixed country/topic scope.
 if(!reserveBoundedFreeBrowserSlot(now.getTime()))return null;
 if(typeof fetchImpl!=="function")reject();
 const input={
  country_iso3:plan.country_iso3,country:plan.country_name,
  domains:plan.search_terms,window:"past 48 hours",max_leads:3
 };
 const system=[
  "Use browser_search to seek fresh first-party official documents or news releases.",
  "Only use the given country and fixed topic list; no private user question is supplied.",
  "Do not claim original publisher native dates, original HTML readback or rights have been checked.",
  "No copied upstream text, source URLs, quotes, source access tokens or publisher titles.",
  "Return ONLY JSON text with exactly {schema:'geomacro.groq.browser-research-leads.v1',leads:[",
  "{category:'GEOPOLITICS|MACRO|CRITICAL_MINERALS',what_changed:'25-300 char original paraphrase',",
  "why_it_matters:'25-320 char conditional Geomacro implication',source_domain:'example.gov',",
  "source_date:'YYYY-MM-DD' or null}]}. Use valid JSON, not single quotes or code fencing.",
  "Do not invent a claim, country, date or domain. If no support, return leads: [].",
  "The results are provisional leads NOT licensed, independently verified signed intelligence."
 ].join(" ");
 const payload={
  model:BROWSER_MODEL,temperature:0,max_completion_tokens:900,
  reasoning_effort:"low",
  tool_choice:"required",tools:[{type:"browser_search"}],
  messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(input)}]
 };
 let res;try{res=await fetchImpl(GROQ_URL,{
  method:"POST",redirect:"error",
  headers:{"Content-Type":"application/json",Authorization:"Bearer "+env.GROQ_API_KEY},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(22000)
 })}catch{reject()}
 if(res?.status!==200)reject();
 let doc;try{doc=await res.json()}catch{reject()}
 const text=doc?.choices?.[0]?.message?.content;
 const leads=validateGroqBrowserLeadText(text,{categories,now});
 return Object.freeze({
  schema:"geomacro.groq-live-web-research-only.v1",
  trust:"PROVISIONAL_BROWSER_SEARCH_NOT_FIRST_PARTY_VERIFIED",
  model:BROWSER_MODEL,observed_at:now.toISOString(),leads,
  official_free_sources_searched_first:true,
  external_human_review_claimed:false,
  source_native_clock_verified:false,
  legal_commercial_rights_verified:false,
  raw_upstream_delivered:false,
  signed_gro_generated:false,paid_x402_authorized:false,
  b2_requests:0,d1_writes:0,supabase_requests:0,real_payments:0
 });
}
