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
const SOURCE_STATUS="BROWSER_SEARCH_LEAD_NOT_ORIGINAL_SOURCE_VERIFIED";
const K=/^[A-Z]{3}$/u;
const HOST=/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/u;
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
  !Array.isArray(root.leads)||root.leads.length<1||root.leads.length>3)reject();
 const allowed=new Set(categories),clock=now.getTime();
 if(!Number.isFinite(clock))reject();
 const leads=root.leads.map(l=>{
  if(!takeKeys(l,["category","what_changed","why_it_matters","source_domain","source_date"])||
   !allowed.has(l.category)||
   !within(l.what_changed,25,300)||
   !within(l.why_it_matters,25,320)||
   typeof l.source_domain!=="string"||!HOST.test(l.source_domain)||
   l.source_domain!==l.source_domain.toLowerCase()||
   !(l.source_date===null||typeof l.source_date==="string"&&
       /^\d{4}-\d\d-\d\d$/u.test(l.source_date)))reject();
  if(l.source_date!==null){
   const d=Date.parse(l.source_date+"T00:00:00.000Z");
   if(!Number.isFinite(d)||new Date(d).toISOString().slice(0,10)!==l.source_date||
      d>clock+86400_000||clock-d>7*86400_000)reject();
  }
  return Object.freeze({category:l.category,what_changed:l.what_changed,
   why_it_matters:l.why_it_matters,
   // Model-supplied claimed identity/date are internal leads, not original proof.
   source_claim_fingerprint:createHash("sha256").update(l.source_domain).digest("hex"),
   claimed_original_calendar_day:l.source_date,
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
 // Do not spend ANY provider quota without a verified user-owned free-tier
 // browser_search entitlement and a feature-specific production opt-in.
 if(env.GROQ_BROWSER_SEARCH_ENABLED!=="1"||
    env.GROQ_BROWSER_SEARCH_FREE_QUOTA_ACK!=="YES_BROWSER_FREE_TIER_CONFIRMED"||
    typeof env.GROQ_API_KEY!=="string"||!env.GROQ_API_KEY.trim())
  return null;
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
