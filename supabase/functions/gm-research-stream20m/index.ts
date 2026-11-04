/**
 * Noncommercial isolated GeoMacro original-to-atomic-risk-state producer.
 * Deployed to Supabase ymjuwuvbialsevfawvvq; pg_cron invokes every 20min.
 * No GitHub Actions credential, RabbitMQ, B2, commercial state or money.
 * State is PROVISIONAL_RESEARCH_ONLY, NOT independently proven event truth.
 * Private token verified by service-role-only SQL before any source fetch.
 * Secrets are Supabase built-in server-side credentials and encrypted Vault.
 */
const SOURCES=[{"category":"GEOPOLITICS","url":"https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom","id":"uk_fcdo_ogl_official_atom"},{"category":"MACRO","url":"https://www.gov.uk/government/organisations/hm-treasury.atom","id":"uk_hmt_ogl_official_atom"},{"category":"CRITICAL_MINERALS","url":"https://www.gov.uk/government/organisations/department-for-business-and-trade.atom","id":"uk_dbt_ogl_minerals_atom"},{"category":"CRITICAL_MINERALS","url":"https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero.atom","id":"uk_desnz_ogl_minerals_atom"},{"category":"GEOPOLITICS","url":"https://www.gov.uk/government/organisations/ministry-of-defence.atom","id":"uk_mod_ogl_security_atom"},{"category":"GEOPOLITICS","url":"https://www.gov.uk/government/organisations/cabinet-office.atom","id":"uk_cabinet_ogl_security_atom"},{"category":"MACRO","url":"https://www.gov.uk/government/organisations/office-for-budget-responsibility.atom","id":"uk_obr_ogl_macro_atom"},{"category":"CRITICAL_MINERALS","url":"https://www.gov.uk/government/organisations/department-for-business-innovation-science-and-trade.atom","id":"uk_bist_ogl_minerals_atom"}];
const COUNTRIES=[{"iso3":"AFG","name":"Afghanistan"},{"iso3":"AGO","name":"Angola"},{"iso3":"ALB","name":"Albania"},{"iso3":"AND","name":"Andorra"},{"iso3":"ARE","name":"United Arab Emirates"},{"iso3":"ARG","name":"Argentina"},{"iso3":"ARM","name":"Armenia"},{"iso3":"ATG","name":"Antigua and Barbuda"},{"iso3":"AUS","name":"Australia"},{"iso3":"AUT","name":"Austria"},{"iso3":"AZE","name":"Azerbaijan"},{"iso3":"BDI","name":"Burundi"},{"iso3":"BEL","name":"Belgium"},{"iso3":"BEN","name":"Benin"},{"iso3":"BFA","name":"Burkina Faso"},{"iso3":"BGD","name":"Bangladesh"},{"iso3":"BGR","name":"Bulgaria"},{"iso3":"BHR","name":"Bahrain"},{"iso3":"BHS","name":"Bahamas"},{"iso3":"BIH","name":"Bosnia and Herzegovina"},{"iso3":"BLR","name":"Belarus"},{"iso3":"BLZ","name":"Belize"},{"iso3":"BOL","name":"Bolivia"},{"iso3":"BRA","name":"Brazil"},{"iso3":"BRB","name":"Barbados"},{"iso3":"BRN","name":"Brunei Darussalam"},{"iso3":"BTN","name":"Bhutan"},{"iso3":"BWA","name":"Botswana"},{"iso3":"CAF","name":"Central African Republic"},{"iso3":"CAN","name":"Canada"},{"iso3":"CHE","name":"Switzerland"},{"iso3":"CHL","name":"Chile"},{"iso3":"CHN","name":"China"},{"iso3":"CIV","name":"Côte d'Ivoire"},{"iso3":"CMR","name":"Cameroon"},{"iso3":"COD","name":"Democratic Republic of the Congo"},{"iso3":"COG","name":"Republic of the Congo"},{"iso3":"COL","name":"Colombia"},{"iso3":"COM","name":"Comoros"},{"iso3":"CPV","name":"Cabo Verde"},{"iso3":"CRI","name":"Costa Rica"},{"iso3":"CUB","name":"Cuba"},{"iso3":"CYP","name":"Cyprus"},{"iso3":"CZE","name":"Czechia"},{"iso3":"DEU","name":"Germany"},{"iso3":"DJI","name":"Djibouti"},{"iso3":"DMA","name":"Dominica"},{"iso3":"DNK","name":"Denmark"},{"iso3":"DOM","name":"Dominican Republic"},{"iso3":"DZA","name":"Algeria"},{"iso3":"ECU","name":"Ecuador"},{"iso3":"EGY","name":"Egypt"},{"iso3":"ERI","name":"Eritrea"},{"iso3":"ESP","name":"Spain"},{"iso3":"EST","name":"Estonia"},{"iso3":"ETH","name":"Ethiopia"},{"iso3":"FIN","name":"Finland"},{"iso3":"FJI","name":"Fiji"},{"iso3":"FRA","name":"France"},{"iso3":"FSM","name":"Federated States of Micronesia"},{"iso3":"GAB","name":"Gabon"},{"iso3":"GBR","name":"United Kingdom"},{"iso3":"GEO","name":"Georgia"},{"iso3":"GHA","name":"Ghana"},{"iso3":"GIN","name":"Guinea"},{"iso3":"GMB","name":"Gambia"},{"iso3":"GNB","name":"Guinea-Bissau"},{"iso3":"GNQ","name":"Equatorial Guinea"},{"iso3":"GRC","name":"Greece"},{"iso3":"GRD","name":"Grenada"},{"iso3":"GTM","name":"Guatemala"},{"iso3":"GUY","name":"Guyana"},{"iso3":"HND","name":"Honduras"},{"iso3":"HRV","name":"Croatia"},{"iso3":"HTI","name":"Haiti"},{"iso3":"HUN","name":"Hungary"},{"iso3":"IDN","name":"Indonesia"},{"iso3":"IND","name":"India"},{"iso3":"IRL","name":"Ireland"},{"iso3":"IRN","name":"Iran"},{"iso3":"IRQ","name":"Iraq"},{"iso3":"ISL","name":"Iceland"},{"iso3":"ISR","name":"Israel"},{"iso3":"ITA","name":"Italy"},{"iso3":"JAM","name":"Jamaica"},{"iso3":"JOR","name":"Jordan"},{"iso3":"JPN","name":"Japan"},{"iso3":"KAZ","name":"Kazakhstan"},{"iso3":"KEN","name":"Kenya"},{"iso3":"KGZ","name":"Kyrgyzstan"},{"iso3":"KHM","name":"Cambodia"},{"iso3":"KIR","name":"Kiribati"},{"iso3":"KNA","name":"Saint Kitts and Nevis"},{"iso3":"KOR","name":"South Korea"},{"iso3":"KWT","name":"Kuwait"},{"iso3":"LAO","name":"Laos"},{"iso3":"LBN","name":"Lebanon"},{"iso3":"LBR","name":"Liberia"},{"iso3":"LBY","name":"Libya"},{"iso3":"LCA","name":"Saint Lucia"},{"iso3":"LIE","name":"Liechtenstein"},{"iso3":"LKA","name":"Sri Lanka"},{"iso3":"LSO","name":"Lesotho"},{"iso3":"LTU","name":"Lithuania"},{"iso3":"LUX","name":"Luxembourg"},{"iso3":"LVA","name":"Latvia"},{"iso3":"MAR","name":"Morocco"},{"iso3":"MCO","name":"Monaco"},{"iso3":"MDA","name":"Moldova"},{"iso3":"MDG","name":"Madagascar"},{"iso3":"MDV","name":"Maldives"},{"iso3":"MEX","name":"Mexico"},{"iso3":"MHL","name":"Marshall Islands"},{"iso3":"MKD","name":"North Macedonia"},{"iso3":"MLI","name":"Mali"},{"iso3":"MLT","name":"Malta"},{"iso3":"MMR","name":"Myanmar"},{"iso3":"MNE","name":"Montenegro"},{"iso3":"MNG","name":"Mongolia"},{"iso3":"MOZ","name":"Mozambique"},{"iso3":"MRT","name":"Mauritania"},{"iso3":"MUS","name":"Mauritius"},{"iso3":"MWI","name":"Malawi"},{"iso3":"MYS","name":"Malaysia"},{"iso3":"NAM","name":"Namibia"},{"iso3":"NER","name":"Niger"},{"iso3":"NGA","name":"Nigeria"},{"iso3":"NIC","name":"Nicaragua"},{"iso3":"NLD","name":"Netherlands"},{"iso3":"NOR","name":"Norway"},{"iso3":"NPL","name":"Nepal"},{"iso3":"NRU","name":"Nauru"},{"iso3":"NZL","name":"New Zealand"},{"iso3":"OMN","name":"Oman"},{"iso3":"PAK","name":"Pakistan"},{"iso3":"PAN","name":"Panama"},{"iso3":"PER","name":"Peru"},{"iso3":"PHL","name":"Philippines"},{"iso3":"PLW","name":"Palau"},{"iso3":"PNG","name":"Papua New Guinea"},{"iso3":"POL","name":"Poland"},{"iso3":"PRK","name":"North Korea"},{"iso3":"PRT","name":"Portugal"},{"iso3":"PRY","name":"Paraguay"},{"iso3":"PSE","name":"State of Palestine"},{"iso3":"QAT","name":"Qatar"},{"iso3":"ROU","name":"Romania"},{"iso3":"RUS","name":"Russia"},{"iso3":"RWA","name":"Rwanda"},{"iso3":"SAU","name":"Saudi Arabia"},{"iso3":"SDN","name":"Sudan"},{"iso3":"SEN","name":"Senegal"},{"iso3":"SGP","name":"Singapore"},{"iso3":"SLB","name":"Solomon Islands"},{"iso3":"SLE","name":"Sierra Leone"},{"iso3":"SLV","name":"El Salvador"},{"iso3":"SMR","name":"San Marino"},{"iso3":"SOM","name":"Somalia"},{"iso3":"SRB","name":"Serbia"},{"iso3":"SSD","name":"South Sudan"},{"iso3":"STP","name":"São Tomé and Príncipe"},{"iso3":"SUR","name":"Suriname"},{"iso3":"SVK","name":"Slovakia"},{"iso3":"SVN","name":"Slovenia"},{"iso3":"SWE","name":"Sweden"},{"iso3":"SWZ","name":"Eswatini"},{"iso3":"SYC","name":"Seychelles"},{"iso3":"SYR","name":"Syria"},{"iso3":"TCD","name":"Chad"},{"iso3":"TGO","name":"Togo"},{"iso3":"THA","name":"Thailand"},{"iso3":"TJK","name":"Tajikistan"},{"iso3":"TKM","name":"Turkmenistan"},{"iso3":"TLS","name":"Timor-Leste"},{"iso3":"TON","name":"Tonga"},{"iso3":"TTO","name":"Trinidad and Tobago"},{"iso3":"TUN","name":"Tunisia"},{"iso3":"TUR","name":"Türkiye"},{"iso3":"TUV","name":"Tuvalu"},{"iso3":"TZA","name":"Tanzania"},{"iso3":"UGA","name":"Uganda"},{"iso3":"UKR","name":"Ukraine"},{"iso3":"URY","name":"Uruguay"},{"iso3":"USA","name":"United States"},{"iso3":"UZB","name":"Uzbekistan"},{"iso3":"VAT","name":"Holy See"},{"iso3":"VCT","name":"Saint Vincent and the Grenadines"},{"iso3":"VEN","name":"Venezuela"},{"iso3":"VNM","name":"Vietnam"},{"iso3":"VUT","name":"Vanuatu"},{"iso3":"WSM","name":"Samoa"},{"iso3":"YEM","name":"Yemen"},{"iso3":"ZAF","name":"South Africa"},{"iso3":"ZMB","name":"Zambia"},{"iso3":"ZWE","name":"Zimbabwe"}];
const PROJECT="ymjuwuvbialsevfawvvq";
const KEY_ID="geomacro-research-2026-11-supabase";
const URL="https://"+PROJECT+".supabase.co";
const MAX_AGE=6*3600_000,EXPIRY=3*3600_000;
const encoder=new TextEncoder();
const b64=(bytes)=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64=(txt)=>Uint8Array.from(atob(txt),c=>c.charCodeAt(0));
const STATUS_VALUES=new Set(["NO_FRESH_QUALIFIED","SOURCE_PARTIAL","SOURCE_UNAVAILABLE","STATE_UPDATED","SIGNED_UPDATED","INTERNAL_ERROR"]);
const SHA=/^[a-f0-9]{64}$/u;
const CATEGORY={
 "GEOPOLITICS":"geopolitics","MACRO":"macro","CRITICAL_MINERALS":"critical_minerals"
};
const RULES={
 geopolitics:[
  [/\b(?:sanctions?|embargo|asset freeze|export controls?|arms ban)\b/iu,82],
  [/\b(?:airstrike|armed conflict|invasion|missile strike|ceasefire violation)\b/iu,85],
  [/\b(?:border closure|diplomatic expulsion|trade restrictions?)\b/iu,68],
 ],
 macro:[
  [/\b(?:sovereign default|debt default|debt restructuring)\b/iu,83],
  [/\b(?:central bank|interest rate|policy rate|monetary policy|currency devaluation)\b/iu,58],
  [/\b(?:capital controls?|currency restrictions?|banking crisis)\b/iu,75],
 ],
 critical_minerals:[
  [/\b(?:rare earth|critical minerals?|lithium|cobalt|nickel|copper|gallium|germanium|tungsten|graphite|antimony)\b.{0,75}\b(?:export ban|ban|restriction|halt|suspend|closure)\b/iu,80],
  [/\b(?:export ban|export restriction|mine closure|smelter shutdown)\b.{0,75}\b(?:rare earth|critical minerals?|lithium|cobalt|nickel|copper|gallium|germanium|tungsten|graphite|antimony)\b/iu,80],
  [/\b(?:critical minerals?|rare earth|lithium|cobalt|nickel|copper|gallium|germanium|graphite)\b/iu,55],
 ]
};
const ACTION=/\b(?:announc(?:es|ed|ing)?|impos(?:es|ed|ing)?|restrict(?:s|ed|ing)?|suspend(?:s|ed|ing)?|ban(?:s|ned|ning)?|launch(?:es|ed|ing)?|confirm(?:s|ed|ing)?|approv(?:es|ed|ing)?|cut(?:s|ting)?|rais(?:es|ed|ing)?|closes?|halt(?:s|ed|ing)?|defaults?|restructur(?:es|ed|ing)?)\b/iu;
const SPECULATIVE=/\b(?:might|could|may|alleged|unverified|rumou?r|denies|fact.check)\b/iu;
const response=(o,status=200)=>new Response(JSON.stringify(o),{
 status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store"}
});
const safeJson=x=>x===null||typeof x==="string"||typeof x==="number"||
 typeof x==="boolean"?JSON.stringify(x):Array.isArray(x)?
 "["+x.map(safeJson).join(",")+"]":"{"+
 Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+safeJson(x[k])).join(",")+"}";
