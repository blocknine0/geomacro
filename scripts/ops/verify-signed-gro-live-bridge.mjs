#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { classifySignedGroLiveBridge } from "../lib/signed-gro-live-bridge-evidence.mjs";

const OUTPUT = "artifacts/signed-gro-live-bridge/bridge-evidence.json";
const CANDIDATE = "artifacts/signed-gro-live-bridge/backend-country-canary.json";
const URL = "https://geomacro.live/api/x402/risk/availability";
const body = {
  schema_version: "geomacro.agent-query.v1",
  subjects: [{type:"country", country_iso3:"USA"}],
  topics: ["risk_object"],
  evidence: "required",
  detail: "compact",
};
let backend;
try { backend = JSON.parse(readFileSync(CANDIDATE, "utf8")); }
catch { throw new Error("SIGNED_GRO_BACKEND_CANARY_NOT_VERIFIED"); }
let response;
try {
  response = await fetch(URL, {
    method:"POST",
    headers: {
      "content-type":"application/json",
      accept:"application/json",
      "cache-control":"no-cache",
    },
    body:JSON.stringify(body),
    redirect:"error",
    signal:AbortSignal.timeout(20_000),
  });
} catch {
  throw new Error("SIGNED_GRO_BRIDGE_SITE_REQUEST_FAILED");
}
if (response.status !== 200 && response.status !== 422) {
  throw new Error("SIGNED_GRO_BRIDGE_SITE_UNEXPECTED_HTTP_STATUS");
}
let parsed;
try {
  const data = await response.text();
  if (data.length > 64 * 1024) throw new Error("body too large");
  parsed = JSON.parse(data);
} catch {
  throw new Error("SIGNED_GRO_BRIDGE_SITE_BODY_INVALID");
}
const receipt = classifySignedGroLiveBridge({
  backendCanary: backend, status:response.status, body:parsed,
});
mkdirSync("artifacts/signed-gro-live-bridge",{recursive:true});
writeFileSync(OUTPUT, JSON.stringify(receipt,null,2)+"\n",{mode:0o600});
console.log(JSON.stringify(receipt));
if (receipt.outcome !== "LIVE_TESTNET_NO_CHARGE_AVAILABLE") {
  process.exitCode = 3; // Backend source good, site contract not yet available.
}
