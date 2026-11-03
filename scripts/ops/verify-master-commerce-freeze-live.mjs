#!/usr/bin/env node
/**
 * Strict external, zero-funds verification of the *deployed* global switch.
 * Never forwards any credential/payment signature, and never executes capture.
 * This is an acceptance probe only; it cannot activate or disable payment.
 */
import { mkdir, writeFile } from "node:fs/promises";
const BASE = "https://geomacro.live";
const sha = String(process.env.GEOMACRO_PRODUCTION_ACCEPTANCE_SHA ?? "").toLowerCase();
if (!/^[0-9a-f]{40}$/.test(sha)) throw Error("EXACT_CANONICAL_SHA_REQUIRED");

const PAID_POSTS = [
  "/api/v1/payments/paypal/create-order",
  "/api/v1/payments/paypal/capture-order",
  "/api/v1/payments/crypto/verify",
  "/api/v1/payments/crypto/quote",
  "/api/v1/intelligence/structured-answer",
  "/api/v1/intelligence/query",
  "/api/v1/intelligence/geopolitics",
  "/api/v1/intelligence/macro-fx",
  "/api/v1/intelligence/critical-minerals",
  "/api/x402/intelligence",
  "/api/x402/circle/intelligence",
  "/api/x402/nevermined/intelligence",
  "/api/risk-gate",
  "/api/commercial/structural",
];
const evidence = {
  schema: "geomacro.master-commerce-freeze-live-acceptance.v1",
  checked_at: new Date().toISOString(),
  origin: BASE,
  expected_canonical_sha: sha,
  observed_canonical_sha: null,
  live_sha_verified: false,
  homepage_http_status: 0,
  security_headers_verified: false,
  frozen_routes: [],
  paid_routes_tested: PAID_POSTS.length,
  payment_signatures_sent: 0,
  payment_attempts: 0,
  settlement_attempts: 0,
  configuration_values_logged: false,
  result: "FAIL_CLOSED",
};
async function request(path, method) {
  const response = await fetch(BASE + path, {
    method,
    redirect: "error",
    cache: "no-store",
    headers: { Accept: method === "GET" ? "*/*" : "application/json",
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      "User-Agent": "GeomacroSecurityFreezeAcceptance/1.0" },
    ...(method === "POST" ? { body: "{}" } : {}),
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > 131072)
    throw Error("PROBE_RESPONSE_TOO_LARGE");
  return {status:response.status,headers:response.headers,body};
}
const problems=[];
try {
  const home=await request("/","GET");
  evidence.homepage_http_status=home.status;
  if(home.status!==200)problems.push("HOMEPAGE_NOT_200");
  const xfo=home.headers.get("x-frame-options");
  const referrer=home.headers.get("referrer-policy");
  const nosniff=home.headers.get("x-content-type-options");
  evidence.security_headers_verified=xfo==="DENY" &&
    referrer==="strict-origin-when-cross-origin" && nosniff==="nosniff";
  if(!evidence.security_headers_verified)problems.push("SECURITY_HEADERS_NOT_APPLIED");
  const build=await request("/.well-known/geomacro-build.json","GET");
  let marker;
  try{marker=JSON.parse(build.body);}catch{marker={};}
  evidence.observed_canonical_sha=typeof marker.canonical_main_sha==="string"
    ? marker.canonical_main_sha : null;
  evidence.live_sha_verified=build.status===200 &&
    marker.schema_version==="geomacro.deployment-build.v1" &&
    marker.canonical_repository==="blocknine0/geomacro" &&
    marker.canonical_main_sha===sha &&
    marker.production_activation_performed===false;
  if(!evidence.live_sha_verified)problems.push("DEPLOYED_SHA_MISMATCH");
  for(const path of PAID_POSTS) {
    let status=0,freeze_error=false,no_store=false;
    try {
      const result=await request(path,"POST");
      status=result.status;
      freeze_error=result.body.includes("GEOMACRO_COMMERCE_EMERGENCY_FREEZE_ACTIVE");
      no_store=(result.headers.get("cache-control") ?? "").includes("no-store");
    } catch { problems.push("NETWORK_OR_BODY_FAILURE:"+path); }
    evidence.frozen_routes.push({path,http_status:status,freeze_error,no_store});
    if(status!==423 || !freeze_error || !no_store)
      problems.push("FREEZE_NOT_PROVEN:"+path);
  }
} catch(error) {
  problems.push("PROBE_FAILED:"+(error instanceof Error?error.message:"unknown"));
}
evidence.failures=problems;
evidence.result=problems.length===0?"PASS":"FAIL_CLOSED";
await mkdir("artifacts/commerce",{recursive:true});
await writeFile("artifacts/commerce/master-freeze-live.json",
  JSON.stringify(evidence,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(evidence));
if(problems.length) process.exitCode=1;
