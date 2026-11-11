/**
 * Protected website_intelligence fallback when the HTTP Control Plane POST
 * is held. Cloudflare Queue REST accepts transport only; D1 exact receipt
 * readback is the sole commit proof. No fake scores, raw publisher articles,
 * broad SQL writes, or commercial authorization.
 *
 * Cloudflare API: POST /accounts/{account}/queues/{id}/messages
 * with {content_type:"json",body:queueMessage}.
 */
import {createHash} from "node:crypto";

const HASH=/^[0-9a-f]{64}$/u;
const ACCOUNT=/^[0-9a-f]{32}$/iu;
const QUEUE_ID=/^[0-9a-f]{32}$/iu;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const QUEUE_NAME="geomacro-derived-discovery";
const DLQ_NAME="geomacro-derived-discovery-dlq";
const SCHEMA="geomacro.derived-discovery-queued-ack.v1";
const BODY_SCHEMA="geomacro.derived-risk-discovery-bridge.v1";
const ALLOWED_CONSUMERS=new Set(["geomacro-control-plane","geomacro-derived-discovery-consumer"]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function fail(code){throw Error("DERIVED_DISCOVERY_"+code)}
export function websiteQueueDigest(body){
 return createHash("sha256").update(JSON.stringify(body)).digest("hex");
}
function assertWebsiteBody(body){
 if(body?.schema!==BODY_SCHEMA||body?.lane!=="website_intelligence"||
    !HASH.test(body.page_sha256??"")||
    !Array.isArray(body.reviewed)||body.reviewed.length<1||body.reviewed.length>100||
    body.reviewed.some(x=>!HASH.test(x?.original_ref??"")||
       x.status!=="HOLD_SOURCE_ACCESS_OR_EXPRESSION"||x.commercialEligible!==false)||
    JSON.stringify(body).length>17000)
  fail("DIRECT_QUEUE_UNVERIFIED_BODY");
}
function creds(env){
 const account=String(env?.CLOUDFLARE_ACCOUNT_ID??"");
 const token=String(env?.CLOUDFLARE_API_TOKEN??"");
 const database=String(env?.D1_DATABASE_ID??"");
 if(!ACCOUNT.test(account)||token.length<20||!UUID.test(database)||
    env?.GEOMACRO_DERIVED_DISCOVERY_REST_FALLBACK!=="1")
  fail("DIRECT_QUEUE_PROTECTED_BINDINGS_MISSING");
 return {account,token,database};
}
async function cloudflareCall(url,{method="GET",body,token,fetchImpl=fetch,signal}={}){
 const response=await fetchImpl(url,{
  method,redirect:"error",cache:"no-store",
  headers:{Authorization:"Bearer "+token,Accept:"application/json",
   ...(body?{"Content-Type":"application/json"}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
  signal:signal??AbortSignal.timeout(8000)
 });
 if(response.status!==200)fail("DIRECT_PROVIDER_HTTP_"+response.status);
 let value;
 try{const raw=await response.text();
  if(raw.length>80000)fail("DIRECT_PROVIDER_OVERSIZE");
  value=JSON.parse(raw);
 }catch{fail("DIRECT_PROVIDER_MALFORMED");}
 if(value?.success!==true||value.errors?.length)
  fail("DIRECT_PROVIDER_REJECTED");
 return value.result;
}
export async function verifiedDiscoveryQueue({env=process.env,fetchImpl=fetch}={}){
 const {account,token}=creds(env);
 const base="https://api.cloudflare.com/client/v4/accounts/"+account+"/queues";
 const queueId=String(env.GEOMACRO_DERIVED_DISCOVERY_QUEUE_ID??"");
 let matches;
 if(queueId){
  if(!QUEUE_ID.test(queueId))fail("DIRECT_QUEUE_ID_INVALID");
  const q=await cloudflareCall(base+"/"+queueId,{token,fetchImpl});
  matches=q?.queue_name===QUEUE_NAME?[{...q,queue_id:queueId}]:[];
 }else{
  const list=await cloudflareCall(base+"?per_page=100",{token,fetchImpl});
  if(!Array.isArray(list))fail("DIRECT_QUEUE_LOOKUP_UNVERIFIED");
  matches=list.filter(x=>x.queue_name===QUEUE_NAME);
 }
 if(matches?.length!==1||!QUEUE_ID.test(matches[0].queue_id??""))
  fail("DIRECT_QUEUE_ID_UNVERIFIED");
 const id=matches[0].queue_id;
 // Never enqueue into an unconsumed queue while the live Worker is held.
 const consumers=await cloudflareCall(base+"/"+id+"/consumers",{token,fetchImpl});
 // Cloudflare Queue API may redact the optional script_name field.
 // Never accept an explicitly foreign named consumer, multiple consumers,
 // missing worker type/DLQ, or an unconsumed queue. The exact atomic D1
 // receipt remains mandatory after enqueue; queue transport is not proof.
 if(!Array.isArray(consumers)||consumers.length!==1||
    consumers[0]?.type!=="worker"||
    consumers[0]?.dead_letter_queue!==DLQ_NAME||
    (consumers[0]?.script_name!=null&&
      !ALLOWED_CONSUMERS.has(consumers[0].script_name)))
  fail("DIRECT_QUEUE_CONSUMER_AND_DLQ_UNVERIFIED");
 return {base,id,token};
}
export async function readCommittedWebsiteReceipt(body,{
 env=process.env,fetchImpl=fetch,
}={}){
 assertWebsiteBody(body);
 const {account,token,database}=creds(env);
 const digest=websiteQueueDigest(body);
 const root="https://api.cloudflare.com/client/v4/accounts/"+account;
 const result=await cloudflareCall(root+"/d1/database/"+database+"/query",{
  method:"POST",token,fetchImpl,
  body:{sql:"SELECT digest,lane,page_sha256,admitted FROM derived_discovery_ack_receipts WHERE digest=?",params:[digest]}
 });
 if(!Array.isArray(result)||result.length!==1||!Array.isArray(result[0]?.results)||
    result[0].results.length>1||result[0]?.success===false||
    result[0]?.meta?.rows_written!==0)
  fail("DIRECT_D1_RECEIPT_QUERY_UNVERIFIED");
 if(!result[0].results.length)return null;
 const row=result[0].results[0];
 if(row.digest!==digest||row.lane!=="website_intelligence"||
    row.page_sha256!==body.page_sha256||row.admitted!==body.reviewed.length)
  fail("DIRECT_D1_RECEIPT_MISMATCH");
 return {ok:true,schema:BODY_SCHEMA,lane:"website_intelligence",
  admitted:row.admitted,d1_atomic_readback_verified:true,
  cursor_advanced:true,commercialEligible:false,paidDeliveryAuthorized:false};
}
export async function pollWebsiteReceipt(body,{
 getReceipt,clock=Date.now,sleepFn=sleep,timeoutMs=30000,
}={}){
 if(typeof getReceipt!=="function"||timeoutMs<1||timeoutMs>30000)
  fail("DIRECT_RECEIPT_POLLER_INVALID");
 const deadline=clock()+timeoutMs;
 let first=true;
 for(;;){
  const remaining=deadline-clock();
  if(remaining<=0&&!first)break;
  first=false;
  const committed=await getReceipt();
  if(committed)return committed;
  const left=deadline-clock();
  if(left<=0)break;
  await sleepFn(Math.min(3000,left));
 }
 fail("DIRECT_QUEUE_ACK_PENDING_NOT_D1_COMMITTED");
}
export async function deliverWebsiteViaDirectQueue(body,{
 env=process.env,fetchImpl=fetch,clock=Date.now,sleepFn=sleep,
}={}){
 assertWebsiteBody(body);
 const receipt=await readCommittedWebsiteReceipt(body,{env,fetchImpl});
 if(receipt)return receipt; // Lost HTTP ACK after a durable commit.
 const {base,id,token}=await verifiedDiscoveryQueue({env,fetchImpl});
 const digest=websiteQueueDigest(body);
 const queuedAtMs=clock();
 const packet={schema:SCHEMA,digest,body,
  queued_at:new Date(queuedAtMs).toISOString(),commercialEligible:false,
  paidDeliveryAuthorized:false};
 await cloudflareCall(base+"/"+id+"/messages",{
  method:"POST",token,fetchImpl,
  body:{content_type:"json",body:packet}
 });
 // A successful REST API 200 proves queue acceptance only. Never return
 // an ACK until the separate Queue consumer's D1 transaction is read back.
 const verified=await pollWebsiteReceipt(body,{
  getReceipt:()=>readCommittedWebsiteReceipt(body,{env,fetchImpl}),
  clock,sleepFn,timeoutMs:30000
 });
 // Measured from the Queue submission clock until exact atomic D1 readback.
 // This is a conservative readback latency, NOT an inferred D1 commit time.
 const verifiedAtMs=clock();
 const latencyMs=verifiedAtMs-queuedAtMs;
 if(!Number.isFinite(latencyMs)||latencyMs<0)
  fail("DIRECT_QUEUE_RECEIPT_CLOCK_INVALID");
 return {...verified,
  queue_to_d1_readback_latency_ms:latencyMs,
  atomic_receipt_verified_at:new Date(verifiedAtMs).toISOString()};
}
