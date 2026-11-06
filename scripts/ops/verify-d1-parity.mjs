#!/usr/bin/env node
/**
 * Fail-closed Phase 1 release parity check.
 *
 * Run only from a checkout of current main after the control-plane deployment.
 * Requires the live Worker /health response to expose both its source SHA and
 * the independently reviewed account-wide governor state. Missing fields,
 * stale checkouts, network errors, and false flags are failures.
 *
 * Emits only non-secret hashes and decision metadata; never logs tokens or the
 * complete provider responses.
 */
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";

const SHA40=/^[a-f0-9]{40}$/u;
const DEFAULT_HEALTH_URL="https://geomacro-control-plane.daspallab202391.workers.dev/health";
const MAX_BODY=32_000;
const fail=code=>{throw Error("D1_PARITY_"+code)};
const hash=value=>createHash("sha256").update(value).digest("hex");

async function readBounded(url){
 let response;
 try{
  response=await fetch(url,{method:"GET",redirect:"error",cache:"no-store",
   headers:{Accept:"application/json","Cache-Control":"no-store"},
   signal:AbortSignal.timeout(12_000)});
 }catch{fail("PROVIDER_UNAVAILABLE")}
 if(!response||response.status!==200)fail("PROVIDER_HTTP_STATUS");
 const declared=response.headers?.get("content-length");
 if(declared!==null&&declared!==undefined&&
   (!/^\d+$/u.test(declared)||Number(declared)>MAX_BODY))fail("RESPONSE_OVERSIZE");
 let raw;
 try{raw=await response.text()}catch{fail("BODY_READ_FAILED")}
 if(Buffer.byteLength(raw,"utf8")>MAX_BODY)fail("RESPONSE_OVERSIZE");
 let data;
 try{data=JSON.parse(raw)}catch{fail("JSON_INVALID")}
 if(!data||typeof data!=="object"||Array.isArray(data))fail("DOCUMENT_INVALID");
 return {data,sha256:hash(raw)};
}

function git(args){
 try{return execFileSync("git",args,{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:20_000}).trim()}
 catch(error){
  if(error instanceof Error&&error.message.startsWith("D1_PARITY_"))throw error;
  fail("GIT_READ_FAILED");
 }
}
try{
 execFileSync("git",["fetch","--no-tags","--depth=1","origin","refs/heads/main"],{
  stdio:"ignore",timeout:20_000,
 });
}catch{fail("MAIN_REF_UNAVAILABLE")}
const mainSha=git(["rev-parse","FETCH_HEAD"]);
const checkoutSha=git(["rev-parse","HEAD"]);
if(!SHA40.test(mainSha)||checkoutSha!==mainSha)fail("CHECKOUT_NOT_CURRENT_MAIN");

try{
 execFileSync(process.execPath,["scripts/ops/phase1-writer-integration-gate.mjs"],{
  stdio:"ignore",timeout:10_000,
 });
}catch{fail("WRITER_INVENTORY_GATE_FAILED")}
let writerInventory;
try{
 writerInventory=JSON.parse(readFileSync(
  "config/phase1-writer-integration.json","utf8"));
}catch{fail("WRITER_INVENTORY_UNAVAILABLE")}
if(writerInventory?.schema!=="geomacro.phase1.d1-writer-integration.v1"||
   writerInventory.account_wide_governor_verified!==true||
   !Array.isArray(writerInventory.producers)||writerInventory.producers.length<10)
 fail("ACCOUNT_WIDE_GOVERNOR_NOT_VERIFIED");

const healthUrl=process.env.CONTROL_PLANE_HEALTH_URL??
 "https://geomacro-control-plane.daspallab202391.workers.dev/health";
if(!/^https:\/\/[a-z0-9.-]+\/health$/u.test(healthUrl))fail("HEALTH_URL_INVALID");
const health=await readBounded(healthUrl);
const deployedSha=health.data.deployed_source_sha;
if(!SHA40.test(String(deployedSha??"")))fail("WORKER_SHA_MISSING");
if(deployedSha!==mainSha)fail("WORKER_MAIN_SHA_MISMATCH");
if(health.data.account_wide_governor_verified!==true)
 fail("LIVE_GOVERNOR_READBACK_FALSE_OR_MISSING");

console.log(JSON.stringify({
 schema:"geomacro.phase1.d1-release-parity.v1",
 verified:true,
 main_sha:mainSha,
 checkout_sha:checkoutSha,
 worker_sha:deployedSha,
 exact_release_sha_parity:true,
 account_wide_governor_verified:true,
 writer_inventory_count:writerInventory.producers.length,
 worker_health_response_sha256:health.sha256,
 funds_authorized:false,
}));
