// Zoho Mail OAuth read-only discovery of official maritime subscription emails.
// This is PRIVATE source intake; no raw email, customer output, or incident proof.
import {createHash} from "node:crypto";
const DATA_CENTRES=Object.freeze({
 us:["https://accounts.zoho.com","https://mail.zoho.com"],
 in:["https://accounts.zoho.in","https://mail.zoho.in"],
 eu:["https://accounts.zoho.eu","https://mail.zoho.eu"],
 au:["https://accounts.zoho.com.au","https://mail.zoho.com.au"],
 jp:["https://accounts.zoho.jp","https://mail.zoho.jp"]
});
const MAX_RESPONSE_BYTES=192*1024;
export const MARAD_SUBSCRIPTION_MAILBOX="contact@geomacro.live";
const MAX_HEADERS=3;
const LAST_HOURS=72;
const ROUTES=Object.freeze([
 ["strait_of_hormuz",["hormuz","persian gulf","gulf of oman"]],
 ["bab_el_mandeb",["bab el mandeb","bab al mandeb","red sea"]],
 ["gulf_of_aden_somali_basin",["gulf of aden","somali basin"]],
 ["black_sea_grain_kerch",["black sea","kerch"]],
 ["suez_canal",["suez canal"]],
 ["strait_of_malacca",["malacca"]]
]);
const sha=x=>createHash("sha256").update(x).digest("hex");
export function validateZohoMaritimeConfig(env){
 const get=k=>String(env[k]??"").trim();
 const required=["ZOHO_MAIL_CLIENT_ID","ZOHO_MAIL_CLIENT_SECRET","ZOHO_MAIL_REFRESH_TOKEN",
                 "ZOHO_MAIL_ACCOUNT_ID","ZOHO_MAIL_FOLDER_ID"];
 if(required.some(k=>!get(k)))return {ready:false,status:"ZOHO_OAUTH_SETUP_REQUIRED"};
 const region=get("ZOHO_MAIL_REGION")||"in";
 if(region!=="in"||!Object.hasOwn(DATA_CENTRES,region))throw Error("ZOHO_REGION_NOT_ALLOWED");
 const accountId=get("ZOHO_MAIL_ACCOUNT_ID"),folderId=get("ZOHO_MAIL_FOLDER_ID");
 if(!/^\d{5,26}$/u.test(accountId)||!/^\d{5,26}$/u.test(folderId))
   throw Error("ZOHO_MAIL_ID_INVALID");
 const ukmto=get("ZOHO_UKMTO_APPROVED_SENDER").toLowerCase();
 if(ukmto && !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/u.test(ukmto))
   throw Error("UKMTO_APPROVED_SENDER_INVALID");
 return {ready:true,status:"CONFIGURED",region,accountId,folderId,
  expectedMailbox:MARAD_SUBSCRIPTION_MAILBOX,
  clientId:get("ZOHO_MAIL_CLIENT_ID"),clientSecret:get("ZOHO_MAIL_CLIENT_SECRET"),
  refreshToken:get("ZOHO_MAIL_REFRESH_TOKEN"),ukmtoSender:ukmto};
}
async function limitedJson(response,label){
 if(!response.ok)throw Error(label+"_HTTP_"+(response.status===429?"RATE_LIMIT":
   [401,403].includes(response.status)?"DENIED":"UNAVAILABLE"));
 if(Number(response.headers.get("content-length")||0)>MAX_RESPONSE_BYTES)throw Error(label+"_BODY_LIMIT");
 if(!response.body)throw Error(label+"_EMPTY");
 const reader=response.body.getReader();let total=0;const parts=[];
 try{for(;;){
  const {done,value}=await reader.read();if(done)break;
  total+=value.byteLength;if(total>MAX_RESPONSE_BYTES)throw Error(label+"_BODY_LIMIT");
  parts.push(value);
 }}finally{try{await reader.cancel()}catch{}reader.releaseLock()}
 const b=new Uint8Array(total);let i=0;
 for(const p of parts){b.set(p,i);i+=p.length}
 try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(b))}
 catch{throw Error(label+"_JSON_INVALID")}
}
function sourceFor(from,config){
 if(typeof from!=="string")return null;
 const value=from.trim().toLowerCase();
 if(value==="marad@info.dot.gov")return "marad_advisories";
 if(config.ukmtoSender && value===config.ukmtoSender)return "ukmto";
 return null;
}
export function summarizeZohoMaritimeMessages(messages,headerMap,config,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||!Array.isArray(messages)||
    messages.length>20)throw Error("ZOHO_MESSAGE_LIST_INVALID");
 const seen=new Set(),candidates=[],counts={marad_advisories:0,ukmto:0};
 for(const m of messages){
  const id=String(m?.messageId??"");
  const family=sourceFor(m?.fromAddress,config);
  const received=Number(m?.receivedTime);
  if(!family||!/^\d{8,26}$/u.test(id)||seen.has(id)||
    !Number.isSafeInteger(received)||received>now.getTime()+60_000||
    now.getTime()-received>LAST_HOURS*3_600_000)continue;
  seen.add(id);
  const header=headerMap[id];
  // Sender from list can be spoofed. Require retrieved header provenance
  // before even producing an untrusted discovery lead.
  if(typeof header!=="string"||header.length>16000||
     !/^from:/imu.test(header)||!/^date:/imu.test(header))continue;
  const senderHeader=header.match(/^from:\s*(.*)$/imu)?.[1]??"";
  if(!senderHeader.toLowerCase().includes(m.fromAddress.toLowerCase()))continue;
  const subject=String(m.subject??"").slice(0,300).toLowerCase();
  const routes=ROUTES.filter(([,tokens])=>tokens.some(token=>subject.includes(token)))
                     .map(([name])=>name);
  counts[family]++;
  candidates.push({
    source_family:family,
    // One-way digest with neither provider item ID nor raw title exposed.
    private_dedupe_sha256:sha(family+":"+id),
    delivery_day:new Date(received).toISOString().slice(0,10),
    candidate_corridor_ids:routes,
    sender_header_present:true,
    // DKIM/SPF auth results cannot be reliably independently verified from a
    // forwarded message or a retrieved string alone.
    publisher_authentication_verified:false,
    issuer_original_announcement_verified:false,
    independent_maritime_incident_verified:false,
    commercial_reuse_rights_verified:false
  });
 }
 return {
  schema:"geomacro.zoho-maritime-subscription-private-candidates.v1",
  checked_at:now.toISOString(),status:candidates.length?
    "UNVERIFIED_OFFICIAL_MAIL_CANDIDATES":"NO_QUALIFIED_MAIL_HEADER_CANDIDATES",
  subscriptions_configured:["marad_advisories",...(config.ukmtoSender?["ukmto"]:[])],
  subscribed_mailboxes_probed:1,
  candidate_counts:counts,leads:candidates,
  auth_headers_inspected:candidates.length,
  paid_partner_delivery_enabled:false,
  signed_event_generated:false,raw_emails_stored:false,
  source_article_urls_exposed:false,d1_writes:0,b2_requests:0,
  supabase_requests:0,payments:0
 };
}
export async function observeZohoMaritime({env=process.env,fetchImpl=fetch,now=new Date()}={}){
 const cfg=validateZohoMaritimeConfig(env);
 if(!cfg.ready)return {schema:"geomacro.zoho-maritime-subscription-private-candidates.v1",
   status:cfg.status,configured:false,external_calls:0,
   ukmto_sender_ready:false,paid_partner_delivery_enabled:false,payments:0};
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw Error("ZOHO_CLOCK_INVALID");
 const [accountRoot,mailRoot]=DATA_CENTRES[cfg.region];
 const body=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,
   refresh_token:cfg.refreshToken,grant_type:"refresh_token"});
 const tokenRes=await fetchImpl(accountRoot+"/oauth/v2/token",{
  method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),
  headers:{"content-type":"application/x-www-form-urlencoded"},body
 });
 const token=(await limitedJson(tokenRes,"ZOHO_OAUTH")).access_token;
 if(typeof token!=="string"||token.length<12||token.length>2048)throw Error("ZOHO_OAUTH_NO_TOKEN");
 const headers={authorization:"Zoho-oauthtoken "+token,accept:"application/json"};
 // Bind the OAuth account ID to the subscriber mailbox BEFORE listing any
 // messages. Prevent an accidentally pasted ID from reading another inbox.
 const account=await limitedJson(await fetchImpl(mailRoot+"/api/accounts/"+cfg.accountId,{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),headers
 }),"ZOHO_ACCOUNT");
 const address=String(account?.data?.primaryEmailAddress??account?.data?.mailboxAddress??"").trim().toLowerCase();
 if(Number(account?.status?.code)!==200||address!==cfg.expectedMailbox)
   throw Error("ZOHO_MAILBOX_IDENTITY_MISMATCH");
 const listUrl=new URL(mailRoot+"/api/accounts/"+cfg.accountId+"/messages/view");
 for(const [k,v] of Object.entries({folderId:cfg.folderId,start:"1",limit:"20",
        status:"all",sortBy:"date",sortorder:"false"}))listUrl.searchParams.set(k,v);
 let apiCalls=3;
 const list=await limitedJson(await fetchImpl(listUrl.href,{
  method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),headers
 }),"ZOHO_LIST");
 if(Number(list?.status?.code)!==200 || !Array.isArray(list?.data)||
    list.data.length>20)throw Error("ZOHO_LIST_SHAPE_INVALID");
 const selected=list.data.filter(x=>sourceFor(x?.fromAddress,cfg)&&
   /^\d{8,26}$/u.test(String(x?.messageId??"")) &&
   Number(x.receivedTime)<=now.getTime()+60_000 &&
   now.getTime()-Number(x.receivedTime)<=LAST_HOURS*3_600_000).slice(0,MAX_HEADERS);
 const headerMap={};
 for(const m of selected){
  const url=mailRoot+"/api/accounts/"+cfg.accountId+"/folders/"+cfg.folderId+
    "/messages/"+m.messageId+"/header?raw=true";
  const result=await limitedJson(await fetchImpl(url,{
   method:"GET",redirect:"error",signal:AbortSignal.timeout(10000),headers
  }),"ZOHO_HEADER");
  apiCalls++;
  if(Number(result?.status?.code)===200 &&
     typeof result?.data?.headerContent==="string")
    headerMap[String(m.messageId)]=result.data.headerContent;
 }
 return {...summarizeZohoMaritimeMessages(list.data,headerMap,cfg,now),
   external_calls:apiCalls,ukmto_sender_ready:!!cfg.ukmtoSender,configured:true,
   mailbox_identity_verified:true};
}
