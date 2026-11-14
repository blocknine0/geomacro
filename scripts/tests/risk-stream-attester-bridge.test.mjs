import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {attestRiskStreamOriginal} from "../../workers/control-plane/src/risk-stream-attester-bridge.mjs";

test("control-plane bridge calls each private service binding with its own bearer and returns both proofs",async()=>{
 const calls=[];
 const candidate={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",proof:null};
 const signature=Buffer.alloc(64).toString("base64");
 const binding=(name,field)=>({async fetch(request){
  const body=await request.json();
  calls.push({name,authorization:request.headers.get("authorization"),body});
  return Response.json({ok:true,proof:{[field]:signature}});
 }});
 const request=new Request("https://control.internal/v1/internal/risk-stream/attest",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft:candidate})
 });
 const response=await attestRiskStreamOriginal(request,{
  RISK_STREAM_FACTS_ATTESTER:binding("facts","facts_signature_b64"),
  RISK_STREAM_RIGHTS_ATTESTER:binding("rights","rights_signature_b64"),
  RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN:"facts-bearer-test-token-0123456789",
  RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN:"rights-bearer-test-token-0123456789"
 });
 assert.equal(response.status,200);
 assert.deepEqual((await response.json()).proof,{
  facts_signature_b64:signature,rights_signature_b64:signature
 });
 assert.deepEqual(calls.map(call=>call.name).sort(),["facts","rights"]);
 assert.notEqual(calls[0].authorization,calls[1].authorization);
 assert.ok(calls.every(call=>call.body.proof===null&&call.body.raw_payload===undefined));
});

test("bridge refuses missing bindings, invalid request, or malformed signatures",async()=>{
 const candidate={schema:"geomacro.risk-stream-candidate.v1",kind:"VERIFIED_ORIGINAL",proof:null};
 const makeRequest=draft=>new Request("https://control.internal/v1/internal/risk-stream/attest",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({schema:"geomacro.risk-stream-attestation-request.v1",draft})
 });
 const absent=await attestRiskStreamOriginal(makeRequest(candidate),{});
 assert.equal(absent.status,503);
 const malformed=await attestRiskStreamOriginal(makeRequest({...candidate,proof:{}}),{});
 assert.equal(malformed.status,400);
 const badSignature=await attestRiskStreamOriginal(makeRequest(candidate),{
  RISK_STREAM_FACTS_ATTESTER:{fetch:async()=>Response.json({ok:true,
   proof:{facts_signature_b64:"bad"}})},
  RISK_STREAM_RIGHTS_ATTESTER:{fetch:async()=>Response.json({ok:true,
   proof:{rights_signature_b64:Buffer.alloc(64).toString("base64")}})},
  RISK_STREAM_FACTS_ATTESTER_BEARER_TOKEN:"facts-bearer-test-token-0123456789",
  RISK_STREAM_RIGHTS_ATTESTER_BEARER_TOKEN:"rights-bearer-test-token-0123456789"
 });
 assert.equal(badSignature.status,502);
});

test("deployed attesters remain private and control-plane bindings target both distinct workers",()=>{
 const facts=JSON.parse(readFileSync(new URL("../../workers/risk-stream-facts-attester/wrangler.jsonc",import.meta.url),"utf8"));
 const rights=JSON.parse(readFileSync(new URL("../../workers/risk-stream-rights-attester/wrangler.jsonc",import.meta.url),"utf8"));
 const control=JSON.parse(readFileSync(new URL("../../workers/control-plane/wrangler.example.jsonc",import.meta.url),"utf8"));
 assert.notEqual(facts.name,rights.name);
 for(const config of [facts,rights]){
  assert.equal(config.workers_dev,false);
  assert.equal(config.preview_urls,false);
  assert.equal(config.routes,undefined);
 }
 const services=new Map(control.services.map(item=>[item.binding,item.service]));
 assert.equal(services.get("RISK_STREAM_FACTS_ATTESTER"),facts.name);
 assert.equal(services.get("RISK_STREAM_RIGHTS_ATTESTER"),rights.name);
 assert.notEqual(services.get("RISK_STREAM_FACTS_ATTESTER"),
  services.get("RISK_STREAM_RIGHTS_ATTESTER"));
});
