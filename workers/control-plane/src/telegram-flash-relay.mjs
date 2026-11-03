/**
 * HTTPS ingress for publisher-consented Telegram Bot channel_post delivery.
 * It does not read, log, classify, store, or commercialize Telegram content.
 * Existing private geomacro-telegram-signals Worker performs authorization,
 * source-specific permission checks, keyword routing and D1 readback.
 */
const HEADER = "x-telegram-bot-api-secret-token";
const SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/u;
const MAX_UPDATE_BYTES = 64 * 1024;
const ORIGIN_RE = /^geomacro-telegram-signals\.[a-z0-9-]+\.workers\.dev$/u;

const reply = (status, code) => Response.json(
  {ok: status===200, code},
  {status, headers: {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}
);

function fixedTimeEqual(a, b) {
  if (!SECRET_RE.test(a)||!SECRET_RE.test(b)||a.length!==b.length) return false;
  let different=0;
  for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);
  return different===0;
}

function privateWorkerOrigin(value) {
  try {
    const url=new URL(value);
    if(url.protocol!=="https:"||!ORIGIN_RE.test(url.hostname)||
       url.username||url.password||url.port||url.search||url.hash||
       (url.pathname!=="/"&&url.pathname!==""))return null;
    return url.origin;
  } catch { return null; }
}

async function boundedBody(request) {
  const length=Number(request.headers.get("content-length")||0);
  if(!Number.isFinite(length)||length<0||length>MAX_UPDATE_BYTES)
    throw Error("TELEGRAM_UPDATE_OVERSIZED");
  if(!request.body)throw Error("TELEGRAM_UPDATE_BODY_MISSING");
  const reader=request.body.getReader();
  const chunks=[];let lengthRead=0;
  try {
    for(;;){
      const part=await reader.read();
      if(part.done)break;
      lengthRead+=part.value.byteLength;
      if(lengthRead>MAX_UPDATE_BYTES)throw Error("TELEGRAM_UPDATE_OVERSIZED");
      chunks.push(part.value);
    }
  } finally {
    try {await reader.cancel()}catch{}
    reader.releaseLock();
  }
  if(lengthRead===0)throw Error("TELEGRAM_UPDATE_BODY_MISSING");
  const bytes=new Uint8Array(lengthRead);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return bytes;
}

export async function relayTelegramFlashWebhook(request,env,forward=fetch) {
  const u=new URL(request.url);
  if(request.method!=="POST"||u.pathname!=="/api/webhooks/telegram-flash"||
     u.search)return reply(404,"NOT_FOUND");
  const expected=String(env?.TELEGRAM_WEBHOOK_SECRET??"");
  const origin=privateWorkerOrigin(env?.TELEGRAM_PRIVATE_WORKER_ORIGIN);
  if(!SECRET_RE.test(expected)||!origin)return reply(503,"TELEGRAM_FLASH_UPSTREAM_UNCONFIGURED");
  const received=String(request.headers.get(HEADER)??"");
  if(!fixedTimeEqual(received,expected))return reply(401,"UNAUTHORIZED");
  if(!/^application\/json(?:\s*;|\s*$)/iu.test(request.headers.get("content-type")??""))
    return reply(415,"UNSUPPORTED_MEDIA_TYPE");
  let body;
  try {body=await boundedBody(request)}
  catch{return reply(413,"INVALID_TELEGRAM_UPDATE_SIZE")}
  try {
    const response=await forward(origin+"/telegram/webhook",{
      method:"POST",redirect:"manual",
      headers:{"content-type":"application/json",[HEADER]:received},
      body,signal:AbortSignal.timeout(8000),
    });
    if(response.status!==200)return reply(503,"TELEGRAM_UPSTREAM_UNAVAILABLE");
    const ack=await response.json().catch(()=>null);
    if(ack?.ok!==true)return reply(503,"TELEGRAM_UPSTREAM_UNCONFIRMED");
    // Only report private Worker admission, never convert a Telegram
    // acknowledgement to verified news or a paid-product authorization.
    return Response.json({ok:true,accepted:ack.accepted===true,
      duplicate:ack.duplicate===true,ignored:typeof ack.ignored==="string"},
      {status:200,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
  } catch {
    // Telegram retries unsuccessful webhook deliveries. Do not claim success.
    return reply(503,"TELEGRAM_UPSTREAM_UNAVAILABLE");
  }
}