async function sha(txt){
 const digest=await crypto.subtle.digest("SHA-256",encoder.encode(txt));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function serverCredential(){
 if(Deno.env.get("SUPABASE_URL")!==URL)throw Error("RESEARCH_PROJECT_BOUNDARY");
 let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(key.length<32){
  const names=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");
  key=names.default||"";
 }
 if(key.length<32)throw Error("SUPABASE_BUILTIN_SERVICE_CREDENTIAL_UNAVAILABLE");
 return key;
}
const KEY=serverCredential();
async function db(path,{method="POST",data=null,prefer="return=representation"}={}){
 const r=await fetch(URL+"/rest/v1/"+path,{method,redirect:"error",cache:"no-store",
  headers:{apikey:KEY,Authorization:"Bearer "+KEY,Accept:"application/json",
   ...(method==="POST"?{"content-type":"application/json",Prefer:prefer}:{} )},
  body:method==="POST"?JSON.stringify(data):undefined,
  signal:AbortSignal.timeout(8000)});
 if(!r.ok||r.redirected)throw Error("RESEARCH_ISOLATED_DB_RPC_"+r.status);
 const txt=await r.text();if(txt.length>24000)throw Error("RESEARCH_ISOLATED_DB_OVERSIZE");
 return txt?JSON.parse(txt):null;
}
const rpc=(name,body)=>db("rpc/"+name,{data:body});
async function ensureSigner(){
 let material=await rpc("gm_research_stream20m_signer",{});
 if(material===null){
  // A research-only key is generated inside the protected Edge runtime.
  // Store PKCS8 in Supabase encrypted Vault, NEVER in GitHub or article logs.
  const kp=await crypto.subtle.generateKey({name:"Ed25519"},true,["sign","verify"]);
  const pk=b64(await crypto.subtle.exportKey("pkcs8",kp.privateKey));
  const pub=b64(await crypto.subtle.exportKey("spki",kp.publicKey));
  await rpc("gm_research_stream20m_provision_signer",{
   p_private_pkcs8_b64:pk,p_public_spki_b64:pub
  });
  material=await rpc("gm_research_stream20m_signer",{});
 }
 if(!material||material.key_id!==KEY_ID||typeof material.private_pkcs8_b64!=="string"||
    typeof material.public_spki_b64!=="string")throw Error("RESEARCH_VAULT_SIGNER_MISSING");
 const privateKey=await crypto.subtle.importKey("pkcs8",
  unb64(material.private_pkcs8_b64),{name:"Ed25519"},false,["sign"]);
 const publicKey=await crypto.subtle.importKey("spki",
  unb64(material.public_spki_b64),{name:"Ed25519"},false,["verify"]);
 const test=encoder.encode("research signer self-check");
 const sig=await crypto.subtle.sign("Ed25519",privateKey,test);
 if(!await crypto.subtle.verify("Ed25519",publicKey,sig,test))
  throw Error("RESEARCH_VAULT_ED25519_PAIR_MISMATCH");
 return {privateKey,publicKey};
}
async function getBounded(url,type,max){
 const res=await fetch(url,{method:"GET",redirect:"error",cache:"no-store",
  signal:AbortSignal.timeout(6500),
  headers:{Accept:type,"user-agent":"GeoMacro-Private-Official-Research/1.0"}});
 if(res.status!==200||res.redirected||
  Number(res.headers.get("content-length")||0)>max)
  throw Error("SOURCE_DENIED_OR_OVERSIZE");
 const mime=res.headers.get("content-type")?.toLowerCase()??"";
 if(!mime.includes(type.split("/")[1].split(",")[0])&&
   !mime.includes("xml")&&type!=="text/html"&&type!=="application/json")
  throw Error("SOURCE_CONTENT_TYPE_UNEXPECTED");
 if(!res.body)throw Error("SOURCE_NO_BODY");
 let len=0,chunks=[];
 const reader=res.body.getReader();
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   len+=value.byteLength;if(len>max)throw Error("SOURCE_SIZE_LIMIT");
   chunks.push(value);
  }
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(len);let offset=0;
 for(const v of chunks){bytes.set(v,offset);offset+=v.byteLength}
 return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
}
function deent(x){
 return String(x||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu,"$1")
 .replace(/&(amp|lt|gt|quot|apos);/giu,(_,k)=>({
  amp:"&",lt:"<",gt:">",quot:'"',apos:"'"
 })[k.toLowerCase()]??"").replace(/\s+/gu," ").trim();
}
function tag(block,name){
 const re=new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","iu");
 return deent(re.exec(block)?.[1]);
}
function clock(value,now){
 if(typeof value!=="string"||!/^20\d\d-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:?\d\d)$/iu.test(value))return null;
 const ms=Date.parse(value);return Number.isFinite(ms)&&ms<=now&&ms>=now-MAX_AGE?
 new Date(ms).toISOString():null;
}
function originalUrl(raw){
 try{
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.hostname!=="www.gov.uk"||u.search||u.hash||
     u.username||u.password||u.port||u.href.length>360||
     !/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9-]{5,190}$/u.test(u.pathname))
    return null;
  return u.href;
 }catch{return null}
}
function countryFromTitle(t){
 const normalized=t.normalize("NFKC").toLocaleLowerCase("en");
 const hits=[];
 for(const c of COUNTRIES){
  const candidates=[c.name,...(c.iso3==="PSE"?["Palestine","Palestinian"]:
    c.iso3==="GBR"?["Britain","British"]:c.iso3==="USA"?["United States of America"]:
    c.iso3==="UKR"?["Ukrainian"]:[])];
  for(const phrase of candidates){
   if(phrase.length<4)continue;
   const needle=phrase.toLocaleLowerCase("en");
   const at=normalized.indexOf(needle);
   if(at<0)continue;
   const left=at===0||!/\p{L}/u.test(normalized[at-1]);
   const right=at+needle.length===normalized.length||
    !/\p{L}/u.test(normalized[at+needle.length]);
   if(left&&right)hits.push({country:c.iso3,n:needle.length});
  }
 }
 if(!hits.length)return null;
 const best=Math.max(...hits.map(h=>h.n));
 const distinct=[...new Set(hits.filter(h=>h.n===best).map(h=>h.country))];
 return distinct.length===1?distinct[0]:null;
}
function severity(title,cat){
 if(!ACTION.test(title)||SPECULATIVE.test(title))return null;
 for(const [re,value] of RULES[cat]||[])if(re.test(title))return value;
 return null;
}
function parseAtom(xml,source,now){
 if(xml.length>320000||/<!DOCTYPE|<!ENTITY/iu.test(xml)||
  !/<feed(?:\s|>)/iu.test(xml)||!/<\/feed\s*>/iu.test(xml))
   throw Error("RESEARCH_OFFICIAL_ATOM_MALFORMED");
 const out=[],seen=new Set(),cat=CATEGORY[source.category];
 for(const [,entry] of [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/giu)].slice(0,40)){
  const title=tag(entry,"title"),published=tag(entry,"published");
  const hint=clock(published||tag(entry,"updated"),now);
  if(!hint||title.length<18||title.length>260)continue;
  const href=entry.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/iu)?.[1];
  const url=originalUrl(deent(href||""));
  const iso3=countryFromTitle(title),score=severity(title,cat);
  if(!url||!iso3||score===null||seen.has(url))continue;
  seen.add(url);
  out.push({title,url,category:cat,country:iso3,severity:score,
   published:published?clock(published,now):null});
 }
 return out;
}
function similar(a,b){
 const terms=v=>new Set(deent(v).toLowerCase().replace(/<[^>]*>/gu," ")
  .match(/[a-z]{5,}/gu)||[]);
 const x=terms(a),y=terms(b);
 return x.size>0&&y.size>0&&[...x].filter(w=>y.has(w)).length>=Math.min(2,x.size);
}
async function firstPublished(c,now){
 const path=new URL(c.url).pathname;
 const [html,raw]=await Promise.all([
  getBounded(c.url,"text/html",384*1024),
  getBounded("https://www.gov.uk/api/content"+path,"application/json",128*1024)
 ]);
 const heading=/<h1(?:\s[^>]*)?>([\s\S]{0,2500}?)<\/h1\s*>/iu.exec(html)?.[1];
 if(!heading||!similar(heading,c.title))return null;
 let doc;try{doc=JSON.parse(raw)}catch{return null}
 if(doc?.base_path!==path||doc.publication_state==="withdrawn"||
    !["news_story","press_release","speech","statement","publication","world_location_news_article"].includes(doc.document_type)||
    !similar(doc.title||"",c.title)||!similar(doc.title||"",heading))return null;
 const at=clock(doc.first_published_at,now);
 if(!at||(c.published&&Math.abs(Date.parse(at)-Date.parse(c.published))>60000))
  return null;
 return at;
}
async function signedWrite(state,event,at,keys){
 if(!state||state.status!=="RESEARCH_STATE_UPDATED"||
   state.state_changed!==true||state.profile!=="RESEARCH_UNVERIFIED"||
   state.country_code!==event.country||!Number.isSafeInteger(Number(state.version))||
   !SHA.test(String(state.last_evidence_sha256||"")))
  throw Error("STATE_RETURN_INVALID");
 if(event.severity<70)return false;
 const now=new Date(),snap={
  schema:"geomacro.research-country-risk-snapshot.v1",
  profile:"RESEARCH_UNVERIFIED",
  country_code:String(state.country_code),version:Number(state.version),
  composite_score:Number(state.composite_score),
  geopolitics_score:Number(state.geopolitics_score),
  macro_score:Number(state.macro_score),
  critical_minerals_score:Number(state.critical_minerals_score),
  last_evidence_sha256:String(state.last_evidence_sha256),
  last_event_at:new Date(state.last_event_at).toISOString(),
  updated_at:new Date(state.updated_at).toISOString(),
  generated_at:now.toISOString(),
  expires_at:new Date(now.getTime()+EXPIRY).toISOString(),
  verification_status:"PROVISIONAL_RESEARCH_ONLY",
  commercial_eligible:false,execution_authorized:false
 };
 if([snap.composite_score,snap.geopolitics_score,snap.macro_score,
  snap.critical_minerals_score].some(x=>!Number.isFinite(x)||x<0||x>100))
  throw Error("STATE_SCORE_OUT_OF_RANGE");
 const canonical=safeJson(snap),hash=await sha(canonical);
 const sig=b64(await crypto.subtle.sign("Ed25519",keys.privateKey,encoder.encode(canonical)));
 const ok=await rpc("attach_country_research_signature",{
  p_country_code:event.country,p_expected_version:snap.version,
  p_snapshot:snap,p_snapshot_sha256:hash,p_signature_b64:sig,
  p_signing_key_id:KEY_ID
 });
 if(ok!==true)throw Error("RESEARCH_SIGNATURE_CAS_FAILED");
 const rows=await db("country_risk_state?country_code=eq."+
   encodeURIComponent(event.country)+
   "&select=version,signed_version,signed_snapshot,signed_snapshot_sha256,signed_signature_b64,signed_signing_key_id&limit=1",
   {method:"GET"});
 const row=Array.isArray(rows)?rows[0]:null;
 if(!row||Number(row.version)!==snap.version||Number(row.signed_version)!==snap.version||
    row.signed_snapshot_sha256!==hash||row.signed_signature_b64!==sig||
    row.signed_signing_key_id!==KEY_ID||
    await sha(safeJson(row.signed_snapshot))!==hash||
    !await crypto.subtle.verify("Ed25519",keys.publicKey,unb64(sig),
     encoder.encode(canonical)))throw Error("RESEARCH_DURABLE_SIGNED_READBACK_FAILED");
 return true;
}
async function productionTick(){
 const keys=await ensureSigner();
 let healthy=0,found=0,verified=0,updated=0,signed=0,failed=0;
 const categoryUsed={geopolitics:0,macro:0,critical_minerals:0};
 const attempted={geopolitics:0,macro:0,critical_minerals:0};
 const sources=await Promise.all(SOURCES.map(async s=>{
  try{
   const xml=await getBounded(s.url,"application/atom+xml",320*1024);
   const observed=parseAtom(xml,s,Date.now());
   healthy++; // Only a valid Atom root counts as a source-health proof.
   return observed;
  }catch{failed++;return []}
 }));
 const seen=new Set();
 for(const candidates of sources){
  for(const e of candidates){
   if(categoryUsed[e.category]>=2||attempted[e.category]>=4)continue;
   const identity=e.category+"\n"+e.url+"\n"+(e.published||"unknown");
   if(seen.has(identity))continue;
   seen.add(identity);attempted[e.category]++;found++;
   try{
    const at=await firstPublished(e,Date.now());
    if(!at)continue;
    verified++;categoryUsed[e.category]++;
    const hash=await sha(e.category+"\n"+e.url+"\n"+at);
    const state=await rpc("update_country_realtime_score",{
     p_country_code:e.country,p_severity:e.severity,p_confidence:60,
     p_category:e.category,p_evidence_sha256:hash,
     p_original_published_at:at,p_independent_originals:1
    });
    if(state?.status==="RESEARCH_STATE_UPDATED"){
     updated++;if(await signedWrite(state,e,at,keys))signed++;
    }
   }catch{failed++}
  }
 }
 const status=signed>0?"SIGNED_UPDATED":updated>0?"STATE_UPDATED":
  healthy===0?"SOURCE_UNAVAILABLE":failed>0?"SOURCE_PARTIAL":"NO_FRESH_QUALIFIED";
 const out={status,source_count:SOURCES.length,source_http_healthy:healthy,
  candidate_count:found,original_pages_verified:verified,state_updated:updated,
  signed_verified:signed,failures:failed,
  execution_authorized:false,commercial_eligible:false};
 try{await db("gm_research_stream20m_runs",{data:out,prefer:"return=minimal"})}
 catch{throw Error("RESEARCH_RUN_RECEIPT_STORAGE_FAILED")}
 return out;
}
Deno.serve(async request=>{
 if(request.method!=="POST")return response({ok:false},405);
 const token=request.headers.get("x-gm-research-cron")||"";
 if(!/^[a-f0-9]{64}$/u.test(token))return response({ok:false},403);
 let auth=false;
 try{auth=await rpc("gm_research_stream20m_auth",{p_token:token})===true}
 catch{return response({ok:false},503)}
 if(!auth)return response({ok:false},403);
 try{
  const result=await productionTick();
  return response({ok:result.status!=="SOURCE_UNAVAILABLE",
    schema:"geomacro.research-stream20m-supabase.v1",...result},
   result.status==="SOURCE_UNAVAILABLE"?503:200);
 }catch{
  try{await db("gm_research_stream20m_runs",{data:{status:"INTERNAL_ERROR",
    failures:1,execution_authorized:false,commercial_eligible:false},prefer:"return=minimal"})}
  catch{}
  return response({ok:false,schema:"geomacro.research-stream20m-supabase.v1",
    status:"INTERNAL_ERROR",execution_authorized:false,commercial_eligible:false},503);
 }
});
