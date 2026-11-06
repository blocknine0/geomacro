import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {normalizeUnifiedIngestorHealthUrl,pingUnifiedIngestorHealth}
 from "../../workers/control-plane/src/unified-ingestor-keepalive.mjs";

const endpoint="https://geomacro-unified-ingestor.onrender.com/healthz";

test("only an HTTPS Render healthz URL is accepted",()=>{
 assert.equal(normalizeUnifiedIngestorHealthUrl(endpoint),endpoint);
 for(const value of [
  "http://geomacro-unified-ingestor.onrender.com/healthz",
  "https://geomacro-unified-ingestor.onrender.com/health",
  "https://geomacro-unified-ingestor.onrender.com/healthz?token=secret",
  "https://geomacro-unified-ingestor.onrender.com.attacker.invalid/healthz",
  "https://geomacro-unified-ingestor.onrender.com:444/healthz",
  "https://user:pass@geomacro-unified-ingestor.onrender.com/healthz",
  "not a url",
 ])assert.equal(normalizeUnifiedIngestorHealthUrl(value),null,value);
});

test("unset URL is inert and makes no network call",async()=>{
 let calls=0;
 assert.deepEqual(await pingUnifiedIngestorHealth({}, {fetchImpl:async()=>{calls++}}),
  {ok:true,skipped:true,reason:"HEALTH_URL_NOT_CONFIGURED"});
 assert.equal(calls,0);
});

test("health ping accepts only the expected minimal service acknowledgement",async()=>{
 let called;
 const result=await pingUnifiedIngestorHealth({GEOMACRO_UNIFIED_INGESTOR_HEALTH_URL:endpoint},
  {fetchImpl:async(url,options)=>{called={url,options};return Response.json({
   ok:true,service:"geomacro-unified-ingestor"});}});
 assert.deepEqual(result,{ok:true,status:200});
 assert.equal(called.url,endpoint);
 assert.equal(called.options.method,"GET");
 assert.equal(called.options.redirect,"manual");
 assert.equal(called.options.headers.Accept,"application/json");
});

test("HTTP failures and invalid acknowledgements are held without body or URL leakage",async()=>{
 const env={GEOMACRO_UNIFIED_INGESTOR_HEALTH_URL:endpoint};
 assert.deepEqual(await pingUnifiedIngestorHealth(env,{fetchImpl:async()=>new Response("private",{status:503})}),
  {ok:false,error:"INGESTOR_HEALTH_HTTP_UNAVAILABLE",status:503});
 assert.deepEqual(await pingUnifiedIngestorHealth(env,{fetchImpl:async()=>Response.json({
  ok:true,service:"other-service"})}),
  {ok:false,error:"INGESTOR_HEALTH_ACK_INVALID",status:200});
 assert.deepEqual(await pingUnifiedIngestorHealth(env,{fetchImpl:async()=>{throw Error("secret-url")}}),
  {ok:false,error:"INGESTOR_HEALTH_PING_UNAVAILABLE"});
});

test("existing one-minute control-plane cron pings only every ten minutes when configured",async()=>{
 const source=await readFile("workers/control-plane/src/index.mjs","utf8");
 assert.match(source,/GEOMACRO_UNIFIED_INGESTOR_HEALTH_URL&&utc\.getUTCMinutes\(\)%10===4/u);
 assert.match(source,/pingUnifiedIngestorHealth\(env\)/u);
});
