#!/usr/bin/env node
/**
 * Strict external, zero-funds verification of the *deployed* global switch.
 * Never forwards any credential/payment signature, and never executes capture.
 * This is an acceptance probe only; it cannot activate or disable payment.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const BASE = "https://geomacro.live";
// Pin to the reviewed, actually published security release rather than
// arbitrary later news-ingestion commits. Require that ALL security-sensitive
// sources at checkout still equal that audited ancestor, fail closed on drift.
const manifest = JSON.parse(readFileSync("config/commercial-security-accepted-release.v1.json", "utf8"));
const sha = String(manifest.approved_live_release_sha ?? "").toLowerCase();
if (manifest.schema_version !== "geomacro.commercial-security-accepted-release.v1" ||
    manifest.canonical_repository !== "blocknine0/geomacro" ||
    manifest.freeze_expected !== true ||
    manifest.body_limit_bytes !== 8192 ||
    manifest.paid_write_probe_count !== 14 ||
    !/^[0-9a-f]{40}$/.test(sha))
  throw Error("REVIEWED_SECURITY_RELEASE_MANIFEST_INVALID");
const requiredSecurityPaths = [
  "src/lib/commercial-launch-gate.server.ts",
  "src/lib/central-security.server.ts",
  "server/middleware/00-central-security.ts",
  "workers/control-plane/src/central-security-policies.mjs",
  "src/lib/bounded-commercial-request-body.server.ts",
  "src/lib/mainnet-intelligence-endpoint.server.ts",
  "src/lib/category-intelligence-alias.server.ts",
  "src/routes/api.x402.circle_.intelligence.ts",
  "src/routes/api.x402.nevermined_.intelligence.ts",
  "src/lib/public-paid-output-boundary.ts",
  "src/lib/commercial-access-contract.ts",
];
if (!Array.isArray(manifest.security_source_paths) ||
    manifest.security_source_paths.length !== requiredSecurityPaths.length ||
    !requiredSecurityPaths.every(path => manifest.security_source_paths.includes(path)))
  throw Error("REVIEWED_SECURITY_SOURCE_SCOPE_INVALID");
const optionalCallerSha = process.env.GEOMACRO_PRODUCTION_ACCEPTANCE_SHA?.toLowerCase();
if (optionalCallerSha && optionalCallerSha !== sha)
  throw Error("UNREVIEWED_SECURITY_RELEASE_OVERRIDE_FORBIDDEN");
let securitySourceParityVerified = false;
try {
  execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { stdio:"ignore" });
  execFileSync("git", ["diff", "--quiet", sha, "HEAD", "--",
    ...requiredSecurityPaths], { stdio:"ignore" });
  securitySourceParityVerified = true;
} catch {
  // Do not promote changed or unavailable provenance to an accepted release.
}

function trustedPublishedSecurityLineage(observedSha) {
  if (typeof observedSha !== "string" || !/^[0-9a-f]{40}$/.test(observedSha)) return false;
  try {
    // No unknown, detached or future commit may masquerade as approved live.
    execFileSync("git", ["merge-base", "--is-ancestor", sha, observedSha],
      { stdio: "ignore" });
    execFileSync("git", ["merge-base", "--is-ancestor", observedSha, "HEAD"],
      { stdio: "ignore" });
    execFileSync("git", ["diff", "--quiet", sha, observedSha, "--",
      ...requiredSecurityPaths], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

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
  deployed_security_tree_verified: false,
  approved_security_lineage_mode: "trusted-descendant-identical-security-tree",
  security_source_parity_verified: securitySourceParityVerified,
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
const problems = securitySourceParityVerified ? [] : ["REVIEWED_SECURITY_SOURCE_DRIFT_OR_MISSING_ANCESTOR"];
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
  evidence.deployed_security_tree_verified=trustedPublishedSecurityLineage(evidence.observed_canonical_sha);
  evidence.live_sha_verified=build.status===200 &&
    marker.schema_version==="geomacro.deployment-build.v1" &&
    marker.canonical_repository==="blocknine0/geomacro" &&
    marker.production_activation_performed===false &&
    evidence.deployed_security_tree_verified;
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
