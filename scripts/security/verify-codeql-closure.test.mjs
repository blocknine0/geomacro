import test from "node:test";
import assert from "node:assert/strict";
import {verifyCodeqlClosure, REMEDIATED_ALERT_NUMBERS,
  CODEQL_REPOSITORY} from "./verify-codeql-closure.mjs";

const SHA="a".repeat(40),TOKEN="test-not-a-real-token".repeat(4);
function fixture({analysisSha=SHA,states={},status=200}={}) {
 const calls=[];
 const fetchImpl=async(url,options)=>{
  const u=new URL(url);calls.push(u.pathname+u.search);
  assert.equal(u.protocol,"https:");
  assert.equal(u.hostname,"api.github.com");
  assert.equal(u.pathname.startsWith("/repos/"+CODEQL_REPOSITORY+"/code-scanning/"),true);
  assert.equal(options.redirect,"error");
  assert.equal(options.headers.Authorization,"Bearer "+TOKEN);
  if(status!==200)return Response.json({message:"not allowed"},{status});
  if(u.pathname.endsWith("/analyses"))
   return Response.json([{commit_sha:analysisSha,ref:"refs/heads/main",
     tool:{name:"CodeQL"},error:""}]);
  const n=Number(u.pathname.split("/").at(-1));
  assert.ok(REMEDIATED_ALERT_NUMBERS.includes(n));
  return Response.json({number:n,state:states[n]??"fixed",
    rule:{id:n===107?"js/double-escaping":"js/incomplete-url-substring-sanitization"},
    most_recent_instance:{location:{path:"scripts/lib/test.mjs"}}});
 };
 return {fetchImpl,calls};
}
test("three actual fixed alerts after analysis of exact main SHA yield acceptance",async()=>{
 const {fetchImpl,calls}=fixture();
 const proof=await verifyCodeqlClosure({token:TOKEN,sha:SHA,fetchImpl,
   pause:async()=>{},maxPolls:1});
 assert.equal(proof.ok,true);
 assert.equal(proof.analysis_verified,true);
 assert.equal(proof.fixed,3);
 assert.equal(proof.open,0);
 assert.equal(proof.dismissed,0);
 assert.deepEqual(proof.alerts.map(a=>a.number),[107,115,120]);
 assert.equal(calls.length,4);
});
test("unfixed alert never passes after bounded checks",async()=>{
 const {fetchImpl}=fixture({states:{120:"open"}});
 await assert.rejects(verifyCodeqlClosure({token:TOKEN,sha:SHA,fetchImpl,
   pause:async()=>{},maxPolls:2}),/CODEQL_ALERTS_STILL_OPEN_120/);
});
test("a dismissed alert is never confused with remediated code",async()=>{
 const {fetchImpl}=fixture({states:{107:"dismissed"}});
 await assert.rejects(verifyCodeqlClosure({token:TOKEN,sha:SHA,fetchImpl,
   pause:async()=>{},maxPolls:1}),/CODEQL_ALERT_DISMISSED_NOT_FIXED/);
});
test("stale main analysis cannot certify fixed alert states",async()=>{
 const {fetchImpl,calls}=fixture({analysisSha:"b".repeat(40)});
 await assert.rejects(verifyCodeqlClosure({token:TOKEN,sha:SHA,fetchImpl,
   pause:async()=>{},maxPolls:2}),/CODEQL_MAIN_SHA_ANALYSIS_NOT_PROCESSED/);
 assert.equal(calls.length,2);
});
test("permission failure is an explicit red check",async()=>{
 const {fetchImpl}=fixture({status:403});
 await assert.rejects(verifyCodeqlClosure({token:TOKEN,sha:SHA,fetchImpl,
   pause:async()=>{},maxPolls:1}),/CODEQL_SECURITY_API_HTTP_403/);
});
test("invalid scope or token is refused before any API request",async()=>{
 await assert.rejects(verifyCodeqlClosure({repo:"untrusted/other",
   token:TOKEN,sha:SHA,fetchImpl:async()=>{throw Error("must not call")}}),
 /CODEQL_CLOSURE_INPUT_INVALID/);
});
