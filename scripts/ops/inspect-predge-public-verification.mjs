#!/usr/bin/env node
// Read-only diagnostic for Amir's public Predge verification contract.
// Outputs ONLY field paths/types, fixed-size public markdown excerpts,
// HTTP status + SHA256; no bearer, credentials, record bodies or payments.
// No fallback to arbitrary hosts, no redirects, no remote code execution.
import {createHash} from "node:crypto";
const sources=[
 ["canonicalization","https://data.predge.io/canonicalization.md"],
 ["keys","https://api.predge.io/.well-known/predge-keys.json"],
 ["market","https://api.predge.io/v1/settlement-risk/5710779"],
 ["verifier","https://data.predge.io/verify_record.py"],
];
const hash=b=>createHash("sha256").update(b).digest("hex");
function paths(value,prefix="",depth=0,out=[]){
 if(out.length>125||depth>5)return out;
 if(Array.isArray(value)){
  out.push(prefix+"[]:"+value.length);
  if(value.length)paths(value[0],prefix+"[0].",depth+1,out);
 }else if(value&&typeof value==="object"){
  for(const [k,v] of Object.entries(value).slice(0,65)){
   if(out.length>125)break;
   const key=prefix+k;
   if(/secret|private|password|access_token/i.test(key)){out.push(key+":REDACTED");continue;}
   out.push(key+":"+(v===null?"null":Array.isArray(v)?"array":typeof v));
   if(v&&typeof v==="object")paths(v,key+".",depth+1,out);
  }
 }
 return out;
}
for(const [name,url] of sources){
 try{
  const r=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(17000),
   headers:{"accept":"application/json, text/plain, text/markdown;q=0.8, */*;q=0.1"}});
  const t=r.headers.get("content-type")??"";
  if(r.status>=300&&r.status<400)throw Error("REDIRECT_FORBIDDEN");
  const bytes=Buffer.from(await r.arrayBuffer());
  if(bytes.length>256*1024)throw Error("OVERSIZED");
  const result={source:name,status:r.status,content_type:t.split(";")[0],bytes:bytes.length,sha256:hash(bytes)};
  if(r.ok&&name==="canonicalization"){
   const text=bytes.toString("utf8");
   const lines=text.split(/\r?\n/);
   result.h2_sections=lines.filter(x=>/^#{1,4} /u.test(x)).slice(0,35).map(x=>x.slice(0,170));
   // Public documentation sections requested by Amir; max 3800 chars
   // of the contract printed, no data rows or secrets.
   for(const section of ["2","5","5a","5b"]){
    const i=lines.findIndex(x=>new RegExp("^#{1,4}\\s+"+section+"(?:\\b|[.:])","i").test(x));
    if(i>=0)result["section_"+section]=lines.slice(i,i+50).join("\n").slice(0,3800);
   }
  }else if(r.ok&&name==="keys"||r.ok&&name==="market"){
   let parsed;try{parsed=JSON.parse(bytes.toString("utf8"))}catch{throw Error("INVALID_JSON")}
   result.paths=paths(parsed);
   if(name==="market"){result.top_level_keys=Object.keys(parsed);result.attestation_keys=Object.keys(parsed.attestation??{});result.attestation_payload_keys=Object.keys(parsed.attestation?.payload??{});result.signature_headers={body_signature:r.headers.has("x-predge-body-signature"),body_sha256:r.headers.has("x-predge-body-sha256")};}
   if(name==="keys")result.key_statuses=parsed.keys?.map(k=>({kid:k.kid,algorithm:k.algorithm,role:k.role,active:k.active,status:k.status,public_key:k.public_key}));
   // No full signed market copied. Capture small safe public algorithm hints.
   if(name==="keys")result.status_labels=JSON.stringify(parsed).match(/"status"\s*:\s*"(?:active|retired|revoked)"/g)?.slice(0,18)??[];
  }else if(r.ok&&name==="verifier"){
   const body=bytes.toString("utf8");
   result.functions=body.split(/\r?\n/).filter(l=>/^def |^class |^async def /u.test(l)).slice(0,45);
  }
  console.log(JSON.stringify(result));
 }catch(e){
  const code=String(e?.message??"");
  console.log(JSON.stringify({source:name,status:"UNAVAILABLE",reason:/^(?:OVERSIZED|REDIRECT_FORBIDDEN|INVALID_JSON)$/.test(code)?code:"FETCH_ERROR"}));
 }
}
