import assert from "node:assert/strict";
import {test} from "node:test";
import {classifyDeployedSourceBody} from "./legacy-edge-source-body-format.mjs";
test("accept valid ZIP, JSON files and literal Deno TypeScript",()=>{
 assert.equal(classifyDeployedSourceBody(Buffer.concat([Buffer.from("504b0304","hex"),Buffer.alloc(55)]),"application/zip").kind,"ZIP_ARCHIVE");
 const b=Buffer.from(JSON.stringify({files:[{name:"index.ts",content:'import { serve } from "x"; Deno.serve(()=>new Response("ok"))'}]}));
 assert.equal(classifyDeployedSourceBody(b,"application/json").restorable,true);
 assert.equal(classifyDeployedSourceBody(Buffer.from('import { serve } from "https://deno.land/abc";\nDeno.serve(()=>new Response("ok"));'),"text/plain; charset=utf-8").kind,"RAW_JAVASCRIPT_TYPESCRIPT");
});
test("fail closed on HTML, unexpected JSON, invalid encoding and no source",()=>{
 for(const [buf,mime] of [[Buffer.from("<html><script>alert('credentials')</script></html>"),"text/html"],[Buffer.from(JSON.stringify({error:"private_name_and_key_not_accessible"})),"application/json"],[Buffer.alloc(50),"application/octet-stream"],[Buffer.from("first party source object retrieval not ready"),"text/plain"]]){
  const out=classifyDeployedSourceBody(buf,mime);
  assert.equal(out.restorable,false);
  assert.ok(!JSON.stringify(out).includes("credentials"));
  assert.ok(!JSON.stringify(out).includes("private_name_and_key"));
 }
});
