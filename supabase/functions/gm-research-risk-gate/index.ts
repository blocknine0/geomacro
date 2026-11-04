/**
 * NONCOMMERCIAL private Supabase Edge research advisory gate.
 * Auth is an independently generated Vault read token, not the ingest token.
 * No payment, execution, Predge route, live checkout or commercial eligibility.
 * All signed state is read from isolated private Supabase and Ed25519 verified.
 */
const PROJECT="ymjuwuvbialsevfawvvq",URL="https://"+PROJECT+".supabase.co";
const VALID_ISO3=new Set(["AFG","AGO","ALB","AND","ARE","ARG","ARM","ATG","AUS","AUT","AZE","BDI","BEL","BEN","BFA","BGD","BGR","BHR","BHS","BIH","BLR","BLZ","BOL","BRA","BRB","BRN","BTN","BWA","CAF","CAN","CHE","CHL","CHN","CIV","CMR","COD","COG","COL","COM","CPV","CRI","CUB","CYP","CZE","DEU","DJI","DMA","DNK","DOM","DZA","ECU","EGY","ERI","ESP","EST","ETH","FIN","FJI","FRA","FSM","GAB","GBR","GEO","GHA","GIN","GMB","GNB","GNQ","GRC","GRD","GTM","GUY","HND","HRV","HTI","HUN","IDN","IND","IRL","IRN","IRQ","ISL","ISR","ITA","JAM","JOR","JPN","KAZ","KEN","KGZ","KHM","KIR","KNA","KOR","KWT","LAO","LBN","LBR","LBY","LCA","LIE","LKA","LSO","LTU","LUX","LVA","MAR","MCO","MDA","MDG","MDV","MEX","MHL","MKD","MLI","MLT","MMR","MNE","MNG","MOZ","MRT","MUS","MWI","MYS","NAM","NER","NGA","NIC","NLD","NOR","NPL","NRU","NZL","OMN","PAK","PAN","PER","PHL","PLW","PNG","POL","PRK","PRT","PRY","PSE","QAT","ROU","RUS","RWA","SAU","SDN","SEN","SGP","SLB","SLE","SLV","SMR","SOM","SRB","SSD","STP","SUR","SVK","SVN","SWE","SWZ","SYC","SYR","TCD","TGO","THA","TJK","TKM","TLS","TON","TTO","TUN","TUR","TUV","TZA","UGA","UKR","URY","USA","UZB","VAT","VCT","VEN","VNM","VUT","WSM","YEM","ZAF","ZMB","ZWE"]);
const SCHEMA="geomacro.research-country-risk-snapshot.v1";
const KEY_ID="geomacro-research-2026-11-supabase";
const MAX_AGE=3*3600_000,SHA=/^[a-f0-9]{64}$/u;
const codec=new TextEncoder();
function pause(reason,status=503){
 return Response.json({schema:"geomacro.research-corridor-gate.v1",
  ok:false,decision:"PAUSE",reason,execution_authorized:false,
  commercial_eligible:false,research_only:true},
  {status,headers:{"Cache-Control":"private, no-store",
    "X-Robots-Tag":"noindex,nofollow","X-Content-Type-Options":"nosniff"}});
}
function serverKey(){
 if(Deno.env.get("SUPABASE_URL")!==URL)throw Error("RESEARCH_PROJECT_MISMATCH");
 let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(key.length<32)key=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}").default||"";
 if(key.length<32)throw Error("RESEARCH_SERVER_KEY_UNAVAILABLE");
 return key;
}
const KEY=serverKey();
async function db(path,method="POST",data=null){
 const res=await fetch(URL+"/rest/v1/"+path,{
  method,cache:"no-store",redirect:"error",
  headers:{apikey:KEY,Authorization:"Bearer "+KEY,
   Accept:"application/json",...(method==="POST"?{"Content-Type":"application/json"}:{})},
  body:method==="POST"?JSON.stringify(data):undefined,
  signal:AbortSignal.timeout(8000)});
 if(!res.ok||res.redirected)throw Error("RESEARCH_REST_FAILED");
 const value=await res.text();
 if(value.length>20000)throw Error("RESEARCH_REST_OVERSIZE");
 return value?JSON.parse(value):null;
}
function canonical(x){
 if(x===null||typeof x==="boolean"||typeof x==="number"||typeof x==="string")
  return JSON.stringify(x);
 if(Array.isArray(x))return "["+x.map(canonical).join(",")+"]";
 if(x&&typeof x==="object")return "{"+Object.keys(x).sort().map(k=>
  JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";
 throw Error("NON_JSON");
}
async function sha256(x){
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",codec.encode(x)));
 return [...bytes].map(v=>v.toString(16).padStart(2,"0")).join("");
}
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function signedState(country,pub,now){
 const rows=await db("country_risk_state?country_code=eq."+
   encodeURIComponent(country)+
   "&select=country_code,version,signed_version,signed_snapshot,signed_snapshot_sha256,signed_signature_b64,signed_signing_key_id&limit=1","GET");
 const row=Array.isArray(rows)?rows[0]:null,s=row?.signed_snapshot;
 if(!row||!s||s.schema!==SCHEMA||s.profile!=="RESEARCH_UNVERIFIED"||
    s.country_code!==country||row.country_code!==country||
    s.verification_status!=="PROVISIONAL_RESEARCH_ONLY"||
    s.commercial_eligible!==false||s.execution_authorized!==false||
    !Number.isSafeInteger(Number(row.version))||
    Number(row.version)!==Number(row.signed_version)||
    Number(row.version)!==s.version||
    !SHA.test(String(row.signed_snapshot_sha256||""))||
    row.signed_signing_key_id!==KEY_ID||!SHA.test(String(s.last_evidence_sha256||"")))
  return null;
 const generated=Date.parse(s.generated_at),expiry=Date.parse(s.expires_at);
 if(!Number.isFinite(generated)||!Number.isFinite(expiry)||
    generated>now+60000||now-generated>MAX_AGE||
    expiry<=now||expiry-generated>MAX_AGE+60000)return null;
 if(!Number.isFinite(Number(s.composite_score))||
    Number(s.composite_score)<0||Number(s.composite_score)>100)return null;
 try{
  const payload=canonical(s);
  if(await sha256(payload)!==row.signed_snapshot_sha256)return null;
  const good=await crypto.subtle.verify("Ed25519",pub,
   unb64(String(row.signed_signature_b64||"")),codec.encode(payload));
  return good?{score:Number(s.composite_score),
   signature:String(row.signed_signature_b64),
   sha256:String(row.signed_snapshot_sha256)}:null;
 }catch{return null}
}
Deno.serve(async req=>{
 if(req.method!=="POST")return pause("METHOD_NOT_ALLOWED",405);
 const token=(req.headers.get("authorization")||"").replace(/^Bearer /u,"");
 if(!/^[0-9a-f]{64}$/u.test(token))return pause("RESEARCH_AUTH_REQUIRED",401);
 let allowed=false;
 try{allowed=await db("rpc/gm_research_stream20m_read_auth","POST",
   {p_token:token})===true}
 catch{return pause("RESEARCH_AUTH_STORE_UNAVAILABLE")}
 if(!allowed)return pause("RESEARCH_AUTH_REQUIRED",401);
 if((req.headers.get("content-type")||"").split(";")[0]!=="application/json")
  return pause("UNSUPPORTED_MEDIA_TYPE",415);
 let data;
 try{
  const body=await req.text();
  if(codec.encode(body).byteLength>8192)return pause("RESEARCH_REQUEST_TOO_LARGE",413);
  data=JSON.parse(body);
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error();
 }catch{return pause("RESEARCH_INVALID_REQUEST",400)}
 if(Object.keys(data).some(k=>!["origin_country","destination_country","policy_threshold"].includes(k))||
    !VALID_ISO3.has(data.origin_country)||
    !VALID_ISO3.has(data.destination_country)||
    data.origin_country===data.destination_country)
  return pause("RESEARCH_COUNTRY_PAIR_INVALID",400);
 const threshold=data.policy_threshold===undefined?70:Number(data.policy_threshold);
 if(!Number.isFinite(threshold)||threshold<50||threshold>85)
  return pause("RESEARCH_THRESHOLD_INVALID",400);
 try{
  const key=await db("rpc/gm_research_stream20m_verifier","POST",{});
  if(!key||key.key_id!==KEY_ID||!key.public_spki_b64)
   return pause("RESEARCH_SIGNING_PUBLIC_KEY_UNAVAILABLE");
  const pub=await crypto.subtle.importKey("spki",unb64(key.public_spki_b64),
   {name:"Ed25519"},false,["verify"]);
  const now=Date.now();
  const [a,b]=await Promise.all([
   signedState(data.origin_country,pub,now),
   signedState(data.destination_country,pub,now)
  ]);
  if(!a||!b)return pause("VERIFIED_SIGNED_RESEARCH_STATE_UNAVAILABLE");
  const max=Math.max(a.score,b.score);
  const decision=max>=85?"PAUSE":max>=threshold?"REQUIRE_APPROVAL":
   max>=50?"REDUCE_LIMIT":"CONTINUE";
  return Response.json({schema:"geomacro.research-corridor-gate.v1",
   ok:true,decision,execution_authorized:false,commercial_eligible:false,
   research_only:true,verification_status:"PROVISIONAL_RESEARCH_ONLY",
   corridor:data.origin_country+"->"+data.destination_country,
   corridor_score:max,
   proof:{origin_signature:a.signature,dest_signature:b.signature,
    origin_sha256:a.sha256,dest_sha256:b.sha256,
    signing_key_id:KEY_ID,verified_at:new Date(now).toISOString()},
   note:"Provisional noncommercial advisory; not independently verified event truth or authority to execute."},
   {status:200,headers:{"Cache-Control":"private, no-store",
    "X-Robots-Tag":"noindex,nofollow",
    "X-Content-Type-Options":"nosniff"}});
 }catch{return pause("RESEARCH_STORE_UNAVAILABLE")}
});
