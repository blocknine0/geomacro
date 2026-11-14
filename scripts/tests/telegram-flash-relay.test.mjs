import test from "node:test";
import assert from "node:assert/strict";
import {relayTelegramFlashWebhook} from "../../workers/control-plane/src/telegram-flash-relay.mjs";

const URL="https://geomacro-control-plane.example.workers.dev/api/webhooks/telegram-flash";
const SECRET="a".repeat(48);
const env={TELEGRAM_WEBHOOK_SECRET:SECRET,
 TELEGRAM_PRIVATE_WORKER_ORIGIN:"https://geomacro-telegram-signals.account.workers.dev"};
function request(extra={}) {
 return new Request(URL,{method:"POST",headers:{
 "content-type":"application/json","x-telegram-bot-api-secret-token":SECRET,
 ...(extra.headers??{})},body:extra.body??JSON.stringify({
 update_id:8,channel_post:{message_id:5,chat:{type:"channel",username:"newsfeed"},text:"India faces foreign exchange crisis after reserve shortfall"}
 })});
}

test("matching Hot50 risk event is forwarded without persisting or transforming raw post",async()=>{
 let calls=0;
 const out=await relayTelegramFlashWebhook(request(),env,async (url,opts)=>{
   calls++;
   assert.equal(url,"https://geomacro-telegram-signals.account.workers.dev/telegram/webhook");
   assert.equal(opts.headers["x-telegram-bot-api-secret-token"],SECRET);
   assert.equal(JSON.parse(new TextDecoder().decode(opts.body)).channel_post.text,"India faces foreign exchange crisis after reserve shortfall");
   assert.equal(opts.redirect,"manual");
   return Response.json({ok:true,accepted:true,verification_status:"UNVERIFIED",
      commercial_eligible:false});
 });
 assert.equal(out.status,200);
 assert.deepEqual(await out.json(),{ok:true,accepted:true,duplicate:false,ignored:false});
 assert.equal(calls,1);
});
test("non-Hot50, non-risk, and non-channel Telegram updates are dropped before upstream/B2",async()=>{
 let calls=0;const f=async()=>{calls++;return Response.json({ok:true,accepted:true})};
 for(const update of [
  {update_id:1,channel_post:{message_id:1,chat:{type:"channel"},text:"Fiji armed conflict after attack"}},
  {update_id:2,channel_post:{message_id:2,chat:{type:"channel"},text:"India reports a local sports meeting"}},
  {update_id:3,message:{message_id:3,chat:{type:"private"},text:"India foreign exchange crisis"}},
 ]){
  const res=await relayTelegramFlashWebhook(request({body:JSON.stringify(update)}),env,f);
  assert.equal(res.status,200);
  assert.equal((await res.json()).ignored!==false,true);
 }
 assert.equal(calls,0);
});
test("secret and trusted private origin fail closed, never call upstream",async()=>{
 let calls=0;const f=async()=>{calls++;return Response.json({ok:true})};
 for(const [req,config,status] of [
 [request({headers:{"x-telegram-bot-api-secret-token":"wrong"}}),env,401],
 [request(),{...env,TELEGRAM_WEBHOOK_SECRET:""},503],
 [request(),{...env,TELEGRAM_PRIVATE_WORKER_ORIGIN:"https://attacker.invalid"},503],
 [request(),{...env,TELEGRAM_PRIVATE_WORKER_ORIGIN:"http://geomacro-telegram-signals.account.workers.dev"},503],
 ]){
  assert.equal((await relayTelegramFlashWebhook(req,config,f)).status,status);
 }
 assert.equal(calls,0);
});
test("upstream failure or missing durable ACK forces Telegram retry",async()=>{
 for(const reply of [new Response("unavailable",{status:503}),
   Response.json({ok:false}),Response.json({accepted:true})]){
  const res=await relayTelegramFlashWebhook(request(),env,async()=>reply);
  assert.equal(res.status,503);
 }
});
test("missing body, wrong content type or oversized update never get forwarded",async()=>{
 let called=false;const f=async()=>{called=true;return Response.json({ok:true})};
 const wrong=request({headers:{"content-type":"text/plain"}});
 assert.equal((await relayTelegramFlashWebhook(wrong,env,f)).status,415);
 const oversize=request({body:"x".repeat(65537)});
 assert.equal((await relayTelegramFlashWebhook(oversize,env,f)).status,413);
 assert.equal(called,false);
});
