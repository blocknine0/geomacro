#!/usr/bin/env node
import {appendFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";

const fail=code=>{throw Error("RISK_STREAM_QUEUE_PROVIDER_"+code)};
const QUEUE_ID=/^[a-f0-9]{32}$/iu;
const canon=value=>JSON.stringify(value);

export async function verifyRiskStreamQueueProvider({
 accountId,token,fetchImpl=fetch,now=()=>Date.now()
}={}){
 if(!/^[a-f0-9]{32}$/iu.test(String(accountId??""))||
    typeof token!=="string"||token.length<32)
  fail("AUTH_MISSING");
 const root="https://api.cloudflare.com/client/v4/accounts/"+
  encodeURIComponent(accountId)+"/queues";
 const get=async path=>{
  let response,body;
  try{
   response=await fetchImpl(root+path,{method:"GET",redirect:"error",
    headers:{Authorization:"Bearer "+token,Accept:"application/json"},
    signal:AbortSignal.timeout(15000)});
   body=await response.json();
  }catch{fail("READBACK_UNAVAILABLE")}
  if(!response.ok||body?.success!==true)fail("READBACK_FAILED");
  return body;
 };
 const queues=[];
 let totalPages=null;
 for(let page=1;page<=100;page++){
  const body=await get("?page="+page+"&per_page=100");
  if(!Array.isArray(body.result)||!Number.isSafeInteger(body.result_info?.total_pages)||
     body.result_info.total_pages<1||body.result_info.total_pages>100)
   fail("QUEUE_PAGE_RESPONSE_INVALID");
  if(totalPages===null)totalPages=body.result_info.total_pages;
  if(body.result_info.total_pages!==totalPages||
     (body.result_info.page!==undefined&&body.result_info.page!==page))
   fail("QUEUE_PAGE_SET_CHANGED");
  queues.push(...body.result);
  if(page===totalPages)break;
 }
 const matches=queues.filter(queue=>queue?.queue_name==="geomacro-risk-stream");
 if(matches.length!==1||!QUEUE_ID.test(matches[0]?.queue_id??""))
  fail("ID_UNVERIFIED");
 const listed=matches[0],queueId=listed.queue_id;
 const detailBody=await get("/"+encodeURIComponent(queueId));
 const queue=detailBody.result;
 if(queue?.queue_id!==queueId||queue?.queue_name!=="geomacro-risk-stream")
  fail("QUEUE_ID_READBACK_MISMATCH");
 const producers=Array.isArray(queue.producers)?queue.producers:[];
 if(!producers.some(item=>item?.type==="worker"&&
    item?.script==="geomacro-control-plane"))
  fail("PRODUCER_BINDING_UNVERIFIED");
 const consumerBody=await get("/"+encodeURIComponent(queueId)+"/consumers");
 const consumers=consumerBody.result;
 const consumer=Array.isArray(consumers)&&consumers.length===1?consumers[0]:null;
 if(consumer?.type!=="worker"||consumer?.script_name!=="geomacro-control-plane"||
    consumer?.queue_name!=="geomacro-risk-stream"||
    consumer?.dead_letter_queue!=="geomacro-risk-stream-dlq"||
    consumer?.settings?.batch_size!==10||consumer?.settings?.max_retries!==8)
  fail("CONSUMER_BINDING_UNVERIFIED");
 const snapshot={schema:"geomacro.risk-stream-queue-provider-receipt.v1",
  queue_name:queue.queue_name,queue_id:queue.queue_id,
  producer_script:"geomacro-control-plane",
  consumer_id:consumer.consumer_id??null,consumer_script:consumer.script_name,
  dead_letter_queue:consumer.dead_letter_queue,
  settings:{batch_size:consumer.settings.batch_size,max_retries:consumer.settings.max_retries},
  verified_at:new Date(now()).toISOString()};
 const receipt_sha256=createHash("sha256").update(canon(snapshot)).digest("hex");
 return {...snapshot,receipt_sha256};
}

async function main(){
 const receipt=await verifyRiskStreamQueueProvider({
  accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
  token:process.env.CLOUDFLARE_API_TOKEN
 });
 const output=process.env.GITHUB_OUTPUT;
 if(!output)fail("GITHUB_OUTPUT_MISSING");
 appendFileSync(output,"verified=true\nqueue_id="+receipt.queue_id+
  "\nreceipt_sha256="+receipt.receipt_sha256+"\n");
 console.log(JSON.stringify({status:"PASS",schema:receipt.schema,
  queue_name:receipt.queue_name,queue_id:receipt.queue_id,
  consumer_id:receipt.consumer_id,consumer_script:receipt.consumer_script,
  settings:receipt.settings,receipt_sha256:receipt.receipt_sha256}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(error=>{console.error(String(error?.message??"RISK_STREAM_QUEUE_PROVIDER_FAILED").slice(0,120));process.exitCode=2});
