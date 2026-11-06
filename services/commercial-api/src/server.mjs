import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { pool } from './db.mjs';
import { configurePayments } from './payments/config.mjs';
// Existing GeoMacro evidence resolver can be supplied as a backend-only module
// exporting resolveRisk({subject,tier,signal}). No sample fallback is installed.
let resolveRisk;
if(process.env.RISK_RESOLVER_MODULE){({resolveRisk}=await import(pathToFileURL(process.env.RISK_RESOLVER_MODULE).href));
 if(typeof resolveRisk!=='function')throw new Error('RISK_RESOLVER_MODULE must export resolveRisk');}
const {handle}=configurePayments(pool,process.env,{resolveRisk});
const server=createServer(async(req,res)=>{
 const controller=new AbortController();res.on('close',()=>{if(!res.writableFinished)controller.abort();});
 try{
  if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400).end();return;}
  let length=0;const chunks=[];
  for await(const chunk of req){length+=chunk.length;if(length>65536){res.writeHead(413).end();return;}chunks.push(chunk);}
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers)){
   if(Array.isArray(value))headers.set(key,value.join(','));else if(value!==undefined)headers.set(key,value);
  }
  const request=new Request(new URL(req.url,process.env.SITE_ORIGIN),{method:req.method,headers,signal:controller.signal,
   ...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
  const response=await handle(request);
  if(!res.destroyed){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
 }catch{if(!res.destroyed)res.writeHead(503,{'Content-Type':'application/json'}).end('{"error":"PAYMENT_SERVICE_UNAVAILABLE"}');}
});
server.requestTimeout=60_000;server.headersTimeout=15_000;
server.listen(Number(process.env.PORT??3000),'127.0.0.1',()=>console.log('GeoMacro payment service listening'));
let stopping=false;
for(const event of ['SIGTERM','SIGINT'])process.on(event,()=>{if(stopping)return;stopping=true;
 server.close(async()=>{await pool.end();});setTimeout(()=>process.exit(1),10_000).unref();});
