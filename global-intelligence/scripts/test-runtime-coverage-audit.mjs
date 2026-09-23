import { probeSource } from "../health/source-health.mjs";

const originalFetch=globalThis.fetch;
try{
  globalThis.fetch=async()=>new Response("{}",{status:200});
  if((await probeSource({sourceId:"test",category:"MACRO",url:"https://example.test",validate:()=>true})).status!=="PASS") throw new Error("PASS failed");
  globalThis.fetch=async()=>new Response("",{status:429});
  if((await probeSource({sourceId:"test",category:"MACRO",url:"https://example.test"})).status!=="DEGRADED") throw new Error("DEGRADED failed");
  globalThis.fetch=async()=>new Response("",{status:403});
  if((await probeSource({sourceId:"test",category:"MACRO",url:"https://example.test"})).status!=="AUTH_REQUIRED") throw new Error("AUTH_REQUIRED failed");
  console.log("Runtime coverage health classification PASS");
}finally{globalThis.fetch=originalFetch;}
